import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'
import { maybeRequestReviewAfterWin } from '../lib/nativeReview.js'
import { renderEmblem } from './emblem.js'
import {
  buildTickerEvents, buildTickerRow, eventType, fillTickerPortraits, isBreakEvent, logHasMinutes
} from '../lib/tickerEvents.js'

// Re-exported so the ticker stays the one place other code (and its tests) reach
// for match-event helpers, even though the logic itself is shared with the game
// details overlay now.
export {
  buildTickerEvents, buildTickerRow, cardReason, eventType, injuryDetail, isBreakEvent,
  logHasMinutes, pickRecoveries, pickWonDuels, EVENT_ICONS,
  DUEL_MIN_GAP_MINUTES, DUEL_MIN_STREAK, HALF_TIME_MINUTE, REGULAR_TIME_MINUTE,
  RECOVERY_MIN_GAP_MINUTES, RECOVERY_MIN_STREAK
} from '../lib/tickerEvents.js'

const STEP_INTERVAL_MS = 2000
const GOAL_BANNER_MS = 1500
/** How long the half-time / extra-time card holds before play resumes (#539). */
const BREAK_PAUSE_MS = 2000

function seenKey (season, gameDay, gameId) {
  return `spielTickerSeen_${season}_${gameDay}_${gameId}`
}

/**
 * Whether the animated ticker for this game was already shown on this device.
 * @param {number} season
 * @param {number} gameDay
 * @param {number} gameId
 * @returns {boolean}
 */
export function isSpielTickerSeen (season, gameDay, gameId) {
  try {
    return window.localStorage.getItem(seenKey(season, gameDay, gameId)) === '1'
  } catch {
    return false
  }
}

function markSpielTickerSeen (season, gameDay, gameId) {
  try {
    window.localStorage.setItem(seenKey(season, gameDay, gameId), '1')
  } catch {
    // ignore storage failures
  }
}

/**
 * Show an animated match-ticker overlay for the given game and resolve once it
 * is closed (#402). The events (chances, cards, goals) are revealed one after
 * another; the user can skip the animation or close the overlay at any time.
 *
 * @param {{id: number, season?: number, gameDay?: number}} game
 * @param {number} myTeamId
 * @returns {Promise<boolean>} whether the overlay was actually shown
 */
