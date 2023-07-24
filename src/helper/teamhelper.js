import { query } from '../lib/database.js'

/**
 * @param {Request} req
 * @returns {Promise<TeamType>}
 */
export async function getTeam (req) {
  const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
  return team
}
