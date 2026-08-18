import { t } from '../i18n/index.js'
import { renderPlayerImage } from '../partials/playerImage.js'

/**
 * Shared match-ticker logic: which entries of a game's detail log are worth
 * showing, and how a single ticker row looks.
 *
 * Both surfaces that show match events use this module so they can never drift
 * apart (#539): the animated overlay (`partials/spielTickerOverlay.js`) and the
 * "Match Events" card inside the game details overlay
 * (`partials/gameDetails.js`).
 */

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

/** Edge length of the player portrait in a ticker row — roughly text height. */
export const PORTRAIT_SIZE = 22

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

/**
 * @param {object} event
 * @returns {string}
 */
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

/**
 * The player a ticker row is about. A recovery is credited to the player who
 * won the ball, not the one who lost it.
 * @param {object} event
 * @param {string} [type]
 * @returns {number|undefined}
 */
export function tickerRowPlayerId (event, type = eventType(event)) {
  return type === 'recovery' ? event.oponentPlayer : event.player
}

/**
 * The sentence that follows the player's name in a ticker row.
 * @param {object} event
 * @param {Record<number, object>} players
 * @param {string} [type]
 * @returns {string}
 */
export function tickerRowDetail (event, players, type = eventType(event)) {
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
  if (type === 'yellow' || type === 'red') {
    return `${label} — ${cardReason(event, players)}`
  }
  if (type === 'injury') return injuryDetail(event)
  if (type === 'recovery' && players[event.player]) {
    return t('spielTicker.ballRecoveryFrom', { player: players[event.player].name })
  }
  if (type === 'duel' && players[event.oponentPlayer]) {
    return t('spielTicker.wonDuelAgainst', { player: players[event.oponentPlayer].name })
  }
  if (type === 'substitution') {
    const out = players[event.playerOut]?.name || event.playerOutName
    if (out) return t('spielTicker.substitutionFor', { player: out })
  }
  return label
}

/**
 * Markup for a break row (kick-off, half time, extra time, shootout): full
 * width, no player, no minute.
 * @param {object} event
 * @param {string} type
 * @returns {string}
 */
function breakRowHtml (event, type) {
  if (type === 'penalties') {
    const shootout = event.shootout || {}
    const shots = (shootout.shots || [])
      .map(shot => `<span class="spiel-ticker__penalty ${shot.scored ? 'is-scored' : 'is-missed'}"
                          title="${shot.playerName || ''}">${shot.scored ? '●' : '○'}</span>`)
      .join('')
    return `
      <span class="spiel-ticker__detail">
        <strong>${t('spielTicker.penaltyShootout')}</strong>
        <span class="spiel-ticker__penalties">${shots}</span>
        <small class="text-muted">${shootout.goalsTeamA ?? 0} : ${shootout.goalsTeamB ?? 0}</small>
      </span>
    `
  }
  const label = {
    kickOff: t('spielTicker.kickOff'),
    halfTime: t('spielTicker.halfTime'),
    extraTime: t('spielTicker.extraTime')
  }[type] ?? ''
  return `<span class="spiel-ticker__detail"><strong>${label}</strong></span>`
}

/**
 * Build one ticker row: the CSS classes for its wrapper and its inner markup.
 * The caller decides where the row goes (the overlay prepends a live feed, the
 * game details overlay prints the whole timeline at once).
 *
 * The portrait slot is left empty on purpose — rendering a player image is
 * async, so the caller fills it in afterwards via `data-portrait-player`.
 *
 * @param {object} event
 * @param {Record<number, object>} players
 * @returns {{type: string, className: string, html: string, isBreak: boolean, playerId: number|undefined, player: object|undefined}}
 */
export function buildTickerRow (event, players) {
  const type = eventType(event)
  if (isBreakEvent(type)) {
    return {
      type,
      className: `spiel-ticker__event spiel-ticker__event--break spiel-ticker__event--${type}`,
      html: breakRowHtml(event, type),
      isBreak: true,
      playerId: undefined,
      player: undefined
    }
  }
  const playerId = tickerRowPlayerId(event, type)
  const player = players[playerId]
  const name = player?.name || event.playerName || t('spielTicker.unknownPlayer')
  // Games from before minute tracking have no minute at all — those show a dash
  // rather than a misleading 0'.
  const minute = typeof event.minute === 'number' ? `${event.minute}'` : '-'
  return {
    type,
    className: `spiel-ticker__event spiel-ticker__event--${type} ${player?.team1 ? 'spiel-ticker__event--home' : 'spiel-ticker__event--away'}`,
    html: `
      <span class="spiel-ticker__minute">${minute}</span>
      ${EVENT_ICONS[type]}
      <span class="spiel-ticker__portrait" data-portrait-player="${playerId ?? ''}"></span>
      <span class="spiel-ticker__detail"><strong>${name}</strong> <small class="text-muted">${tickerRowDetail(event, players, type)}</small></span>
    `,
    isBreak: false,
    playerId,
    player
  }
}

/**
 * Fill the portrait slots of already rendered ticker rows (#539). Rendering a
 * player SVG is async, so rows go up immediately and the portraits arrive a
 * tick later; a row whose player is unknown keeps its empty placeholder so the
 * layout does not shift.
 *
 * @param {HTMLElement|null} root - a single row, or any container holding rows
 * @param {Record<number, object>} players
 * @param {(player: object) => object|undefined} [teamOf] - the team whose shirt colour the portrait wears
 * @returns {Promise<void>}
 */
export async function fillTickerPortraits (root, players, teamOf = player => player.team) {
  if (!root?.querySelectorAll) return
  for (const slot of root.querySelectorAll('.spiel-ticker__portrait[data-portrait-player]')) {
    const player = players[slot.dataset.portraitPlayer]
    if (!player) continue
    try {
      slot.innerHTML = await renderPlayerImage(player, teamOf(player), PORTRAIT_SIZE)
    } catch {
      // A missing portrait is cosmetic — the row still reads fine without it.
    }
  }
}
