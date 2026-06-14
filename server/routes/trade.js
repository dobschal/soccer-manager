import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { acceptOffer, declineOffer, getOpenSellOffersByTeamId } from '../helper/tradeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId, MAX_TEAM_SIZE } from '../helper/playerHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import { getPositionsOfFormation } from '../../client/util/formation.js'
import { advanceTutorialIfStep, TUTORIAL_STEPS } from '../helper/tutorialHelper.js'

export default {

  /**
   * @returns {Promise<{offers: TradeOfferType[], players: PlayerType[], teams: TeamType[]}>}
   */
  async getOffers () {
    /** @type {TradeOfferType[]} */
    const offers = await query('SELECT * FROM trade_offer WHERE status=\'open\'')
    if (offers.length === 0) return { offers, players: [], teams: [] }
    const playerIds = offers.map(o => o.player_id).join(', ')
    /** @type {PlayerType[]} */
    const players = await query(`SELECT * FROM player WHERE id IN (${playerIds})`)
    const teamIds = players.map(p => p.team_id).filter(id => id != null)
    for (const offer of offers) {
      if (offer.from_team_id != null && !teamIds.includes(offer.from_team_id)) {
        teamIds.push(offer.from_team_id)
      }
    }
    /** @type {TeamType[]} */
    const teams = teamIds.length > 0
      ? await query(`SELECT * FROM team WHERE id IN (${teamIds.join(', ')})`)
      : []
    players.forEach(p => p.in_game_position = null)
    return { offers, players, teams }
  },

  /**
   * @param {PlayerType} player
   * @param {number} price
   * @param {string} type
   * @param {boolean} allowInstantBuy - sell offers only: whether to allow other users to instantly buy at this price
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async addTradeOffer (player, price, type, allowInstantBuy, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    if (type === 'buy' && team.balance < price) throw new BadRequestError(t('error.notEnoughMoney', {}, locale))
    if (!player || typeof player !== 'object') throw new BadRequestError(t('error.playerNotFound', {}, locale))
    if (typeof price !== 'number') throw new BadRequestError(t('error.invalidOfferValue', {}, locale))
    if (typeof type !== 'string') throw new BadRequestError(t('error.invalidRequest', {}, locale))
    if (price <= 0) throw new BadRequestError(t('error.invalidOfferValue', {}, locale))
    if (type === 'buy') {
      const teamPlayers = await getPlayersByTeamId(team.id)
      if (teamPlayers.length >= MAX_TEAM_SIZE) throw new BadRequestError(t('error.teamTooLarge', {}, locale))
    }
    const { gameDay, season } = await getGameDayAndSeason()
    const tradeOffer = new TradeOffer({
      offer_value: price,
      type: type,
      player_id: player.id,
      from_team_id: team.id,
      game_day: gameDay,
      season: season,
      allow_instant_buy: type === 'sell' && allowInstantBuy === false ? 0 : 1
    })
    const results = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND status=\'open\'', [tradeOffer.from_team_id, tradeOffer.player_id])
    if (results.length > 0) throw new BadRequestError(t('error.playerAlreadyListed', {}, locale))
    if (type === 'buy') {
      const [{ count }] = await query(
        'SELECT COUNT(*) AS count FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\' AND game_day=? AND season=?',
        [team.id, player.id, gameDay, season]
      )
      if (count >= 3) throw new BadRequestError(t('error.offerLimitReached', {}, locale))
    }
    await query('INSERT INTO trade_offer SET ?', tradeOffer)

    // Notify the player's team about the incoming buy offer
    if (type === 'buy' && player.team_id) {
      const playerData = await getPlayerById(player.id)
      const receivingTeam = await getTeamById(player.team_id)

      // Auto-accept: if the player's team is a bot and has a sell offer at or below the buy price
      if (receivingTeam && !receivingTeam.user_id) {
        const [sellOffer] = await query(
          'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'sell\' AND status=\'open\'',
          [receivingTeam.id, player.id]
        )
        if (sellOffer && price >= sellOffer.offer_value) {
          const [insertedOffer] = await query(
            'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\' AND status=\'open\'',
            [team.id, player.id]
          )
          if (insertedOffer) {
            await acceptOffer(insertedOffer, receivingTeam, gameDay, season, locale)
          }
          return { success: true }
        }

        // No matching sell offer or price too low — full bot evaluation
        const [insertedOffer] = await query(
          'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\' AND status=\'open\'',
          [team.id, player.id]
        )
        if (insertedOffer) {
          const players = await getPlayersByTeamId(receivingTeam.id)
          const positionsNeeded = getPositionsOfFormation(receivingTeam.formation)
          const playersInSamePosition = players.filter(p => p.position === playerData.position && p.id !== playerData.id)
          const positionsRequiredForFormation = positionsNeeded.filter(p => p === playerData.position).length
          const wouldLeaveHole = playersInSamePosition.length < positionsRequiredForFormation
          const remainingPlayersInPosition = playersInSamePosition.filter(p => p.level >= playerData.level - 2)
          const teamWouldBeOkAfterSale = remainingPlayersInPosition.length >= positionsRequiredForFormation

          const openSellOffers = await getOpenSellOffersByTeamId(receivingTeam.id)
          const matchingSellOffer = openSellOffers.find(o => o.player_id === playerData.id)
          const averagePrice = await getAveragePlanPriceOfPlayer(playerData)
          const basePrice = matchingSellOffer ? matchingSellOffer.offer_value : averagePrice

          let minAcceptablePrice
          if (wouldLeaveHole) {
            if (!teamWouldBeOkAfterSale || playersInSamePosition.length === 0) {
              await declineOffer(insertedOffer)
              return { success: true }
            }
            const premiumFactor = 1.5 + Math.random() * 0.5
            minAcceptablePrice = basePrice * premiumFactor
          } else {
            const randomFactor = 0.8 + Math.random() * 0.4
            minAcceptablePrice = basePrice * randomFactor
          }

          if (price >= minAcceptablePrice) {
            await acceptOffer(insertedOffer, receivingTeam, gameDay, season, locale)
          } else {
            await declineOffer(insertedOffer)
          }
        }
        return { success: true }
      }

      if (receivingTeam && receivingTeam.user_id) {
        const receiverLocale = await getUserLocale(receivingTeam.user_id)
        await addLogMessage(
          t('log.offerReceived', { price: price.toLocaleString(), playerName: playerData.name, fromTeam: team.name }, receiverLocale),
          receivingTeam,
          'OPEN_INCOMING_OFFERS',
          null,
          'shopping-cart',
          undefined,
          'info'
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
        'NEW_SELL_TRADE_OFFER',
        'info'
      )
    }

    return { success: true }
  },

  /**
   * Buy a listed player immediately at the seller's asking price, without seller confirmation.
   * @param {number} playerId
   * @param {Request} req
   * @returns {Promise<{success: boolean, price: number}>}
   */
  async instantBuyPlayer (playerId, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    if (typeof playerId !== 'number') throw new BadRequestError(t('error.playerNotFound', {}, locale))

    const player = await getPlayerById(playerId)
    if (!player) throw new BadRequestError(t('error.playerNotFound', {}, locale))
    if (player.team_id === team.id) throw new BadRequestError(t('error.cannotBuyOwnPlayer', {}, locale))

    const [sellOffer] = await query(
      'SELECT * FROM trade_offer WHERE player_id=? AND type=\'sell\' AND status=\'open\' LIMIT 1',
      [player.id]
    )
    if (!sellOffer) throw new BadRequestError(t('error.playerNotOnMarket', {}, locale))
    if (sellOffer.from_team_id !== player.team_id) throw new BadRequestError(t('error.playerNotOnMarket', {}, locale))
    if (sellOffer.allow_instant_buy === 0) throw new BadRequestError(t('error.instantBuyDisabled', {}, locale))

    const price = sellOffer.offer_value
    if (team.balance < price) throw new BadRequestError(t('error.notEnoughMoney', {}, locale))

    const teamPlayers = await getPlayersByTeamId(team.id)
    if (teamPlayers.length >= MAX_TEAM_SIZE) throw new BadRequestError(t('error.teamTooLarge', {}, locale))

    const sellingTeam = await getTeamById(sellOffer.from_team_id)
    if (!sellingTeam) throw new BadRequestError(t('error.playerNotOnMarket', {}, locale))

    const { gameDay, season } = await getGameDayAndSeason()

    // Remove any open buy offer this team already made for the player to avoid conflicts during accept.
    await query(
      'DELETE FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\' AND status=\'open\'',
      [team.id, player.id]
    )

    const tradeOffer = new TradeOffer({
      offer_value: price,
      type: 'buy',
      player_id: player.id,
      from_team_id: team.id,
      game_day: gameDay,
      season: season
    })
    const insertResult = await query('INSERT INTO trade_offer SET ?', tradeOffer)
    const [insertedOffer] = await query('SELECT * FROM trade_offer WHERE id=?', [insertResult.insertId])
    await acceptOffer(insertedOffer, sellingTeam, gameDay, season, locale)

    await advanceTutorialIfStep(req.user.id, TUTORIAL_STEPS.BUY_PLAYER, TUTORIAL_STEPS.UPDATE_STADIUM_PRICES)
    return { success: true, price }
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
    await query('DELETE FROM trade_offer WHERE from_team_id=? AND id=? AND status=\'open\'', [team.id, offer.id])
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
    const [offer] = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND status=\'open\'', [team.id, player.id])
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
      'SELECT player_id FROM trade_offer WHERE from_team_id=? AND type=? AND status=\'open\'',
      [team.id, 'sell']
    )
    return { playerIds: offers.map(o => o.player_id) }
  },

  /**
   * Check if a player has a sell offer
   * @param {number} playerId
   * @returns {Promise<{hasSellOffer: boolean, sellOfferPrice: (number|null), allowInstantBuy: boolean}>}
   */
  async hasPlayerSellOffer (playerId) {
    const [offer] = await query(
      'SELECT id, offer_value, allow_instant_buy FROM trade_offer WHERE player_id=? AND type=? AND status=\'open\' LIMIT 1',
      [playerId, 'sell']
    )
    return {
      hasSellOffer: !!offer,
      sellOfferPrice: offer?.offer_value ?? null,
      allowInstantBuy: offer ? offer.allow_instant_buy !== 0 : false
    }
  },

  /**
   * @param {Request} req
   * @returns {Promise<{answeredOffers: TradeOfferType[], players: PlayerType[], teams: TeamType[]}>}
   */
  async getAnsweredOffers (req) {
    const team = await getTeam(req)
    const answeredOffers = await query(
      'SELECT * FROM trade_offer WHERE from_team_id=? AND status IN (\'accepted\', \'rejected\') ORDER BY id DESC',
      [team.id]
    )
    if (answeredOffers.length === 0) return { answeredOffers, players: [], teams: [] }
    const playerIds = answeredOffers.map(o => o.player_id)
    const players = await query(`SELECT * FROM player WHERE id IN (${playerIds.join(', ')})`)
    const teamIds = [...new Set(players.map(p => p.team_id).filter(id => id != null))]
    const teams = teamIds.length > 0
      ? await query(`SELECT * FROM team WHERE id IN (${teamIds.join(', ')})`)
      : []
    return { answeredOffers, players, teams }
  },

  /**
   * @param {TradeOfferType} offer
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async dismissOffer (offer, req) {
    const locale = req.locale || 'en'
    const team = await getTeam(req)
    if (!offer.id || !team.id) throw new BadRequestError(t('error.offerNotFound', {}, locale))
    await query('UPDATE trade_offer SET status=\'dismissed\' WHERE from_team_id=? AND id=? AND status IN (\'accepted\', \'rejected\')', [team.id, offer.id])
    return { success: true }
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
