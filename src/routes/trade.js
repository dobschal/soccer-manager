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
    const offers = await query('SELECT * FROM trade_offer')
    const players = await query('SELECT * FROM player')
    //
    // TODO: optimise and not load all players...
    //
    return { offers, players }
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
