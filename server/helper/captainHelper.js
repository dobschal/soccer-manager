/**
 * Captain strength modifier logic.
 *
 * Rules:
 *  - No captain selected: -10% strength
 *  - Captain younger than 24: -5% strength
 *  - Captain is weakest player in lineup: -10% strength
 *  - Captain is oldest player in lineup: +5% strength
 *  - Captain is best (highest level) player in lineup: +5% strength
 *
 * Modifiers stack additively before being applied as a multiplier.
 */

/**
 * Calculate the captain strength multiplier for a team.
 *
 * @param {Object|null} team - The team object (must have captain_id)
 * @param {Array<Object>} lineupPlayers - Players in the lineup (with id, level, carrier_start_season or birth_season)
 * @param {number} currentSeason - The current season number
 * @returns {number} multiplier (e.g. 0.90 for -10%, 1.05 for +5%)
 */
export function getCaptainStrengthMultiplier (team, lineupPlayers, currentSeason) {
  if (!team || !lineupPlayers || lineupPlayers.length === 0) {
    return 0.90 // No captain = -10%
  }

  const captainId = team.captain_id
  if (!captainId) {
    return 0.90 // No captain selected = -10%
  }

  const captain = lineupPlayers.find(p => p.id === captainId)
  if (!captain) {
    // Captain is not in the lineup (removed, suspended, etc.)
    return 0.90 // Treated as no captain = -10%
  }

  let modifier = 0

  // Captain younger than 24: -5%
  const captainAge = _getPlayerAge(captain, currentSeason)
  if (captainAge < 24) {
    modifier -= 0.05
  }

  // Captain is weakest player in lineup: -10%
  const minLevel = Math.min(...lineupPlayers.map(p => p.level))
  if (captain.level === minLevel) {
    modifier -= 0.10
  }

  // Captain is oldest player in lineup: +5%
  const maxAge = Math.max(...lineupPlayers.map(p => _getPlayerAge(p, currentSeason)))
  if (captainAge === maxAge) {
    modifier += 0.05
  }

  // Captain is best (highest level) player in lineup: +5%
  const maxLevel = Math.max(...lineupPlayers.map(p => p.level))
  if (captain.level === maxLevel) {
    modifier += 0.05
  }

  return 1 + modifier
}

/**
 * Calculate player age from carrier_start_season (standard players)
 * or birth_season. Players start at age 16, so age = 16 + (currentSeason - carrier_start_season).
 *
 * @param {Object} player
 * @param {number} currentSeason
 * @returns {number}
 */
function _getPlayerAge (player, currentSeason) {
  // Use the same formula as client/util/player.js calculatePlayerAge
  const startSeason = player.carrier_start_season ?? player.birth_season ?? 0
  return 16 + (currentSeason - startSeason)
}
