export const salaryPerLevel = [
  0,
  150, // level 1
  240,
  384,
  614,
  983, // level 5
  1573,
  2517,
  4027,
  6442,
  10308 // level 10
]

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
  let playingValue = player.in_game_position ? 100 : 0
  if (player.position.startsWith('L')) {
    playingValue += 3
  } else if (player.position.startsWith('R')) {
    playingValue += 1
  } else {
    playingValue += 2
  }
  if (player.position.endsWith('K')) return 30 + playingValue
  if (player.position.endsWith('D')) return 20 + playingValue
  if (player.position.endsWith('M')) return 10 + playingValue
  return playingValue
}
