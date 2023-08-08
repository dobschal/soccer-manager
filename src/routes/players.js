import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'

export default {
  async getPlayersWithIds (req) {
    if (!Array.isArray(req.body.playerIds) || req.body.playerIds.length === 0) throw new BadRequestError('playerIds missing')
    const players = await query(`SELECT *
                                 FROM player
                                 WHERE id IN (${req.body.playerIds.join(', ')})`)
    return { players }
  },

  async firePlayer (req) {
    const p = req.body.player
    const team = await getTeam(req)
    const [player] = await query('SELECT * FROM player WHERE id=? AND team_id=?', [p.id, team.id])
    if (!player) throw new BadRequestError('Not your player...')
    await query('UPDATE player SET team_id=NULL WHERE id=?', [p.id])
    await query('DELETE FROM trade_offer WHERE player_id=?', [p.id])
    return { success: true }
  }
}