export async function showSpielTickerOverlay (game, myTeamId) {
  let result, details
  try {
    const response = await server.getResult(game.id)
    result = response.result
    if (!result || result.isForfeit || !result.details || result.details === '{}') return false
    details = JSON.parse(result.details)
  } catch {
    return false
  }
  // Skip games whose log predates minute tracking — every event would show at
  // 0' in arbitrary order. These self-heal from the next game day onwards.
  if (!logHasMinutes(details?.log)) return false
  const events = buildTickerEvents(details?.log, details || {})
  if (events.length === 0) return false

  const [team1Res, team2Res] = await Promise.all([
    server.getTeam(result.team1Id),
    server.getTeam(result.team2Id)
  ])
  const players = {}
  // `team` rides along on each player so the portrait can be tinted in the
  // right shirt colour without another lookup per row.
  ;(team1Res.players || []).forEach(p => { p.team1 = true; p.team = team1Res.team; players[p.id] = p })
  ;(team2Res.players || []).forEach(p => { p.team2 = true; p.team = team2Res.team; players[p.id] = p })

  const myTeamIsHome = result.team1Id === myTeamId
  const myGoals = myTeamIsHome ? result.goalsTeam1 : result.goalsTeam2
  const oppGoals = myTeamIsHome ? result.goalsTeam2 : result.goalsTeam1
  const didWin = typeof myGoals === 'number' && typeof oppGoals === 'number' && myGoals > oppGoals

  const skipId = generateId()
  const speedId = generateId()
  const feedId = generateId()
  const scoreId = generateId()
  const bannerId = generateId()

  const content = `
    <div class="spiel-ticker">
      <div class="spiel-ticker__scoreboard">
        <span class="spiel-ticker__team spiel-ticker__team--home">
          <span class="spiel-ticker__emblem">${team1Res.team ? renderEmblem(team1Res.team, 28) : ''}</span>
          <span class="spiel-ticker__team-name">${result.team1}</span>
        </span>
        <span id="${scoreId}" class="spiel-ticker__score">0 : 0</span>
        <span class="spiel-ticker__team spiel-ticker__team--away">
          <span class="spiel-ticker__emblem">${team2Res.team ? renderEmblem(team2Res.team, 28) : ''}</span>
          <span class="spiel-ticker__team-name">${result.team2}</span>
        </span>
      </div>
      <div id="${feedId}" class="spiel-ticker__feed" aria-live="polite"></div>
      <div class="text-center mt-3 spiel-ticker__footer">
        <button type="button" id="${speedId}" class="btn btn-sm btn-outline-info spiel-ticker__speed"
                aria-pressed="false" title="${t('spielTicker.speedHint')}">
          <i class="fa fa-tachometer"></i> ${t('spielTicker.speedNormal')}
        </button>
        <button type="button" id="${skipId}" class="btn btn-sm btn-outline-info spiel-ticker__skip">
          <i class="fa fa-forward"></i> ${t('spielTicker.skip')}
        </button>
      </div>
      <div id="${bannerId}" class="spiel-ticker__goal-banner">${t('spielTicker.goalBanner')}</div>
    </div>
  `

  return new Promise(resolve => {
    const overlay = showOverlay(t('spielTicker.title'), result.team1 + ' – ' + result.team2, content)

    let homeScore = 0
    let awayScore = 0
    let index = 0
    let timer = null
    let finished = false
    // Playback rate: 1 = normal, 2 = double speed (#539). Applied to the wait
    // *after* each event, so toggling takes effect from the next beat onwards.
    let speed = 1

    let bannerTimer = null
    const showGoalBanner = () => {
      const banner = el('#' + bannerId)
      if (!banner) return
      banner.classList.remove('show')
      // Force reflow so the animation restarts even on back-to-back goals.
      void banner.offsetWidth
      banner.classList.add('show')
      if (bannerTimer) clearTimeout(bannerTimer)
      bannerTimer = setTimeout(() => banner.classList.remove('show'), GOAL_BANNER_MS)
    }

    const renderEvent = (event) => {
      const feed = el('#' + feedId)
      if (!feed) return
      const { className, html, isBreak, player } = buildTickerRow(event, players)

      if (!isBreak && event.goal) {
        if (player?.team1) homeScore++
        else awayScore++
        const scoreEl = el('#' + scoreId)
        if (scoreEl) scoreEl.textContent = `${homeScore} : ${awayScore}`
        showGoalBanner()
      }

      const row = document.createElement('div')
      row.className = className
      row.innerHTML = html
      // Newest entry on top — existing items slide down.
      feed.insertBefore(row, feed.firstChild)
      feed.scrollTop = 0
      if (!isBreak) void fillTickerPortraits(row, players)
    }

    const finish = () => {
      if (finished) return
      finished = true
      if (timer) { clearTimeout(timer); timer = null }
      const scoreEl = el('#' + scoreId)
      if (scoreEl) scoreEl.textContent = `${result.goalsTeam1} : ${result.goalsTeam2}`
      const skipBtn = el('#' + skipId)
      if (skipBtn) skipBtn.remove()
      const speedBtn = el('#' + speedId)
      if (speedBtn) speedBtn.remove()
      // Dedicated final-score entry at the very top.
      const feed = el('#' + feedId)
      if (feed) {
        const finalRow = document.createElement('div')
        finalRow.className = 'spiel-ticker__event spiel-ticker__event--final'
        finalRow.innerHTML = `
          <span class="spiel-ticker__detail"><strong>${t('spielTicker.finalScore', { score: `${result.goalsTeam1} : ${result.goalsTeam2}` })}</strong></span>
        `
        feed.insertBefore(finalRow, feed.firstChild)
        feed.scrollTop = 0
      }
      if (didWin) maybeRequestReviewAfterWin(true)
    }

    const tick = () => {
      if (index >= events.length) {
        finish()
        return
      }
      const event = events[index]
      renderEvent(event)
      index++
      // A break is a beat of its own — the whistle goes, then the second half
      // starts (#539).
      const wait = isBreakEvent(eventType(event)) ? BREAK_PAUSE_MS : STEP_INTERVAL_MS
      timer = setTimeout(tick, wait / speed)
    }

    const skip = () => {
      if (timer) { clearTimeout(timer); timer = null }
      while (index < events.length) {
        renderEvent(events[index])
        index++
      }
      finish()
    }

    /**
     * Flip between normal and double speed. The pending wait is restarted at the
     * new rate so the change is felt immediately instead of after the current
     * (possibly 2s) beat (#539).
     * @returns {void}
     */
    const toggleSpeed = () => {
      speed = speed === 1 ? 2 : 1
      const btn = el('#' + speedId)
      if (btn) {
        btn.setAttribute('aria-pressed', String(speed === 2))
        btn.classList.toggle('active', speed === 2)
        btn.innerHTML = `<i class="fa fa-tachometer"></i> ${speed === 2 ? t('spielTicker.speedFast') : t('spielTicker.speedNormal')}`
      }
      if (timer && !finished) {
        clearTimeout(timer)
        timer = setTimeout(tick, STEP_INTERVAL_MS / speed)
      }
    }

    setTimeout(() => {
      const skipBtn = el('#' + skipId)
      if (skipBtn) skipBtn.addEventListener('click', skip)
      const speedBtn = el('#' + speedId)
      if (speedBtn) speedBtn.addEventListener('click', toggleSpeed)
      tick()
    }, 0)

    overlay.onClose(() => {
      if (timer) { clearTimeout(timer); timer = null }
      if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null }
      resolve(true)
    })
  })
}

/**
 * Show the animated ticker for the user's most recent played game, once per
 * game day per device. Returns true when an overlay was shown (#402).
 * @param {{season: number, gameDay: number, myTeamId: number, lastGame: object|null}} params
 * @returns {Promise<boolean>}
 */
export async function maybeShowSpielTickerOverlay ({ season, gameDay, myTeamId, lastGame }) {
  if (!lastGame || !lastGame.id) return false
  if (isSpielTickerSeen(season, gameDay, lastGame.id)) return false
  // Mark seen only when the ticker was actually shown. Otherwise a game that
  // can't render one (forfeit, empty log, pre-minute-tracking) would burn the
  // per-day flag and suppress a retry once a renderable game is available.
  const shown = await showSpielTickerOverlay(lastGame, myTeamId)
  if (shown) markSpielTickerSeen(season, gameDay, lastGame.id)
  return shown
}
