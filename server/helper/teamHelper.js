import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { clearUserCache } from '../lib/userCache.js'
import { config } from '../config.js'

/**
 * @param {Request} req
 * @returns {Promise<TeamType>}
 */
export async function getTeam (req) {
  if (!req.user) throw new BadRequestError('Not authorised.')
  const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
  if (!team) throw new BadRequestError('Not authorised.')
  return team
}

/**
 * @param {number} id
 * @returns {Promise<TeamType>}
 */
export async function getTeamById (id) {
  const [team] = await query('SELECT * FROM team WHERE id=? LIMIT 1', [id])
  return team
}

/**
 * Remove users who haven't opened the dashboard in more than {@link config.INACTIVE_USER_DAYS} days.
 * Their team is kept with all players/stadium intact and becomes a bot team again.
 */
export async function cleanupInactiveUsers () {
  const inactiveUsers = await query(
    `SELECT u.id AS user_id, t.id AS team_id FROM user u JOIN team t ON t.user_id = u.id WHERE COALESCE(u.last_login, u.created_at) < NOW() - INTERVAL ${config.INACTIVE_USER_DAYS} DAY AND u.is_admin = 0`
  )
  for (const { user_id: userId, team_id: teamId } of inactiveUsers) {
    console.log(`Removing inactive user ${userId} from team ${teamId}`)
    await query('UPDATE team SET user_id = NULL, description = NULL WHERE id = ?', [teamId])
    await query('DELETE FROM news_comment WHERE user_id = ?', [userId])
    await query('DELETE FROM news_like WHERE user_id = ?', [userId])
    await query('DELETE FROM user WHERE id = ?', [userId])
    clearUserCache(userId)
  }
  if (inactiveUsers.length > 0) {
    console.log(`Cleaned up ${inactiveUsers.length} inactive user(s).`)
  }
}
