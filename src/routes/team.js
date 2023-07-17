import { query } from '../lib/database.js'

export default {
  /**
   * @param {import("express").Request} req
   * @returns {Promise<>}
   */
  async getMyTeam (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password
    return { user: req.user, team, players }
  },

  /**
   * @param {import("express").Request} req
   * @returns {Promise<>}
   */
  async getTeam (req) {
    const [team] = await query('SELECT * FROM team WHERE id=? LIMIT 1', [req.body.teamId])
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    return { team, players }
  }
}
