/**
 * Calculate salary for a given player level (1-100)
 * Exponential curve: Level 1 = 150, Level 100 = 10,308
 * @param {number} level
 * @returns {number}
 */
export function getSalary (level) {
  if (level <= 0) return 0
  return Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))
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
 * Check if a player will retire at the end of the current season
 * (i.e. carrier_end_season <= current season + 1)
 * @param {PlayerType} player
 * @param {number} currentSeason
 * @returns {boolean}
 */
export function willRetireNextSeason (player, currentSeason) {
  return player.carrier_end_season <= currentSeason + 1
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
