import { TradeOffer } from '../entities/tradeOffer.js'
import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage, checkTeamAndNotify } from './logMessageHelper.js'
import { getTeamById } from './teamHelper.js'
import { getPlayerAge, getPlayerById, getPlayersByTeamId } from './playerHelper.js'
import { TradeHistory } from '../entities/tradeHistory.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { addPlayerHistory } from './playerHistoryHelper.js'
import { t, getUserLocale } from '../i18n/index.js'

/**
 * @param {number} teamId
 * @returns {Promise<TradeOfferType[]>}
 */
export async function getOpenSellOffersByTeamId (teamId) {
  return await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'sell\'', [teamId])
}

/**
 * @param {number} teamId
 * @returns {Promise<TradeOfferType[]>}
 */
export async function getOpenByOffersByTeamId (teamId) {
  return await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'buy\'', [teamId])
}

/**
 * @param {number} teamId
 * @returns {Promise<Array<TradeOfferType>>}
 */
export async function getIncomingBuyOffers (teamId) {
  const players = await getPlayersByTeamId(teamId)
  return await query(
    `SELECT * FROM trade_offer WHERE from_team_id <> ? AND type = 'buy' AND player_id IN (${players.map(p => p.id).join(', ')}) ORDER BY offer_value DESC`,
    [teamId]
  )
}

/**
 * @param {TradeOfferType} offer
 * @param {TeamType} sellingTeam
 * @param {number} gameDay
 * @param {number} season
 * @param {string} [locale='en']
 * @returns {Promise<void>}
 */
export async function acceptOffer (offer, sellingTeam, gameDay, season, locale = 'en') {
  offer = new TradeOffer(offer)
  const offers = await query(`
      SELECT tro.* FROM trade_offer tro
          JOIN player p ON p.id=tro.player_id
          JOIN team t on p.team_id = t.id
               WHERE t.id=? AND tro.type='buy'
    `, [sellingTeam.id])
  if (!offers.some(o => o.id === offer.id)) throw new BadRequestError(t('error.offerNotFound', {}, locale))

  // get corresponding player
  const player = await getPlayerById(offer.player_id)
  if (!player) throw new BadRequestError(t('error.playerNotFound', {}, locale))

  // Update player and trade offer
  player.team_id = offer.from_team_id
  await query('UPDATE player SET team_id=?, in_game_position=NULL WHERE id=?', [player.team_id, player.id])
  await query('DELETE FROM trade_offer WHERE player_id=?', player.id)

  // Move balance - use user's language for log messages
  const buyingTeam = await getTeamById(offer.from_team_id)
  const sellerLocale = sellingTeam.user_id ? await getUserLocale(sellingTeam.user_id) : 'en'
  const buyerLocale = buyingTeam.user_id ? await getUserLocale(buyingTeam.user_id) : 'en'

  await updateTeamBalance(sellingTeam, offer.offer_value, t('finance.playerSold', { playerName: player.name }, sellerLocale), gameDay, season)
  await updateTeamBalance(buyingTeam, offer.offer_value * -1, t('finance.playerBought', { playerName: player.name }, buyerLocale), gameDay, season)

  const historyItem = new TradeHistory({
    season,
    game_day: gameDay,
    player_id: player.id,
    from_team_id: sellingTeam.id,
    to_team_id: buyingTeam.id,
    price: offer.offer_value,
    player_level: player.level
  })
  await query('INSERT INTO trade_history SET ?', historyItem)

  await addLogMessage(t('log.playerSold', { playerName: player.name, buyerTeam: buyingTeam.name, price: offer.offer_value.toLocaleString() }, sellerLocale), sellingTeam, 'OPEN_TEAM_PAGE', buyingTeam.id, 'exchange')
  await addLogMessage(t('log.playerBought', { playerName: player.name, sellerTeam: sellingTeam.name, price: offer.offer_value.toLocaleString() }, buyerLocale), buyingTeam, 'OPEN_PLAYER', player.id, 'exchange')
  await addPlayerHistory(player.id, 'TRANSFER', buyingTeam.id)

  // Check both teams for lineup issues after trade
  await checkTeamAndNotify(sellingTeam)
  await checkTeamAndNotify(buyingTeam)
}

/**
 * @param {TradeOfferType} offer
 * @returns {Promise<void>}
 */
export async function declineOffer (offer) {
  await query('DELETE FROM trade_offer WHERE type="buy" AND id=?', [offer.id])
  const player = await getPlayerById(offer.player_id)
  const team = await getTeamById(offer.from_team_id)
  const locale = team.user_id ? await getUserLocale(team.user_id) : 'en'
  await addLogMessage(t('log.offerRejected', { playerName: player.name }, locale), team, 'OPEN_PLAYER', player.id, 'times-circle')
}

/**
 * @param {string} position
 * @param {number} age
 * @param {number} level
 * @returns {Promise<(TradeHistoryType & PlayerType)[]>}
 */
export async function getPastTrades (position, age, level) {
  /** @type {(TradeHistoryType & PlayerType)[]} */
  const trades = await query(`
    SELECT * FROM trade_history th 
        JOIN player p on th.player_id = p.id
    WHERE p.position=? AND p.level=?
  `, [position, level])
  const { season } = await getGameDayAndSeason()
  const retVal = []
  for (const tradeWithPlayer of trades) {
    const age2 = await getPlayerAge(tradeWithPlayer, season)
    if (age2 === age) retVal.push(tradeWithPlayer)
  }
  return retVal
}
