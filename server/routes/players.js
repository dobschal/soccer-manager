import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerAge, getPlayerById } from '../helper/playerHelper.js'
import { getPastTrades } from '../helper/tradeHelper.js'
import { addPlayerHistory } from '../helper/playerHistoryHelper.js'

export default {

  /**
   * @param {number} playerId
   * @returns {Promise<PlayerType>}
   */
  async getPlayerById (playerId) {
    return await getPlayerById(playerId)
  },

  /**
   * @param {Array<number>} playerIds
   * @returns {Promise<{players: Array<PlayerType>}>}
   */
  async getPlayersWithIds (playerIds) {
    if (!Array.isArray(playerIds) || playerIds.length === 0) throw new BadRequestError('playerIds missing')
    const players = await query(`SELECT *
                                 FROM player
                                 WHERE id IN (${playerIds.join(', ')})`)
    return { players }
  },

  /**
   * @param {PlayerType} player
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async firePlayer (player, req) {
    const team = await getTeam(req)
    const [playerFromDb] = await query('SELECT * FROM player WHERE id=? AND team_id=?', [player.id, team.id])
    if (!playerFromDb) throw new BadRequestError('Not your player...')
    await query('UPDATE player SET team_id=NULL WHERE id=?', [player.id])
    await query('DELETE FROM trade_offer WHERE player_id=?', [player.id])
    await addLogMessage('You fired your player ' + playerFromDb.name + '.', team)
    await addPlayerHistory(player.id, 'FIRED', team.name)
    return { success: true }
  },

  /**
   * @returns {Promise<Array<PlayerType>>}
   */
  async getPlayersWithoutTeam () {
    return await query('SELECT * FROM player WHERE team_id IS NULL')
  },

  /**
   * @param {number} playerId
   * @param {Request} [req]
   * @returns {Promise<void>}
   */
  async givePlayerContract (playerId, req) {
    const team = await getTeam(req)
    const player = await getPlayerById(playerId)
    if (player.team_id) throw new BadRequestError('Player has a team already...')
    await query('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
    await addLogMessage('Congratulations! You signed a new player contract with ' + player.name + '', team)
    await addPlayerHistory(playerId, 'HIRED', team.name)
  },

  /**
   * @param {number} playerId
   * @returns {Promise<number>}
   */
  async estimateValue (playerId) {
    const player = await getPlayerById(playerId)
    const age = await getPlayerAge(player)
    const trades = await getPastTrades(player.position, age, player.level)
    if (trades.length >= 3) {
      return trades.reduce(function (avg, tradeWithPlayer, _, { length }) {
        return avg + tradeWithPlayer.price / length
      }, 0)
    }
    return await getAveragePlanPriceOfPlayer(player)
  },

  /**
   * @param {number} playerId
   * @returns {Promise<Array<PlayerHistoryType>>}
   */
  async getPlayerHistory (playerId) {
    return await query('SELECT * FROM player_history ph WHERE ph.player_id=? ORDER BY id DESC', [playerId])
  }
}
