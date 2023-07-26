import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

export default {
  async getPlayersWithIds (req) {
    if (!Array.isArray(req.body.playerIds) || req.body.playerIds.length === 0) throw new BadRequestError('playerIds missing')
    const players = await query(`SELECT *
                                 FROM player
                                 WHERE id IN (${req.body.playerIds.join(', ')})`)
    return { players }
  }
}
