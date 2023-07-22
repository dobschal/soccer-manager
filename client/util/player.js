export const sallaryPerLevel = [
  0,
  150, // level 1
  225,
  337,
  506,
  759, // level 5
  1139,
  1709,
  2562,
  3844,
  5767 // level 10
]

/**
 * @param {PlayerType} player
 * @param {number} currentSeason
 * @returns {number}
 */
export function calculatePlayerAge (player, currentSeason) {
  return (currentSeason - player.carrier_start_season) + 16
}
