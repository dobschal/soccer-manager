import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { addLogMessage } from '../helper/newsHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerAge, getPlayerById } from '../helper/playerHelper.js'
import { getPastTrades } from '../helper/tradeHelper.js'

export default {

  async getPlayerById_V2 (playerId) {
    return await getPlayerById(playerId)
  },

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
    await addLogMessage('You fired your place ' + player.name + '.', team)
    return { success: true }
  },

  /**
   * @param {number} playerId
   * @returns {Promise<number>}
   */
  async estimateValue_V2 (playerId) {
    const player = await getPlayerById(playerId)
    const age = await getPlayerAge(player)
    const trades = await getPastTrades(player.position, age, player.level)
    if (trades.length > 0) {
      const averagePrice = trades.reduce(function (avg, tradeWithPlayer, _, { length }) {
        return avg + tradeWithPlayer.price / length
      }, 0)
      return averagePrice
    }
    return await getAveragePlanPriceOfPlayer(player)
  },

  /**
   * @param {number} playerId
   * @returns {Promise<Array<PlayerHistoryType>>}
   */
  async getPlayerHistory_V2 (playerId) {
    return await query('SELECT * FROM player_history ph WHERE ph.player_id=? ORDER BY id DESC', [playerId])
  }
}
