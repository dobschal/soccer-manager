import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import {
  checkType,
  RequiredNumber,
  RequiredObject,
  RequiredString
} from '../lib/type-checker.js'
import { BadRequestError } from '../lib/errors.js'

export default {

  async getOffers () {
    /** @type {TradeOfferType[]} */
    const offers = await query('SELECT * FROM trade_offer')
    const playerIds = offers.map(o => o.player_id).join(', ')
    /** @type {PlayerType[]} */
    const players = await query(`SELECT * FROM player WHERE id IN (${playerIds})`)
    const teamIds = players.map(p => p.team_id).join(', ')
    /** @type {TeamType[]} */
    const teams = await query(`SELECT * FROM team WHERE id IN (${teamIds})`)
    return { offers, players, teams }
  },

  async addTradeOffer (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
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
  }
}
