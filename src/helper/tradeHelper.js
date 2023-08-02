import { TradeOffer } from '../entities/tradeOffer.js'
import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { updateTeamBalance } from './financeHelpr.js'
import { addNews } from './newsHelper.js'
import { getTeamById } from './teamhelper.js'

export async function acceptOffer (offer, sellingTeam, gameDay, season) {
  offer = new TradeOffer(offer)
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
  await query('DELETE FROM trade_offer WHERE player_id=?', player.id)

  // Move balance
  const [buyingTeam] = await query('SELECT *  FROM team WHERE id=? LIMIT 1', [offer.from_team_id])
  await updateTeamBalance(sellingTeam, offer.offer_value, `Selling player ${player.name} to ${buyingTeam.name}`, gameDay, season)
  await updateTeamBalance(buyingTeam, offer.offer_value * -1, `Buying player ${player.name} from ${sellingTeam.name}`, gameDay, season)

  await addNews(`You sold your player ${player.name} to the team ${buyingTeam.name}.`, sellingTeam)
  await addNews(`You bought the player ${player.name} from ${sellingTeam.name}.`, buyingTeam)
}

/**
 * @param {TradeOfferType} offer
 * @returns {Promise<void>}
 */
export async function declineOffer (offer) {
  await query('DELETE FROM trade_offer WHERE type="buy" AND id=?', [offer.id])
  const player = await getTeamById(offer.player_id)
  const team = await getTeamById(offer.from_team_id)
  await addNews(`Your buy offer for ${player.name} from ${team.name} was NOT accepted!`, team)
}
