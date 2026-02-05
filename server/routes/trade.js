import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { acceptOffer, declineOffer } from '../helper/tradeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getPlayerById } from '../helper/playerHelper.js'

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
    const team = await getTeam(req)
    if (type === 'buy' && team.balance < price) throw new BadRequestError('Not enough money...')
    if (!player || typeof player !== 'object') throw new BadRequestError('Player is required')
    if (typeof price !== 'number') throw new BadRequestError('Price must be a number')
    if (typeof type !== 'string') throw new BadRequestError('Type must be a string')
    if (price <= 0) throw new BadRequestError('Price needs to be greater than 0.')
    const tradeOffer = new TradeOffer({
      offer_value: price,
      type: type,
      player_id: player.id,
      from_team_id: team.id
    })
    const results = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=?', [tradeOffer.from_team_id, tradeOffer.player_id])
    if (results.length > 0) throw new BadRequestError('Already added an offer for that player...')
    await query('INSERT INTO trade_offer SET ?', tradeOffer)

    // Notify the player's team about the incoming buy offer
    if (type === 'buy' && player.team_id) {
      const playerData = await getPlayerById(player.id)
      const receivingTeam = await getTeamById(player.team_id)
      if (receivingTeam && receivingTeam.user_id) {
        await addLogMessage(
          `New offer: ${team.name} wants to buy ${playerData.name} for ${price.toLocaleString()}€`,
          receivingTeam,
          'OPEN_INCOMING_OFFERS'
        )
      }
    }

    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async acceptOffer (offer, req) {
    const { gameDay, season } = await getGameDayAndSeason()
    const sellingTeam = await getTeam(req)
    delete offer.created_at
    await acceptOffer(offer, sellingTeam, gameDay, season)
    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async cancelOffer (offer, req) {
    const team = await getTeam(req)
    if (!offer.id || !team.id) throw new BadRequestError('Nope...')
    await query('DELETE FROM trade_offer WHERE from_team_id=? AND id=?', [team.id, offer.id])
    return { success: true }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async declineOffer (offer, _req) {
    if (!offer || !offer.id) throw new BadRequestError('Nope...')
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
