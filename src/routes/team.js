import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'

export default {
  /**
   * @param {import("express").Request} req
   * @returns {Promise<>}
   */
  async getMyTeam (req) {
    const team = await getTeam(req)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password
    return { user: req.user, team, players }
  },

  /**
   * @param {import("express").Request} req
   * @returns {Promise<{balance: number}>}
   */
  async getMyBalance (req) {
    const team = await getTeam(req)
    return { balance: team.balance }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async updateColor (req) {
    const team = await getTeam(req)
    const color = req.body.color
    await query('UPDATE team SET color=? WHERE id=?', [color, team.id])
    return { success: true }
  },

  /**
   * @param {import("express").Request} req
   * @returns {Promise<>}
   */
  async getTeam (req) {
    const team = await getTeamById(req.body.teamId)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    let user
    if (team.user_id) {
      const users = await query('SELECT * FROM user WHERE id=? LIMIT 1', [team.user_id])
      user = users[0]
      if (user) {
        delete user.password
      }
    }
    return { team, players, user }
  },

  async saveLineup (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', team.id)
    for (const playerFromRequest of req.body.players) {
      const playerFromDb = playersFromDb.find(playerFromDb => playerFromRequest.id === playerFromDb.id)
      if (!playerFromDb) throw new BadRequestError('Unknown player...')
      playerFromDb.in_game_position = playerFromRequest.in_game_position
      await query('UPDATE player SET in_game_position=? WHERE id=?', [playerFromDb.in_game_position, playerFromDb.id])
    }
    await query('UPDATE team SET formation=? WHERE id=?', [req.body.formation, team.id])
    return { success: true }
  }
}
