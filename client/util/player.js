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
 * @param {PlayerType} playerA
 * @param {PlayerType} playerB
 * @returns {number}
 */
export function sortByPosition (playerA, playerB) {
  return _positionValue(playerB) - _positionValue(playerA)
}

/**
 * @param {PlayerType} player
 * @returns {number}
 */
function _positionValue (player) {
  let playingValue = player.in_game_position ? 10000 : 0
  if (player.position.startsWith('L')) {
    playingValue += 3
  } else if (player.position.startsWith('R')) {
    playingValue += 1
  } else {
    playingValue += 2
  }
  if (player.position.endsWith('K')) playingValue += 30
  else if (player.position.endsWith('D')) playingValue += 20
  else if (player.position.endsWith('M')) playingValue += 10
  // For bench players, use sort_index to allow custom ordering (lower sort_index = higher priority)
  const sortIndex = player.sort_index || 0
  playingValue += (9999 - sortIndex) / 10000
  return playingValue
}
