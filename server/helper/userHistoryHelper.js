import { query } from '../lib/database.js'

/**
 * Open a new user-team tenure. Called when a user takes over a team.
 * Closes any older open tenures for the user first (defensive — should never
 * have two open at once).
 * @param {number} userId
 * @param {number} teamId
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function recordTeamTakeover (userId, teamId, season) {
  await query(
    'UPDATE user_team_history SET end_season=? WHERE user_id=? AND end_season IS NULL',
    [season, userId]
  )
  await query(
    'INSERT INTO user_team_history (user_id, team_id, start_season, end_season) VALUES (?, ?, ?, NULL)',
    [userId, teamId, season]
  )
}

/**
 * Close the currently-open tenure for a user (user resigned from their team).
 * @param {number} userId
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function recordTeamResign (userId, season) {
  await query(
    'UPDATE user_team_history SET end_season=? WHERE user_id=? AND end_season IS NULL',
    [season, userId]
  )
}

/**
 * Returns the user's tenure rows, newest first.
 * @param {number} userId
 * @returns {Promise<Array<{id: number, user_id: number, team_id: number, start_season: number, end_season: number|null}>>}
 */
export async function getUserTeamHistory (userId) {
  return await query(
    `SELECT id, user_id, team_id, start_season, end_season
     FROM user_team_history
     WHERE user_id=?
     ORDER BY start_season DESC, id DESC`,
    [userId]
  )
}
