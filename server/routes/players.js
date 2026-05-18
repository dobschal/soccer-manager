import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerAge, getPlayerById, getPlayersByTeamId, MIN_TEAM_SIZE } from '../helper/playerHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getPastTrades } from '../helper/tradeHelper.js'
import { addPlayerHistory } from '../helper/playerHistoryHelper.js'
import { t } from '../i18n/index.js'

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
   * @param {Request} req
   * @returns {Promise<{players: Array<PlayerType>}>}
   */
  async getPlayersWithIds (playerIds, req) {
    const locale = req.locale || 'en'
    if (!Array.isArray(playerIds) || playerIds.length === 0) throw new BadRequestError(t('error.invalidRequest', {}, locale))
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
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    const [playerFromDb] = await query('SELECT * FROM player WHERE id=? AND team_id=?', [player.id, team.id])
    if (!playerFromDb) throw new BadRequestError(t('error.notYourPlayer', {}, locale))
    const teamPlayers = await getPlayersByTeamId(team.id)
    if (teamPlayers.length <= MIN_TEAM_SIZE) throw new BadRequestError(t('error.teamTooSmall', {}, locale))
    await query('UPDATE player SET team_id=NULL WHERE id=?', [player.id])
    await query('DELETE FROM trade_offer WHERE player_id=?', [player.id])
    await addLogMessage(t('log.playerFired', { playerName: playerFromDb.name }, locale), team, null, null, 'user-times', undefined, 'info')
    await addPlayerHistory(player.id, 'FIRED', team.name)
    return { success: true }
  },

  /**
   * @returns {Promise<Array<PlayerType>>}
   */
  async getPlayersWithoutTeam () {
    const { season } = await getGameDayAndSeason()
    return await query('SELECT * FROM player WHERE team_id IS NULL AND carrier_end_season > ?', [season])
  },

  /**
   * @param {number} playerId
   * @param {Request} [req]
   * @returns {Promise<void>}
   */
  async givePlayerContract (playerId, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    const player = await getPlayerById(playerId)
    if (player.team_id) throw new BadRequestError(t('error.playerNotFound', {}, locale))
    await query('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
    await addLogMessage(t('log.playerSigned', { playerName: player.name }, locale), team, null, null, 'pencil', undefined, 'success')
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
