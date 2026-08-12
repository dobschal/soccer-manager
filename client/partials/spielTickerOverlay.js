import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { el, generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'
import { maybeRequestReviewAfterWin } from '../lib/nativeReview.js'
import { renderEmblem } from './emblem.js'
import { renderPlayerImage } from './playerImage.js'

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
 * A duel only makes the ticker when it broke up a spell of possession this
 * long. A match logs ~230 duels; without a bar like this the ticker would be
 * nothing but tackles (#539).
 */
export const RECOVERY_MIN_STREAK = 3

/** …and at most one recovery per this many minutes, so they stay an accent. */
export const RECOVERY_MIN_GAP_MINUTES = 5

/**
 * A won duel needs an even longer move behind it than a recovery to be worth a
 * line — the attacking side wins most duels, so the bar has to be higher or the
 * feed fills up with them (#539).
 */
export const DUEL_MIN_STREAK = 6

/** …and at most one won duel per this many minutes. */
export const DUEL_MIN_GAP_MINUTES = 12

/** Half time sits between the 45th and 46th minute. */
export const HALF_TIME_MINUTE = 45

/** Regular time ends here; anything later is extra time. */
export const REGULAR_TIME_MINUTE = 90

/**
 * Pick the ball recoveries worth showing: a duel won by the defending side
 * (`lostBall`) that ended a passing move of at least {@link RECOVERY_MIN_STREAK}
 * passes, thinned out to one per {@link RECOVERY_MIN_GAP_MINUTES} minutes.
 *
 * Games played before the engine started stamping duels with a minute simply
 * contribute none — same self-healing approach as {@link logHasMinutes}.
 * @param {Array} log
 * @returns {Array}
 */
export function pickRecoveries (log) {
  return pickDuels(log, {
    lostBall: true,
    minStreak: RECOVERY_MIN_STREAK,
    minGap: RECOVERY_MIN_GAP_MINUTES,
    flag: 'recovery'
  })
}

/**
 * Pick the duels the attacking side *won* — a tackle shrugged off in the middle
 * of a move. Same thinning as {@link pickRecoveries}, with a higher bar because
 * the attacker wins most duels (#539).
 * @param {Array} log
 * @returns {Array}
 */
export function pickWonDuels (log) {
  return pickDuels(log, {
    lostBall: false,
    minStreak: DUEL_MIN_STREAK,
    minGap: DUEL_MIN_GAP_MINUTES,
    flag: 'wonDuel'
  })
}

/**
 * Shared sampler for the two duel flavours: keep the duels that ended a move of
 * at least `minStreak` passes, then thin them to one per `minGap` minutes.
 *
 * Games played before the engine started stamping duels with a minute simply
 * contribute none — same self-healing approach as {@link logHasMinutes}.
 * @param {Array} log
 * @param {{lostBall: boolean, minStreak: number, minGap: number, flag: string}} options
 * @returns {Array}
 */
function pickDuels (log, { lostBall, minStreak, minGap, flag }) {
  const candidates = log
    .filter(l => l.lostBall === lostBall && typeof l.minute === 'number' && (l.streak ?? 0) >= minStreak)
    .sort((a, b) => a.minute - b.minute || (b.streak ?? 0) - (a.streak ?? 0))
  const picked = []
  let lastMinute = -minGap
  for (const entry of candidates) {
    if (entry.minute - lastMinute < minGap) continue
    lastMinute = entry.minute
    picked.push({ ...entry, [flag]: true })
  }
  return picked
}

/**
 * Build the chronologically sorted list of notable events from a game's detail
 * log (#402): goals, cards and saves, plus — since #539 — the kick-off, the
 * half-time break, injuries, substitutions, standout ball recoveries and won
 * duels, and the start of extra time.
 *
 * @param {Array} log
 * @param {{injuries?: Array, substitutions?: Array, extraTime?: boolean, penaltyShootout?: object}} [details]
 * @returns {Array}
 */
export function buildTickerEvents (log, details = {}) {
  if (!Array.isArray(log)) return []
  const notable = log
    .filter(l => l.goal || l.yellowCard || l.redCard || l.keeperHolds)
    .map(l => ({ ...l, minute: l.minute ?? 0 }))

  const injuries = (details.injuries || [])
    .filter(i => typeof i.minute === 'number')
    .map(i => ({ injury: true, player: i.playerId, playerName: i.playerName, injuryType: i.injuryType, injuryDays: i.injuryDays, minute: i.minute, teamIndex: i.teamIndex }))

  const substitutions = (details.substitutions || [])
    .filter(s => typeof s.minute === 'number')
    .map(s => ({
      substitution: true,
      player: s.playerInId,
      playerName: s.playerInName,
      playerOut: s.playerOutId,
      playerOutName: s.playerOutName,
      reason: s.reason,
      minute: s.minute,
      teamIndex: s.teamIndex
    }))

  const events = [
    ...notable,
    ...injuries,
    ...substitutions,
    ...pickRecoveries(log),
    ...pickWonDuels(log)
  ]

  // Breaks are placed on the boundary and sorted with `order` so they land
  // after everything that happened in the minute they close.
  const lastMinute = events.reduce((max, e) => Math.max(max, e.minute), 0)
  if (lastMinute > HALF_TIME_MINUTE) {
    events.push({ halfTime: true, minute: HALF_TIME_MINUTE, order: 1 })
  }
  if (details.extraTime) {
    events.push({ extraTimeStart: true, minute: REGULAR_TIME_MINUTE, order: 1 })
  }
  // A negative order keeps the kick-off ahead of anything logged in minute 0.
  events.push({ kickOff: true, minute: 0, order: -1 })

  events.sort((a, b) => a.minute - b.minute || (a.order ?? 0) - (b.order ?? 0))

  // The shootout has no minute of its own — it always closes the match.
  if (details.penaltyShootout) {
    events.push({ penaltyShootout: true, shootout: details.penaltyShootout, minute: lastMinute })
  }
  return events
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

export function eventType (event) {
  if (event.kickOff) return 'kickOff'
  if (event.halfTime) return 'halfTime'
  if (event.extraTimeStart) return 'extraTime'
  if (event.penaltyShootout) return 'penalties'
  if (event.goal) return 'goal'
  if (event.redCard) return 'red'
  if (event.yellowCard) return 'yellow'
  if (event.injury) return 'injury'
  if (event.substitution) return 'substitution'
  if (event.recovery) return 'recovery'
  if (event.wonDuel) return 'duel'
  return 'chance'
}

/**
 * Events that interrupt the match rather than happening inside it. They have
 * no player, no team side and stretch across the full width of the feed.
 * @param {string} type
 * @returns {boolean}
 */
export function isBreakEvent (type) {
  return type === 'kickOff' || type === 'halfTime' || type === 'extraTime' || type === 'penalties'
}

/**
 * The name of the injury a player picked up, e.g. "Muskelzerrung", plus how long
 * they are out (#539). Older games stored no type — those fall back to the
 * duration alone.
 * @param {{injuryType?: string, injuryDays?: number}} event
 * @returns {string}
 */
export function injuryDetail (event) {
  const days = event.injuryDays ?? 0
  if (!event.injuryType) return t('spielTicker.injuryDetail', { days })
  // The engine stores the raw type key; play-game-day already localises it for
  // log messages, so a already-translated value can arrive here too. Falling
  // back to the raw value keeps both shapes readable.
  const key = `injury.${event.injuryType}`
  const name = t(key)
  return t('spielTicker.injuryDetailNamed', {
    injury: name === key ? event.injuryType : name,
    days
  })
}

/**
 * The reason a card was shown, as far as the match data actually supports it:
 * a second booking, a straight red, or the foul that earned it. Nothing is
 * invented — the engine does not model foul types (#539).
 * @param {object} event
 * @param {Record<number, object>} players
 * @returns {string}
 */
export function cardReason (event, players) {
  if (event.redCard && event.secondYellow) return t('spielTicker.reasonSecondYellow')
  const fouled = event.foulOn ? players[event.foulOn] : null
  if (fouled) return t('spielTicker.reasonFoulOn', { player: fouled.name })
  return event.redCard ? t('spielTicker.reasonStraightRed') : t('spielTicker.reasonFoul')
}

/**
 * The icon shown in front of a ticker row, per event type (#539).
 *
 * The two ball-fight flavours are deliberately distinct: a duel is two players
 * contesting the ball (two figures), a recovery is possession changing sides
 * (arrows swapping direction). Reusing one icon for both made them unreadable.
 * @type {Record<string, string>}
 */
export const EVENT_ICONS = {
  goal: '<span class="badge bg-success"><i class="fa fa-futbol-o"></i></span>',
  red: '<span class="spiel-ticker__card spiel-ticker__card--red"></span>',
  yellow: '<span class="spiel-ticker__card spiel-ticker__card--yellow"></span>',
  chance: '<span class="text-info"><i class="fa fa-bullseye"></i></span>',
  injury: '<span class="text-danger"><i class="fa fa-medkit"></i></span>',
  recovery: '<span class="text-warning"><i class="fa fa-exchange"></i></span>',
  duel: '<span class="text-info"><i class="fa fa-users"></i></span>',
  substitution: '<span class="text-success"><i class="fa fa-refresh"></i></span>'
}

/** Edge length of the player portrait in a ticker row — roughly text height. */
const PORTRAIT_SIZE = 22

/**
 * Drop a small portrait of the player into a freshly inserted ticker row
 * (#539). Rendering the SVG is async, so the row goes up immediately and the
 * portrait arrives a tick later; a row without a known player keeps its empty
 * placeholder so the layout does not shift.
 * @param {HTMLElement} row
 * @param {object|undefined} player
 * @returns {Promise<void>}
 */
async function fillPortrait (row, player) {
  if (!player) return
  const slot = row.querySelector('.spiel-ticker__portrait')
  if (!slot) return
  try {
    slot.innerHTML = await renderPlayerImage(player, player.team, PORTRAIT_SIZE)
  } catch {
    // A missing portrait is cosmetic — the row still reads fine without it.
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

    /**
     * A break in play (half time, extra time, shootout): full width, no player.
     * @param {object} event
     * @param {string} type
     * @returns {HTMLElement}
     */
    const buildBreakRow = (event, type) => {
      const row = document.createElement('div')
      row.className = `spiel-ticker__event spiel-ticker__event--break spiel-ticker__event--${type}`
      if (type === 'penalties') {
        const shootout = event.shootout || {}
        const shots = (shootout.shots || [])
          .map(shot => `<span class="spiel-ticker__penalty ${shot.scored ? 'is-scored' : 'is-missed'}"
                              title="${shot.playerName || ''}">${shot.scored ? '●' : '○'}</span>`)
          .join('')
        row.innerHTML = `
          <span class="spiel-ticker__detail">
            <strong>${t('spielTicker.penaltyShootout')}</strong>
            <span class="spiel-ticker__penalties">${shots}</span>
            <small class="text-muted">${shootout.goalsTeamA ?? 0} : ${shootout.goalsTeamB ?? 0}</small>
          </span>
        `
        return row
      }
      const label = {
        kickOff: t('spielTicker.kickOff'),
        halfTime: t('spielTicker.halfTime'),
        extraTime: t('spielTicker.extraTime')
      }[type] ?? ''
      row.innerHTML = `<span class="spiel-ticker__detail"><strong>${label}</strong></span>`
      return row
    }

    const renderEvent = (event) => {
      const feed = el('#' + feedId)
      if (!feed) return
      const type = eventType(event)

      if (isBreakEvent(type)) {
        feed.insertBefore(buildBreakRow(event, type), feed.firstChild)
        feed.scrollTop = 0
        return
      }

      // A recovery is credited to the player who won the ball, not the one who
      // lost it.
      const playerId = type === 'recovery' ? event.oponentPlayer : event.player
      const player = players[playerId]
      const isHome = player?.team1
      if (event.goal) {
        if (isHome) homeScore++
        else awayScore++
        const scoreEl = el('#' + scoreId)
        if (scoreEl) scoreEl.textContent = `${homeScore} : ${awayScore}`
        showGoalBanner()
      }
      const icon = EVENT_ICONS[type]
      const label = {
        goal: t('spielTicker.goal'),
        red: t('spielTicker.redCard'),
        yellow: t('spielTicker.yellowCard'),
        chance: t('spielTicker.chance'),
        injury: t('spielTicker.injury'),
        recovery: t('spielTicker.ballRecovery'),
        duel: t('spielTicker.wonDuel'),
        substitution: t('spielTicker.substitution')
      }[type]
      let detail = label
      if (type === 'yellow' || type === 'red') {
        detail = `${label} — ${cardReason(event, players)}`
      } else if (type === 'injury') {
        detail = injuryDetail(event)
      } else if (type === 'recovery' && players[event.player]) {
        detail = t('spielTicker.ballRecoveryFrom', { player: players[event.player].name })
      } else if (type === 'duel' && players[event.oponentPlayer]) {
        detail = t('spielTicker.wonDuelAgainst', { player: players[event.oponentPlayer].name })
      } else if (type === 'substitution') {
        const out = players[event.playerOut]?.name || event.playerOutName
        if (out) detail = t('spielTicker.substitutionFor', { player: out })
      }
      const name = player?.name || event.playerName || t('spielTicker.unknownPlayer')
      const row = document.createElement('div')
      row.className = `spiel-ticker__event spiel-ticker__event--${type} ${isHome ? 'spiel-ticker__event--home' : 'spiel-ticker__event--away'}`
      row.innerHTML = `
        <span class="spiel-ticker__minute">${event.minute}'</span>
        ${icon}
        <span class="spiel-ticker__portrait" data-portrait-player="${playerId ?? ''}"></span>
        <span class="spiel-ticker__detail"><strong>${name}</strong> <small class="text-muted">${detail}</small></span>
      `
      // Newest entry on top — existing items slide down.
      feed.insertBefore(row, feed.firstChild)
      feed.scrollTop = 0
      void fillPortrait(row, player)
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
