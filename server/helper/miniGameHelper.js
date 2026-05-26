import { query } from '../lib/database.js'
import { actionCardChances } from './actionCardHelper.js'

// Mini-game rewards mirror the normal per-game-day action card distribution:
// every card type with a non-zero chance is reachable, weighted by that chance.
export const MINI_GAME_REWARD_POOL = Object.entries(actionCardChances)
  .filter(([, chance]) => chance > 0)
  .map(([action]) => action)

export const MINI_GAME_LIMITS = {
  MAX_POINTS_PER_SECOND: 15,
  MAX_DURATION_MS: 30 * 60 * 1000,
  GOAL_POINTS: 500,
  POINTS_PER_SECOND: 10
}

/**
 * @param {number} goalsScored
 * @param {() => number} [random]
 * @returns {string|null} card action key, or null for a blank
 */
export function rollMiniGameReward (goalsScored, random = Math.random) {
  if (!Number.isFinite(goalsScored) || goalsScored <= 0) return null
  const chance = Math.min(goalsScored / 3, 1)
  if (random() >= chance) return null
  const totalWeight = MINI_GAME_REWARD_POOL.reduce((sum, action) => sum + actionCardChances[action], 0)
  let r = random() * totalWeight
  for (const action of MINI_GAME_REWARD_POOL) {
    r -= actionCardChances[action]
    if (r < 0) return action
  }
  return MINI_GAME_REWARD_POOL[MINI_GAME_REWARD_POOL.length - 1]
}

/**
 * Plausibility check for client-submitted mini-game results.
 *
 * @param {number} score
 * @param {number} goalsScored
 * @param {number} durationMs
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateMiniGameSubmission (score, goalsScored, durationMs) {
  if (!Number.isInteger(score) || score < 0) return { valid: false, reason: 'invalid_score' }
  if (!Number.isInteger(goalsScored) || goalsScored < 0) return { valid: false, reason: 'invalid_goals' }
  if (!Number.isInteger(durationMs) || durationMs < 0) return { valid: false, reason: 'invalid_duration' }
  if (durationMs > MINI_GAME_LIMITS.MAX_DURATION_MS) return { valid: false, reason: 'duration_too_long' }
  const seconds = durationMs / 1000
  const maxScore = Math.ceil(seconds * MINI_GAME_LIMITS.MAX_POINTS_PER_SECOND + goalsScored * MINI_GAME_LIMITS.GOAL_POINTS)
  if (score > maxScore) return { valid: false, reason: 'score_too_high' }
  return { valid: true }
}

/**
 * @param {number} teamId
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<boolean>}
 */
export async function hasReceivedMiniGameRewardThisGameDay (teamId, gameDay, season) {
  const [row] = await query(
    'SELECT COUNT(*) AS amount FROM mini_game_score WHERE team_id=? AND rewarded_card_id IS NOT NULL AND game_day=? AND season=?',
    [teamId, gameDay, season]
  )
  return (row?.amount ?? 0) > 0
}
