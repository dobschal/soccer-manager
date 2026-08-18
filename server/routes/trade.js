import { query } from '../lib/database.js'
import { TradeOffer } from '../entities/tradeOffer.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { acceptOffer, declineOffer, getOpenSellOffersByTeamId, MAX_SELL_OFFERS_PER_TEAM, MAX_TRANSFERS_PER_SEASON } from '../helper/tradeHelper.js'
import { botDecisionDate, shouldBotAcceptBuyOffer } from '../helper/botTradeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId, MAX_TEAM_SIZE } from '../helper/playerHelper.js'
import { t, getUserLocale } from '../i18n/index.js'
import { getMinOfferPrice } from '../../client/util/player.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'

export default {

  /**
   * @returns {Promise<{offers: TradeOfferType[], players: PlayerType[], teams: TeamType[]}>}
   */
  async getOffers () {
    const { season } = await getGameDayAndSeason()
    /** @type {TradeOfferType[]} */
    const allOffers = await query('SELECT * FROM trade_offer WHERE status=\'open\'')
    if (allOffers.length === 0) return { offers: [], players: [], teams: [] }
    const playerIds = allOffers.map(o => o.player_id)
    /** @type {PlayerType[]} */
    // carrier_end_season >= season keeps players who are still active this
    // season (including their final season) so their open offers stay visible
    // and acceptable. Only genuinely retired players (carrier_end_season <
    // season) are dropped. This matches the urgencies count in
    // getIncomingBuyOffers, which otherwise flags offers the list hid.
    const players = await query(
      'SELECT * FROM player WHERE id IN (?) AND carrier_end_season >= ?',
      [playerIds, season]
    )
    const activePlayerIds = new Set(players.map(p => p.id))
    const playersById = new Map(players.map(p => [p.id, p]))
    const offers = allOffers.filter(o => {
      if (!activePlayerIds.has(o.player_id)) return false
      // Never surface a stale sell offer whose player no longer belongs to the
      // listing team (e.g. the player became a free agent or was signed
      // elsewhere without the offer being cleaned up) — see #512.
      if (o.type === 'sell') {
        const player = playersById.get(o.player_id)
        if (!player || player.team_id !== o.from_team_id) return false
      }
      return true
    })
    const teamIds = players.map(p => p.team_id).filter(id => id != null)
    for (const offer of offers) {
      if (offer.from_team_id != null && !teamIds.includes(offer.from_team_id)) {
        teamIds.push(offer.from_team_id)
      }
    }
    /** @type {TeamType[]} */
    const teams = teamIds.length > 0
      ? await query('SELECT * FROM team WHERE id IN (?)', [teamIds])
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
    // Neither side of a transfer may be priced below 75% of the player's market
    // value (#446) — this keeps players from being pushed between accounts for
    // a symbolic price.
    /** @type {PlayerType|null} - the stored player a buy offer targets */
    let buyTargetPlayer = null
    if (type === 'buy') {
      buyTargetPlayer = await getPlayerById(player.id)
      if (!buyTargetPlayer) throw new BadRequestError(t('error.playerNotFound', {}, locale))
      const marketValue = await getAveragePlanPriceOfPlayer(buyTargetPlayer, season)
      const minPrice = getMinOfferPrice(marketValue)
      if (price < minPrice) {
        throw new BadRequestError(t('error.buyPriceTooLow', { minPrice: minPrice.toLocaleString() }, locale))
      }
    }
    if (type === 'sell') {
      const openSellOffers = await getOpenSellOffersByTeamId(team.id)
      if (openSellOffers.length >= MAX_SELL_OFFERS_PER_TEAM) {
        throw new BadRequestError(t('error.sellOfferLimitReached', { max: MAX_SELL_OFFERS_PER_TEAM }, locale))
      }
      const dbPlayer = await getPlayerById(player.id)
      if (!dbPlayer) throw new BadRequestError(t('error.playerNotFound', {}, locale))
      // Only the team that actually owns the player may list them for sale.
      // Without this guard a team could list a free agent (team_id NULL) or a
      // player owned by someone else, leaving them on the market while still a
      // free agent or belonging to another club (#512).
      if (dbPlayer.team_id !== team.id) throw new BadRequestError(t('error.notYourPlayer', {}, locale))
      // A free-market signing costs nothing, so a player just signed from the free market must
      // not be flipped for instant profit. Block the sell if the most recent ownership event
      // for this player is a HIRED (free-market signing, not a paid transfer) in this season.
      const [latestOwnership] = await query(
        'SELECT type, season FROM player_history WHERE player_id=? AND type IN (\'HIRED\', \'TRANSFER\') ORDER BY id DESC LIMIT 1',
        [player.id]
      )
      if (latestOwnership && latestOwnership.type === 'HIRED' && latestOwnership.season === season) {
        throw new BadRequestError(t('error.freeAgentSellLock', {}, locale))
      }
      // A player may change clubs at most MAX_TRANSFERS_PER_SEASON times — no point listing one who can't be sold again.
      const [{ count: transfersThisSeason }] = await query(
        'SELECT COUNT(*) AS count FROM trade_history WHERE player_id=? AND season=?',
        [player.id, season]
      )
      if (transfersThisSeason >= MAX_TRANSFERS_PER_SEASON) throw new BadRequestError(t('error.playerAlreadyTransferredThisSeason', {}, locale))
      const marketValue = await getAveragePlanPriceOfPlayer(dbPlayer, season)
      const minPrice = getMinOfferPrice(marketValue)
      if (price < minPrice) {
        throw new BadRequestError(t('error.sellPriceTooLow', { minPrice: minPrice.toLocaleString() }, locale))
      }
    }
    // Who owns the player a buy offer is for — looked up from the stored row, not
    // from the client payload.
    const receivingTeam = buyTargetPlayer?.team_id ? await getTeamById(buyTargetPlayer.team_id) : null
    // A bot manager does not answer inside this request anymore: the decision is
    // scheduled up to 24 hours out and executed by processDueBotOfferDecisions().
    // Answering instantly let users probe a bot's randomized acceptance threshold
    // with a burst of offers, and it made the market feel like a vending machine
    // instead of a league full of managers. Storing the due date on the row keeps
    // a pending decision across restarts. The IOC is exempt — see below.
    const isBotManagedSeller = Boolean(receivingTeam && !receivingTeam.user_id && !receivingTeam.is_system_team)
    const tradeOffer = new TradeOffer({
      offer_value: price,
      type: type,
      player_id: player.id,
      from_team_id: team.id,
      game_day: gameDay,
      season: season,
      allow_instant_buy: type === 'sell' && allowInstantBuy === false ? 0 : 1,
      ...(isBotManagedSeller ? { bot_decision_at: botDecisionDate() } : {})
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
    if (type === 'buy' && receivingTeam) {
      // A bot manager answers later — the due date was stored above.
      if (isBotManagedSeller) return { success: true }

      // The IOC is a market maker, not a manager, so it still answers instantly:
      // its whole purpose is to keep the transfer market liquid.
      if (!receivingTeam.user_id) {
        const [insertedOffer] = await query(
          'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\' AND status=\'open\'',
          [team.id, player.id]
        )
        if (insertedOffer) {
          const squad = await getPlayersByTeamId(receivingTeam.id)
          if (await shouldBotAcceptBuyOffer(receivingTeam, buyTargetPlayer, insertedOffer, squad)) {
            await acceptOffer(insertedOffer, receivingTeam, gameDay, season, locale)
          } else {
            await declineOffer(insertedOffer)
          }
        }
        return { success: true }
      }

      const receiverLocale = await getUserLocale(receivingTeam.user_id)
      await addLogMessage(
        t('log.offerReceived', { price: price.toLocaleString(), playerName: buyTargetPlayer.name, fromTeam: team.name }, receiverLocale),
        receivingTeam,
        'OPEN_INCOMING_OFFERS',
        null,
        'shopping-cart',
        undefined,
        'info'
      )
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
        'info',
        { playerId: playerData.id }
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
    // Look the offer up before deleting so the websocket notification below
    // has the player id + offer type even after the row is gone.
    const [existing] = await query('SELECT player_id, type FROM trade_offer WHERE from_team_id=? AND id=? AND status=\'open\'', [team.id, offer.id])
    await query('DELETE FROM trade_offer WHERE from_team_id=? AND id=? AND status=\'open\'', [team.id, offer.id])
    // Only sell-offer cancellations affect the seller's own player rows; buy
    // offers don't render a marker on the buying team's PlayerList.
    if (existing && existing.type === 'sell' && team.user_id) {
      sendToUser(team.user_id, SERVER_EVENTS.REMOVE_SELL_TRADE_OFFER.name, { playerId: existing.player_id })
    }
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
   * Get player IDs that have open sell offers for a given team.
   * Used to render the "on transfer market" icon on foreign team pages.
   * @param {number} teamId
   * @returns {Promise<{playerIds: number[]}>}
   */
  async getTeamSellOfferPlayerIds (teamId) {
    const offers = await getOpenSellOffersByTeamId(teamId)
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
