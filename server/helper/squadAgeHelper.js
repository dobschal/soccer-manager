/**
 * Squad-age strength modifier logic (#450).
 *
 * A lineup's average age influences its in-game strength. The perfect average
 * age is 27: a lineup at exactly 27 gets a small bonus, while a lineup that is
 * much younger or much older gets a small penalty. The effect is intentionally
 * small — it is capped at ±5%.
 *
 * The multiplier ramps linearly with the absolute deviation from the ideal age:
 *  - deviation 0        → +5% (1.05)
 *  - deviation FULL_DEV → -5% (0.95)
 * and is clamped to [0.95, 1.05] beyond that.
 */

export const AGE_IDEAL = 27
export const AGE_BONUS = 0.05
export const AGE_MAX_PENALTY = 0.05
// Deviation (in years) from the ideal at which the full penalty is reached.
export const AGE_FULL_PENALTY_DEVIATION = 7

/**
 * Calculate player age from carrier_start_season (standard players) or
 * birth_season. Players start at age 16, so age = 16 + (currentSeason -
 * startSeason). Mirrors client/util/player.js#calculatePlayerAge and
 * captainHelper.
 *
 * @param {Object} player
 * @param {number} currentSeason
 * @returns {number}
 */
function _getPlayerAge (player, currentSeason) {
  const startSeason = player.carrier_start_season ?? player.birth_season ?? 0
  return 16 + (currentSeason - startSeason)
}

/**
 * Average age of the given lineup players.
 *
 * @param {Array<Object>} lineupPlayers
 * @param {number} currentSeason
 * @returns {number|null} average age, or null if the lineup is empty
 */
export function getLineupAverageAge (lineupPlayers, currentSeason) {
  if (!lineupPlayers || lineupPlayers.length === 0) return null
  const total = lineupPlayers.reduce((sum, p) => sum + _getPlayerAge(p, currentSeason), 0)
  return total / lineupPlayers.length
}

/**
 * Calculate the squad-age strength multiplier for a lineup.
 *
 * @param {Array<Object>} lineupPlayers - Players in the lineup
 * @param {number} currentSeason - The current season number
 * @returns {number} multiplier in [1 - AGE_MAX_PENALTY, 1 + AGE_BONUS]
 */
export function getSquadAgeStrengthMultiplier (lineupPlayers, currentSeason) {
  const avgAge = getLineupAverageAge(lineupPlayers, currentSeason)
  if (avgAge === null) return 1
  const deviation = Math.abs(avgAge - AGE_IDEAL)
  const ramp = Math.min(deviation / AGE_FULL_PENALTY_DEVIATION, 1)
  const modifier = AGE_BONUS - (AGE_BONUS + AGE_MAX_PENALTY) * ramp
  return 1 + modifier
}

/**
 * Whether a lineup's average age is far enough from the ideal that it results
 * in a net strength penalty (multiplier below 1). Used to surface the squad-age
 * hint in the dashboard urgency list (#450).
 *
 * @param {Array<Object>} lineupPlayers
 * @param {number} currentSeason
 * @returns {{ suboptimal: boolean, avgAge: number|null, tooYoung: boolean, tooOld: boolean }}
 */
export function getSquadAgeStatus (lineupPlayers, currentSeason) {
  const avgAge = getLineupAverageAge(lineupPlayers, currentSeason)
  if (avgAge === null) {
    return { suboptimal: false, avgAge: null, tooYoung: false, tooOld: false }
  }
  const multiplier = getSquadAgeStrengthMultiplier(lineupPlayers, currentSeason)
  const suboptimal = multiplier < 1
  return {
    suboptimal,
    avgAge,
    tooYoung: suboptimal && avgAge < AGE_IDEAL,
    tooOld: suboptimal && avgAge > AGE_IDEAL
  }
}
