import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { acceptOffer, declineOffer } from '../helper/tradeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getPlayerById } from '../helper/playerHelper.js'
import { t, getUserLocale } from '../i18n/index.js'

export default {

  /**
   * @returns {Promise<{offers: TradeOfferType[], players: PlayerType[], teams: TeamType[]}>}
   */
  async getOffers () {
    /** @type {TradeOfferType[]} */
    const offers = await query('SELECT * FROM trade_offer')
    if (offers.length === 0) return { offers, players: [], teams: [] }
    const playerIds = offers.map(o => o.player_id).join(', ')
    /** @type {PlayerType[]} */
    const players = await query(`SELECT * FROM player WHERE id IN (${playerIds})`)
    const teamIds = players.map(p => p.team_id)
    for (const offer of offers) {
      if (!teamIds.includes(offer.from_team_id)) {
        teamIds.push(offer.from_team_id)
      }
    }
    /** @type {TeamType[]} */
    const teams = await query(`SELECT * FROM team WHERE id IN (${teamIds.join(', ')})`)
    players.forEach(p => p.in_game_position = null)
    return { offers, players, teams }
  },

  /**
   * @param {PlayerType} player
   * @param {number} price
   * @param {string} type
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async addTradeOffer (player, price, type, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    if (type === 'buy' && team.balance < price) throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
    if (!player || typeof player !== 'object') throw new BadRequestError(t('error.playerNotFound', {}, locale))
    if (typeof price !== 'number') throw new BadRequestError(t('error.invalidOfferValue', {}, locale))
    if (typeof type !== 'string') throw new BadRequestError(t('error.invalidRequest', {}, locale))
    if (price <= 0) throw new BadRequestError(t('error.invalidOfferValue', {}, locale))
    const tradeOffer = new TradeOffer({
      offer_value: price,
      type: type,
      player_id: player.id,
      from_team_id: team.id
    })
    const results = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=?', [tradeOffer.from_team_id, tradeOffer.player_id])
    if (results.length > 0) throw new BadRequestError(t('error.playerAlreadyListed', {}, locale))
    await query('INSERT INTO trade_offer SET ?', tradeOffer)

    // Notify the player's team about the incoming buy offer
    if (type === 'buy' && player.team_id) {
      const playerData = await getPlayerById(player.id)
      const receivingTeam = await getTeamById(player.team_id)
      if (receivingTeam && receivingTeam.user_id) {
        const receiverLocale = await getUserLocale(receivingTeam.user_id)
        await addLogMessage(
          t('log.offerReceived', { price: price.toLocaleString(), playerName: playerData.name, fromTeam: team.name }, receiverLocale),
          receivingTeam,
          'OPEN_INCOMING_OFFERS',
          null,
          'shopping-cart'
        )
      }
    }

    // Log sell offer creation to the selling team
    if (type === 'sell') {
      const playerData = await getPlayerById(player.id)
      await addLogMessage(
        t('log.sellOfferCreated', { price: price.toLocaleString(), playerName: playerData.name }, locale),
        team,
        'OPEN_MARKET',
        null,
        'tag',
        'NEW_SELL_TRADE_OFFER'
      )
    }

    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async acceptOffer (offer, req) {
    const locale = req.locale || 'en'
    const { gameDay, season } = await getGameDayAndSeason()
    const sellingTeam = await getTeam(req)
    delete offer.created_at
    await acceptOffer(offer, sellingTeam, gameDay, season, locale)
    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async cancelOffer (offer, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    if (!offer.id || !team.id) throw new BadRequestError(t('error.offerNotFound', {}, locale))
    await query('DELETE FROM trade_offer WHERE from_team_id=? AND id=?', [team.id, offer.id])
    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async declineOffer (offer, req) {
    const locale = req.locale || 'en'
    if (!offer || !offer.id) throw new BadRequestError(t('error.offerNotFound', {}, locale))
    await declineOffer(offer)
    return { success: true }
  },

  /**
   * @param {PlayerType} player
   * @param {Request} req
   * @returns {Promise<{offer: TradeOfferType|undefined}>}
   */
  async myOfferForPlayer (player, req) {
    const team = await getTeam(req)
    const [offer] = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=?', [team.id, player.id])
    return { offer }
  },

  /**
   * Get player IDs that have sell offers from the current user's team
   * @param {Request} req
   * @returns {Promise<{playerIds: number[]}>}
   */
  async getMySellOfferPlayerIds (req) {
    const team = await getTeam(req)
    const offers = await query(
      'SELECT player_id FROM trade_offer WHERE from_team_id=? AND type=?',
      [team.id, 'sell']
    )
    return { playerIds: offers.map(o => o.player_id) }
  },

  /**
   * Check if a player has a sell offer
   * @param {number} playerId
   * @returns {Promise<{hasSellOffer: boolean}>}
   */
  async hasPlayerSellOffer (playerId) {
    const [offer] = await query(
      'SELECT id FROM trade_offer WHERE player_id=? AND type=? LIMIT 1',
      [playerId, 'sell']
    )
    return { hasSellOffer: !!offer }
  },

  /**
   * @param {string} position
   * @returns {Promise<Record<string, {avgPrice: number, count: number}>>}
   */
  async getTransferStats (position) {
    const trades = await query(`
      SELECT th.price, th.season, COALESCE(th.player_level, p.level) AS level, p.carrier_start_season
      FROM trade_history th
      JOIN player p ON th.player_id = p.id
      WHERE p.position = ?
    `, [position])

    const stats = {}
    for (const trade of trades) {
      const age = trade.season - trade.carrier_start_season + 16
      const key = `${trade.level}:${age}`
      if (!stats[key]) stats[key] = { totalPrice: 0, count: 0 }
      stats[key].totalPrice += trade.price
      stats[key].count++
    }

    const result = {}
    for (const [key, val] of Object.entries(stats)) {
      result[key] = { avgPrice: Math.floor(val.totalPrice / val.count), count: val.count }
    }
    return result
  },

  /**
   * @returns {Promise<{ trades: TradeHistoryType[] }>}
   */
  async getTradeHistory () {
    const trades = await query('SELECT * FROM trade_history ORDER BY created_at DESC')
    const teamIds = []
    const playerIds = trades.map(/** @param {TradeHistoryType} trade */ (trade) => {
      if (!teamIds.includes(trade.from_team_id)) teamIds.push(trade.from_team_id)
      if (!teamIds.includes(trade.to_team_id)) teamIds.push(trade.to_team_id)
      return trade.player_id
    })
    let players = []
    if (playerIds.length > 0) {
      players = await query(`SELECT *
                             FROM player
                             WHERE id IN (${playerIds.join(', ')})`)
    }
    let teams = []
    if (teamIds.length > 0) {
      teams = await query(`SELECT * FROM team WHERE id IN (${teamIds.join(', ')})`)
    }

    return { trades, players, teams }
  }
}
