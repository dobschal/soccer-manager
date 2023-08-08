import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import {
  checkType,
  RequiredNumber,
  RequiredObject,
  RequiredString
} from '../lib/type-checker.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamhelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { acceptOffer, declineOffer } from '../helper/tradeHelper.js'
import team from './team.js'

export default {

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
    return { offers, players, teams }
  },

  async addTradeOffer (req) {
    const team = await getTeam(req)
    if (req.body.type === 'buy' && team.balance < req.body.price) throw new BadRequestError('Not enough money...')
    checkType(req.body, {
      player: RequiredObject,
      price: RequiredNumber,
      type: RequiredString
    })
    if (req.body.price <= 0) throw new BadRequestError('Price needs to be greater than 0.')
    const tradeOffer = new TradeOffer({
      offer_value: req.body.price,
      type: req.body.type,
      player_id: req.body.player.id,
      from_team_id: team.id
    })
    const results = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=?', [tradeOffer.from_team_id, tradeOffer.player_id])
    if (results.length > 0) throw new BadRequestError('Already added an offer for that player...')
    await query('INSERT INTO trade_offer SET ?', tradeOffer)
    return { success: true }
  },

  async acceptOffer (req) {
    const { gameDay, season } = await getGameDayAndSeason()
    const sellingTeam = await getTeam(req)

    // Check that offer is correct
    /** @type {TradeOfferType} */
    delete req.body.offer.created_at
    await acceptOffer(req.body.offer, sellingTeam, gameDay, season)
    return { success: true }
  },

  async cancelOffer (req) {
    const team = await getTeam(req)
    if (!req.body.offer.id || !team.id) throw new BadRequestError('Nope...')
    await query('DELETE FROM trade_offer WHERE from_team_id=? AND id=?', [team.id, req.body.offer.id])
    return { success: true }
  },

  async declineOffer (req) {
    //
    // TODO: Secure route
    //
    if (!req.body.offer || !req.body.offer.id) throw new BadRequestError('Nope...')
    /** @type {TradeOfferType} */
    const offer = req.body.offer
    await declineOffer(offer)
    return { success: true }
  },

  async myOfferForPlayer (req) {
    const team = await getTeam(req)
    const [offer] = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=?', [team.id, req.body.player.id])
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
