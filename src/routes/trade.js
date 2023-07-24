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
import { updateTeamBalance } from '../helper/financeHelpr.js'

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
    const team = await getTeam(req)
    if (team.balance < req.body.price) throw new BadRequestError('Not enough money...')
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
    const [{ game_day: gameDay, season }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
    const sellingTeam = await getTeam(req)

    // Check that offer is correct
    /** @type {TradeOfferType} */
    delete req.body.offer.created_at
    const offer = new TradeOffer(req.body.offer)
    const offers = await query(`
      SELECT tro.* FROM trade_offer tro 
          JOIN player p ON p.id=tro.player_id 
          JOIN team t on p.team_id = t.id 
               WHERE t.id=? AND tro.type='buy'
    `, [sellingTeam.id])
    if (!offers.some(o => o.id === offer.id)) throw new BadRequestError('No offer exist')

    // get corresponding player
    /** @type {PlayerType[]} */
    const [player] = await query('SELECT * FROM player WHERE id=? LIMIT 1', [offer.player_id])
    if (!player) throw new BadRequestError('Player does not exist')

    // Update player and trade offer
    player.team_id = offer.from_team_id
    await query('UPDATE player SET team_id=? WHERE id=?', [player.team_id, player.id])
    await query('DELETE FROM trade_offer WHERE id=?', offer.id)

    // Move balance
    const [buyingTeam] = await query('SELECT *  FROM team WHERE id=? LIMIT 1', [offer.from_team_id])
    await updateTeamBalance(sellingTeam, offer.offer_value, `Selling player ${player.name} to ${buyingTeam.name}`, gameDay, season)
    await updateTeamBalance(buyingTeam, offer.offer_value * -1, `Buying player ${player.name} from ${sellingTeam.name}`, gameDay, season)
    return { success: true }
  }
}
