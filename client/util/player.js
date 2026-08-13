// A player may change clubs at most this many times per season.
// Keep in sync with MAX_TRANSFERS_PER_SEASON in server/helper/tradeHelper.js.
export const MAX_TRANSFERS_PER_SEASON = 2

// Neither a sell offer nor a buy offer may be below this share of the player's
// market value (#446 raised it from 50% to 75%). Enforced on the server in
// server/routes/trade.js and pre-checked in the UI.
export const MIN_OFFER_MARKET_VALUE_RATIO = 0.75

/**
 * Lowest price a sell or buy offer may have for a given market value.
 * @param {number} marketValue
 * @returns {number}
 */
export function getMinOfferPrice (marketValue) {
  return Math.floor(marketValue * MIN_OFFER_MARKET_VALUE_RATIO)
}

/** Salary at level 1 — the bottom of the curve. */
export const SALARY_AT_LEVEL_1 = 72

/** Salary at level 100 — the top of the curve. */
export const SALARY_AT_LEVEL_100 = 18_500

/**
 * Calculate salary for a given player level (1-100).
 *
 * A single exponential from 72 € to 18,500 € per match day. The shape is the
 * same as before #543, only tilted: the curve pivots around level 70, so weak
 * players cost less than they used to and stars cost more.
 *
 * Calibrated against the game's actual anchor — sponsor money roughly pays the
 * wage bill. Measured on live squads that puts the top league at 120% of its
 * previous wage bill (sponsor coverage 1.05 → 0.88, so a top club now has to
 * find the rest elsewhere), while the third and fourth tiers pay 19% and 31%
 * less than before.
 *
 * @param {number} level
 * @returns {number}
 */
export function getSalary (level) {
  if (level <= 0) return 0
  return Math.floor(SALARY_AT_LEVEL_1 * Math.pow(SALARY_AT_LEVEL_100 / SALARY_AT_LEVEL_1, (level - 1) / 99))
}

/** @deprecated Use getSalary(level) instead */
export const salaryPerLevel = new Proxy([], {
  get (_, prop) {
    const idx = Number(prop)
    if (!isNaN(idx)) return getSalary(idx)
    return undefined
  }
})

/**
 * @param {PlayerType} player
 * @param {number} currentSeason
 * @returns {number}
 */
export function calculatePlayerAge (player, currentSeason) {
  return (currentSeason - player.carrier_start_season) + 16
}

/**
 * Calculate market value for a player based on level and age.
 * Base: 40M at level 100, age 22.
 * Age: ×0.85 per year above 22.
 * Level: ×0.9330329915368074 per level below 100 (halves every 10 levels).
 * @param {number} level
 * @param {number} age
 * @returns {number}
 */
export function calculateMarketValue (level, age) {
  let price = 40_000_000
  for (let a = 22; a < age; a++) price *= 0.85
  for (let l = 100; l > level; l--) price *= 0.9330329915368074
  return Math.floor(price)
}

/**
 * Check if a player will retire at the end of the current season.
 *
 * `carrier_end_season` is the player's **last active season**, inclusive — the
 * season transition retires everyone with `carrier_end_season <= season` while
 * `season` still names the season that just finished
 * (`_archiveTooOldPlayers` in server/prepare-season.js). The check has to use
 * the same comparison: with `<= currentSeason + 1` the badge lit up a full
 * season early, so players were flagged as retiring, played another full
 * season, and got flagged a second time.
 *
 * @param {PlayerType} player
 * @param {number} currentSeason
 * @returns {boolean}
 */
export function willRetireNextSeason (player, currentSeason) {
  return player.carrier_end_season <= currentSeason
}

/**
 * The line a position belongs to. Used to grade how far out of position a
 * player is (#540).
 * @type {Record<string, string>}
 */
export const POSITION_LINE = {
  GK: 'GK',
  LD: 'DEF', CD: 'DEF', RD: 'DEF',
  DM: 'MID', LM: 'MID', CM: 'MID', RM: 'MID', OM: 'MID',
  LA: 'ATT', CA: 'ATT', RA: 'ATT'
}

/**
 * How much a player loses when fielded away from their natural position,
 * as a fraction of their level (#540).
 *
 * Read as `PENALTY_BY_LINE[naturalLine][playedLine]`. Staying in the same line
 * costs 10%; every line crossed costs more, and the further from home the
 * worse — an attacker in defence is the most expensive misuse there is.
 *
 * The goalkeeper is deliberately absolute: anyone in goal who is not a keeper
 * (and any keeper fielded outfield) loses half their level, because the role
 * shares nothing with the rest of the pitch.
 * @type {Record<string, Record<string, number>>}
 */
export const PENALTY_BY_LINE = {
  ATT: { ATT: 0.1, MID: 0.2, DEF: 0.3 },
  MID: { MID: 0.1, ATT: 0.2, DEF: 0.2 },
  DEF: { DEF: 0.1, MID: 0.2, ATT: 0.3 }
}

/** What a non-keeper in goal (or a keeper outfield) loses. */
export const GOALKEEPER_MISMATCH_PENALTY = 0.5

/**
 * The share of their level a player loses when fielded at `playedPosition`
 * instead of their natural `naturalPosition`. 0 when they are at home.
 * @param {string} naturalPosition
 * @param {string} playedPosition
 * @returns {number} 0 … 0.5
 */
export function getPositionPenalty (naturalPosition, playedPosition) {
  if (!naturalPosition || !playedPosition) return 0
  if (naturalPosition === playedPosition) return 0
  const from = POSITION_LINE[naturalPosition]
  const to = POSITION_LINE[playedPosition]
  if (!from || !to) return 0
  // Either side being the goalkeeper slot is its own, harsher case.
  if (from === 'GK' || to === 'GK') return GOALKEEPER_MISMATCH_PENALTY
  return PENALTY_BY_LINE[from]?.[to] ?? 0
}

/**
 * The multiplier a player's level is scaled by for the position they are
 * fielded at. 1 when they play their natural position.
 * @param {string} naturalPosition
 * @param {string} playedPosition
 * @returns {number}
 */
export function getPositionLevelFactor (naturalPosition, playedPosition) {
  return 1 - getPositionPenalty(naturalPosition, playedPosition)
}

/**
 * @param {PlayerType} playerA
 * @param {PlayerType} playerB
 * @returns {number}
 */
export function sortByPosition (playerA, playerB) {
  return _positionValue(playerB) - _positionValue(playerA)
}

/**
 * Natural football position rank for a single position code: higher = listed
 * first when sorting ascending. GK > defenders > midfielders > attackers, with
 * L/C/R sub-ordering inside each group.
 * @param {string} position
 * @returns {number}
 */
export function positionRank (position) {
  if (!position) return 0
  let rank = 0
  if (position.endsWith('K')) rank += 30
  else if (position.endsWith('D')) rank += 20
  else if (position.endsWith('M')) rank += 10
  if (position.startsWith('L')) rank += 3
  else if (position.startsWith('R')) rank += 1
  else rank += 2
  return rank
}

/**
 * @param {PlayerType} player
 * @returns {number}
 */
function _positionValue (player) {
  // Sort by where the player is actually playing: out-of-position assignments
  // (e.g. a CD fielded as OM) should land with the midfielders, not the defenders.
  const sortPosition = player.in_game_position || player.position
  let playingValue = player.in_game_position ? 10000 : (player.bench_position ? 5000 : 0)
  playingValue += positionRank(sortPosition)
  // For bench players, use sort_index to allow custom ordering (lower sort_index = higher priority)
  const sortIndex = player.sort_index || 0
  playingValue += (9999 - sortIndex) / 10000
  return playingValue
}
