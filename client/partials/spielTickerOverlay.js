import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'
import { maybeRequestReviewAfterWin } from '../lib/nativeReview.js'

const STEP_INTERVAL_MS = 1300

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

  const content = `
    <div class="spiel-ticker">
      <div class="spiel-ticker__scoreboard">
        <span class="spiel-ticker__team spiel-ticker__team--home">${result.team1}</span>
        <span id="${scoreId}" class="spiel-ticker__score">0 : 0</span>
        <span class="spiel-ticker__team spiel-ticker__team--away">${result.team2}</span>
      </div>
      <div id="${feedId}" class="spiel-ticker__feed" aria-live="polite"></div>
      <div class="text-center mt-3">
        <button type="button" id="${skipId}" class="btn btn-sm btn-outline-info spiel-ticker__skip">
          <i class="fa fa-forward"></i> ${t('spielTicker.skip')}
        </button>
      </div>
    </div>
  `

  return new Promise(resolve => {
    const overlay = showOverlay(t('spielTicker.title'), result.team1 + ' – ' + result.team2, content)

    let homeScore = 0
    let awayScore = 0
    let index = 0
    let timer = null
    let finished = false

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
      feed.appendChild(row)
      feed.scrollTop = feed.scrollHeight
    }

    const finish = () => {
      if (finished) return
      finished = true
      if (timer) { clearTimeout(timer); timer = null }
      const scoreEl = el('#' + scoreId)
      if (scoreEl) scoreEl.textContent = `${result.goalsTeam1} : ${result.goalsTeam2}`
      const skipBtn = el('#' + skipId)
      if (skipBtn) skipBtn.remove()
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
