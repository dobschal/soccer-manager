import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerAge, getPlayerById, getPlayersByTeamId, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from '../helper/playerHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getPastTrades } from '../helper/tradeHelper.js'
import { addPlayerHistory } from '../helper/playerHistoryHelper.js'
import { sendToTeam } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
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
    // The squad shrank: every mounted view built on it (squad page, team page,
    // free-player list) refreshes from this event — including the ones the
    // router keeps alive in its page cache while another page is on screen.
    await sendToTeam(team.id, SERVER_EVENTS.PLAYER_FIRED.name, {
      playerId: playerFromDb.id,
      playerName: playerFromDb.name
    })
    return { success: true }
  },

  /**
   * @returns {Promise<Array<PlayerType>>}
   */
  async getPlayersWithoutTeam () {
    const { season } = await getGameDayAndSeason()
    // `carrier_end_season` is the last season a player is active, inclusive —
    // the same reading `getOffers` and the season transition use. `> season`
    // hid players who still have this whole season to play, which made the
    // final season look like retirement had already happened. Only genuinely
    // retired players (`< season`, kept in the table for history) are excluded.
    return await query('SELECT * FROM player WHERE team_id IS NULL AND carrier_end_season >= ?', [season])
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
    // `getPlayersWithoutTeam` already hides retired players, but the list the
    // client acts on can be stale — the season transition retires everyone at
    // 00:00 while a squad page opened before midnight still offers them. Ten
    // players were signed that way in production and stayed on their teams for
    // seasons, because nothing else ever re-checks a player's career end.
    const { season } = await getGameDayAndSeason()
    if (player.carrier_end_season < season) throw new BadRequestError(t('error.playerRetired', {}, locale))
    const teamPlayers = await getPlayersByTeamId(team.id)
    if (teamPlayers.length >= MAX_TEAM_SIZE) throw new BadRequestError(t('error.teamTooLarge', {}, locale))
    await query('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
    // A free agent must never carry stale trade offers into their new club.
    // firePlayer already clears offers when a player leaves a team; mirror that
    // here so signing a free agent can't leave them listed on the market (#512).
    await query('DELETE FROM trade_offer WHERE player_id=?', [player.id])
    await addLogMessage(t('log.playerSigned', { playerName: player.name }, locale), team, null, null, 'pencil', undefined, 'success')
    await addPlayerHistory(playerId, 'HIRED', team.name)
    // Counterpart to PLAYER_FIRED: the squad grew, so the lineup and the player
    // picker have a new candidate and the free-player list lost one.
    await sendToTeam(team.id, SERVER_EVENTS.PLAYER_HIRED.name, {
      playerId: player.id,
      playerName: player.name
    })
  },

  /**
   * @param {number} playerId
   * @returns {Promise<number>}
   */
  async estimateValue (playerId) {
    const player = await getPlayerById(playerId)
    const age = await getPlayerAge(player)
    const planPrice = await getAveragePlanPriceOfPlayer(player)
    const trades = await getPastTrades(player.position, age, player.level)
    if (trades.length >= 3) {
      const historicalAvg = trades.reduce(function (avg, tradeWithPlayer, _, { length }) {
        return avg + tradeWithPlayer.price / length
      }, 0)
      // Blend the historical trade average with the fundamental plan price (50/50).
      // The market value can still respond to supply/demand, but it can no longer
      // spiral far below a player's fundamental value: bots price sell offers off
      // estimateValue, those (randomly cheap) trades get recorded, and a pure
      // historical average would feed them straight back in — a deflationary loop
      // that lets active traders buy good players at a fraction of plan value.
      // Anchoring to planPrice damps that loop while keeping price discovery.
      return Math.floor(0.5 * historicalAvg + 0.5 * planPrice)
    }
    return planPrice
  },

  /**
   * TRANSFER entries only store the buying team id, the fee lives in
   * `trade_history`. Join it back in (matching season, game day and buyer) so
   * the history can show what the club paid — also for entries written before
   * this existed. The team id is compared as a string because `ph.value` is a
   * VARCHAR that holds team names for other history types.
   * @param {number} playerId
   * @returns {Promise<Array<PlayerHistoryType>>}
   */
  async getPlayerHistory (playerId) {
    return await query(`
        SELECT ph.*,
               (SELECT th.price
                FROM trade_history th
                WHERE ph.type = 'TRANSFER'
                  AND th.player_id = ph.player_id
                  AND th.season = ph.season
                  AND th.game_day = ph.game_day
                  AND CAST(th.to_team_id AS CHAR) = ph.value
                ORDER BY th.id DESC LIMIT 1) AS price
        FROM player_history ph
        WHERE ph.player_id = ?
        ORDER BY ph.id DESC
    `, [playerId])
  }
}
