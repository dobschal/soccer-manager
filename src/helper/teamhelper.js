import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

/**
 * @param {Request} req
 * @returns {Promise<TeamType>}
 */
export async function getTeam (req) {
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
