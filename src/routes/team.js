import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'

export default {

  async getMyTeam (req) {
    const team = await getTeam(req)
    const players = await query('SELECT * FROM player WHERE team_id=?', team.id)
    delete req.user.password
    return { user: req.user, team, players }
  },

  async getMyBalance (req) {
    const team = await getTeam(req)
    return { balance: team.balance }
  },

  async updateColor (color, req) {
    const team = await getTeam(req)
    await query('UPDATE team SET color=? WHERE id=?', [color, team.id])
    return { success: true }
  },

  /**
   * @param {number} teamId
   * @returns {Promise<TeamType>}
   */
  async getTeamById (teamId) {
    return await getTeamById(teamId)
  },

  async getTeam (teamId) {
    const team = await getTeamById(teamId)
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

  async saveLineup (players, formation, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const playersFromDb = await query('SELECT * FROM player WHERE team_id=?', team.id)
    for (const playerFromRequest of players) {
      const playerFromDb = playersFromDb.find(playerFromDb => playerFromRequest.id === playerFromDb.id)
      if (!playerFromDb) throw new BadRequestError('Unknown player...')
      playerFromDb.in_game_position = playerFromRequest.in_game_position
      await query('UPDATE player SET in_game_position=? WHERE id=?', [playerFromDb.in_game_position, playerFromDb.id])
    }
    await query('UPDATE team SET formation=? WHERE id=?', [formation, team.id])
    return { success: true }
  }
}
