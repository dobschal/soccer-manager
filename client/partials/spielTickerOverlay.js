import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'
import { maybeRequestReviewAfterWin } from '../lib/nativeReview.js'
import { renderEmblem } from './emblem.js'

const STEP_INTERVAL_MS = 2000
const GOAL_BANNER_MS = 1500

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
 * Build the chronologically sorted list of notable events (goals, cards and
 * goal chances/saves) from a game's detail log (#402).
 * @param {Array} log
 * @returns {Array}
 */
export function buildTickerEvents (log) {
  if (!Array.isArray(log)) return []
  return log
    .filter(l => l.goal || l.yellowCard || l.redCard || l.keeperHolds)
    .map(l => ({ ...l, minute: l.minute ?? 0 }))
    .sort((a, b) => a.minute - b.minute)
}

/**
 * Whether a game's detail log carries per-event minutes. Games played before
 * minute tracking was deployed have notable events without any `minute`, which
 * would render the whole ticker at 0' in arbitrary order. Such games are
 * skipped until they are replayed by the current engine (which stamps every
 * event with a minute).
 * @param {Array} log
 * @returns {boolean}
 */
export function logHasMinutes (log) {
  if (!Array.isArray(log)) return false
  return log.some(l =>
    (l.goal || l.yellowCard || l.redCard || l.keeperHolds) && typeof l.minute === 'number')
}

function eventType (event) {
  if (event.goal) return 'goal'
  if (event.redCard) return 'red'
  if (event.yellowCard) return 'yellow'
  return 'chance'
}

/**
 * Show an animated match-ticker overlay for the given game and resolve once it
 * is closed (#402). The events (chances, cards, goals) are revealed one after
 * another; the user can skip the animation or close the overlay at any time.
 *
 * @param {{id: number, season?: number, gameDay?: number}} game
 * @param {number} myTeamId
 * @returns {Promise<void>}
 */
export async function showSpielTickerOverlay (game, myTeamId) {
  let result, details
  try {
    const response = await server.getResult(game.id)
    result = response.result
    if (!result || result.isForfeit || !result.details || result.details === '{}') return
    details = JSON.parse(result.details)
  } catch {
    return
  }
  // Skip games whose log predates minute tracking — every event would show at
  // 0' in arbitrary order. These self-heal from the next game day onwards.
  if (!logHasMinutes(details?.log)) return
  const events = buildTickerEvents(details?.log)
  if (events.length === 0) return

  const [team1Res, team2Res] = await Promise.all([
    server.getTeam(result.team1Id),
    server.getTeam(result.team2Id)
  ])
  const players = {}
  ;(team1Res.players || []).forEach(p => { p.team1 = true; players[p.id] = p })
  ;(team2Res.players || []).forEach(p => { p.team2 = true; players[p.id] = p })

  const myTeamIsHome = result.team1Id === myTeamId
  const myGoals = myTeamIsHome ? result.goalsTeam1 : result.goalsTeam2
  const oppGoals = myTeamIsHome ? result.goalsTeam2 : result.goalsTeam1
  const didWin = typeof myGoals === 'number' && typeof oppGoals === 'number' && myGoals > oppGoals

  const skipId = generateId()
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
      const player = players[event.player]
      const isHome = player?.team1
      const type = eventType(event)
      if (event.goal) {
        if (isHome) homeScore++
        else awayScore++
        const scoreEl = el('#' + scoreId)
        if (scoreEl) scoreEl.textContent = `${homeScore} : ${awayScore}`
        showGoalBanner()
      }
      const icon = {
        goal: '<span class="badge bg-success"><i class="fa fa-futbol-o"></i></span>',
        red: '<span class="spiel-ticker__card spiel-ticker__card--red"></span>',
        yellow: '<span class="spiel-ticker__card spiel-ticker__card--yellow"></span>',
        chance: '<span class="text-info"><i class="fa fa-bullseye"></i></span>'
      }[type]
      const label = {
        goal: t('spielTicker.goal'),
        red: t('spielTicker.redCard'),
        yellow: t('spielTicker.yellowCard'),
        chance: t('spielTicker.chance')
      }[type]
      const row = document.createElement('div')
      row.className = `spiel-ticker__event spiel-ticker__event--${type} ${isHome ? 'spiel-ticker__event--home' : 'spiel-ticker__event--away'}`
      row.innerHTML = `
        <span class="spiel-ticker__minute">${event.minute}'</span>
        ${icon}
        <span class="spiel-ticker__detail"><strong>${player?.name || t('spielTicker.unknownPlayer')}</strong> <small class="text-muted">${label}</small></span>
      `
      // Newest entry on top — existing items slide down.
      feed.insertBefore(row, feed.firstChild)
      feed.scrollTop = 0
    }

    const finish = () => {
      if (finished) return
      finished = true
      if (timer) { clearTimeout(timer); timer = null }
      const scoreEl = el('#' + scoreId)
      if (scoreEl) scoreEl.textContent = `${result.goalsTeam1} : ${result.goalsTeam2}`
      const skipBtn = el('#' + skipId)
      if (skipBtn) skipBtn.remove()
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
      renderEvent(events[index])
      index++
      timer = setTimeout(tick, STEP_INTERVAL_MS)
    }

    const skip = () => {
      if (timer) { clearTimeout(timer); timer = null }
      while (index < events.length) {
        renderEvent(events[index])
        index++
      }
      finish()
    }

    setTimeout(() => {
      const skipBtn = el('#' + skipId)
      if (skipBtn) skipBtn.addEventListener('click', skip)
      tick()
    }, 0)

    overlay.onClose(() => {
      if (timer) { clearTimeout(timer); timer = null }
      if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null }
      resolve()
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
  markSpielTickerSeen(season, gameDay, lastGame.id)
  await showSpielTickerOverlay(lastGame, myTeamId)
  return true
}
