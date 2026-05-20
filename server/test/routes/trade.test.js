import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn(),
  getTeamById: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  acceptOffer: vi.fn(),
  declineOffer: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayerById: vi.fn(),
  getPlayersByTeamId: vi.fn().mockResolvedValue([]),
  getAveragePlanPriceOfPlayer: vi.fn(),
  MAX_TEAM_SIZE: 42
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam, getTeamById } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { acceptOffer, declineOffer } from '../../helper/tradeHelper.js'
import { getPlayerById, getPlayersByTeamId } from '../../helper/playerHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import handlers from '../../routes/trade.js'

describe('trade routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getOffers', () => {
    it('returns offers, players, and teams', async () => {
      const offers = [testData.tradeOffer()]
      const players = [testData.player()]
      const teams = [testData.team()]

      query
        .mockResolvedValueOnce(offers)
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce(teams)

      const result = await handlers.getOffers()

      expect(result.offers).toEqual(offers)
      expect(result.players[0].in_game_position).toBeNull()
    })

    it('returns empty arrays when no offers', async () => {
      query.mockResolvedValue([])

      const result = await handlers.getOffers()

      expect(result).toEqual({ offers: [], players: [], teams: [] })
    })
  })

  describe('addTradeOffer', () => {
    beforeEach(() => {
      getPlayersByTeamId.mockResolvedValue([])
    })

    it('creates trade offer', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([])  // no existing offers
        .mockResolvedValueOnce({})  // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO trade_offer SET ?',
        expect.objectContaining({
          offer_value: 50000,
          type: 'sell',
          player_id: player.id,
          from_team_id: team.id,
          game_day: 5,
          season: 1,
          allow_instant_buy: 1
        })
      )
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('stores allow_instant_buy=0 when seller disables instant buy', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', false, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO trade_offer SET ?',
        expect.objectContaining({
          type: 'sell',
          allow_instant_buy: 0
        })
      )
    })

    it('throws error for buy offer when not enough money', async () => {
      const team = testData.team({ balance: 10000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'buy', true, req))
        .rejects.toMatchObject({ message: 'Not enough money' })
    })

    it('throws error for invalid price', async () => {
      const team = testData.team()
      const player = testData.player()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 0, 'sell', true, req))
        .rejects.toMatchObject({ message: 'Invalid offer value' })

      await expect(handlers.addTradeOffer(player, -100, 'sell', true, req))
        .rejects.toMatchObject({ message: 'Invalid offer value' })
    })

    it('throws error for duplicate offer', async () => {
      const team = testData.team()
      const player = testData.player()
      const existingOffer = testData.tradeOffer()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue([existingOffer])

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'sell', true, req))
        .rejects.toMatchObject({ message: 'Player is already listed' })
    })

    it('throws error when buying team is already at maximum squad size', async () => {
      const team = testData.team({ balance: 1000000 })
      const player = testData.player({ team_id: 99 })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayersByTeamId.mockResolvedValue(new Array(42).fill({}))

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'buy', true, req))
        .rejects.toMatchObject({ message: 'Your team cannot have more than 42 players.' })
    })

    it('throws error when buy offer limit of 3 per player per game day is reached', async () => {
      const team = testData.team({ balance: 1000000 })
      const player = testData.player({ team_id: 99 })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query
        .mockResolvedValueOnce([])  // no open offers (duplicate check)
        .mockResolvedValueOnce([{ count: 3 }])  // 3 existing attempts this game day

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'buy', true, req))
        .rejects.toMatchObject({ message: 'You can only make 3 offers per player per game day' })
    })

    it('does not apply offer limit to sell offers', async () => {
      const team = testData.team({ balance: 1000000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([])  // no open offers (duplicate check)
        .mockResolvedValueOnce({})  // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('throws error when player is missing', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(null, 50000, 'sell', true, req))
        .rejects.toMatchObject({ message: 'Player not found' })
    })
  })

  describe('acceptOffer', () => {
    it('accepts trade offer', async () => {
      const team = testData.team()
      const offer = testData.tradeOffer({ created_at: '2024-01-01' })

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      acceptOffer.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.acceptOffer(offer, req)

      expect(result).toEqual({ success: true })
      expect(acceptOffer).toHaveBeenCalledWith(
        expect.not.objectContaining({ created_at: '2024-01-01' }),
        team,
        5,
        1,
        'en'
      )
    })
  })

  describe('cancelOffer', () => {
    it('cancels own trade offer', async () => {
      const team = testData.team()
      const offer = testData.tradeOffer({ from_team_id: team.id })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.cancelOffer(offer, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM trade_offer WHERE from_team_id=? AND id=? AND status=\'open\'',
        [team.id, offer.id]
      )
    })

    it('throws error for invalid offer', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.cancelOffer({ id: null }, req))
        .rejects.toMatchObject({ message: 'Offer not found' })
    })
  })

  describe('declineOffer', () => {
    it('declines trade offer', async () => {
      const offer = testData.tradeOffer()

      declineOffer.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.declineOffer(offer, req)

      expect(result).toEqual({ success: true })
      expect(declineOffer).toHaveBeenCalledWith(offer)
    })

    it('throws error for invalid offer', async () => {
      const req = createMockRequest()

      await expect(handlers.declineOffer(null, req))
        .rejects.toMatchObject({ message: 'Offer not found' })

      await expect(handlers.declineOffer({ id: null }, req))
        .rejects.toMatchObject({ message: 'Offer not found' })
    })
  })

  describe('myOfferForPlayer', () => {
    it('returns offer for player', async () => {
      const team = testData.team()
      const player = testData.player()
      const offer = testData.tradeOffer()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([offer])

      const req = createMockRequest()
      const result = await handlers.myOfferForPlayer(player, req)

      expect(result).toEqual({ offer })
    })

    it('returns undefined when no offer exists', async () => {
      const team = testData.team()
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.myOfferForPlayer(player, req)

      expect(result).toEqual({ offer: undefined })
    })
  })

  describe('getTradeHistory', () => {
    it('returns trade history with players and teams', async () => {
      const trades = [testData.tradeHistory()]
      const players = [testData.player()]
      const teams = [testData.team({ id: 1 }), testData.team({ id: 2 })]

      query
        .mockResolvedValueOnce(trades)
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce(teams)

      const result = await handlers.getTradeHistory()

      expect(result.trades).toEqual(trades)
      expect(result.players).toEqual(players)
      expect(result.teams).toEqual(teams)
    })

    it('returns empty arrays when no history', async () => {
      query.mockResolvedValue([])

      const result = await handlers.getTradeHistory()

      expect(result).toEqual({ trades: [], players: [], teams: [] })
    })
  })

  describe('getMySellOfferPlayerIds', () => {
    it('returns player IDs of sell offers from user team', async () => {
      const team = testData.team({ id: 1 })
      const offers = [
        { player_id: 10 },
        { player_id: 20 },
        { player_id: 30 }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(offers)

      const req = createMockRequest()
      const result = await handlers.getMySellOfferPlayerIds(req)

      expect(result).toEqual({ playerIds: [10, 20, 30] })
      expect(query).toHaveBeenCalledWith(
        'SELECT player_id FROM trade_offer WHERE from_team_id=? AND type=? AND status=\'open\'',
        [team.id, 'sell']
      )
    })

    it('returns empty array when no sell offers', async () => {
      const team = testData.team({ id: 1 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getMySellOfferPlayerIds(req)

      expect(result).toEqual({ playerIds: [] })
    })
  })

  describe('hasPlayerSellOffer', () => {
    it('returns true when player has a sell offer with instant buy allowed', async () => {
      query.mockResolvedValue([{ id: 1, offer_value: 500000, allow_instant_buy: 1 }])

      const result = await handlers.hasPlayerSellOffer(123)

      expect(result).toEqual({ hasSellOffer: true, sellOfferPrice: 500000, allowInstantBuy: true })
      expect(query).toHaveBeenCalledWith(
        'SELECT id, offer_value, allow_instant_buy FROM trade_offer WHERE player_id=? AND type=? AND status=\'open\' LIMIT 1',
        [123, 'sell']
      )
    })

    it('returns allowInstantBuy=false when seller disabled instant buy', async () => {
      query.mockResolvedValue([{ id: 1, offer_value: 500000, allow_instant_buy: 0 }])

      const result = await handlers.hasPlayerSellOffer(123)

      expect(result).toEqual({ hasSellOffer: true, sellOfferPrice: 500000, allowInstantBuy: false })
    })

    it('returns false when player has no sell offer', async () => {
      query.mockResolvedValue([])

      const result = await handlers.hasPlayerSellOffer(456)

      expect(result).toEqual({ hasSellOffer: false, sellOfferPrice: null, allowInstantBuy: false })
    })
  })

  describe('instantBuyPlayer', () => {
    it('buys a listed player at the asking price', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      const sellingTeam = testData.team({ id: 5, balance: 0 })
      const player = testData.player({ id: 42, team_id: 5 })
      const sellOffer = testData.tradeOffer({ id: 99, player_id: 42, from_team_id: 5, type: 'sell', offer_value: 250000 })
      const insertedOffer = testData.tradeOffer({ id: 100, player_id: 42, from_team_id: 2, type: 'buy', offer_value: 250000 })

      getTeam.mockResolvedValue(buyingTeam)
      getTeamById.mockResolvedValue(sellingTeam)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue([player])
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      query
        .mockResolvedValueOnce([sellOffer])      // find sell offer
        .mockResolvedValueOnce({})               // delete prior open buy offer
        .mockResolvedValueOnce({ insertId: 100 }) // insert new buy offer
        .mockResolvedValueOnce([insertedOffer])  // select inserted offer

      acceptOffer.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.instantBuyPlayer(42, req)

      expect(result).toEqual({ success: true, price: 250000 })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO trade_offer SET ?',
        expect.objectContaining({
          offer_value: 250000,
          type: 'buy',
          player_id: 42,
          from_team_id: buyingTeam.id,
          game_day: 5,
          season: 1
        })
      )
      expect(acceptOffer).toHaveBeenCalledWith(insertedOffer, sellingTeam, 5, 1, 'en')
    })

    it('throws when player has no open sell offer', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      const player = testData.player({ id: 42, team_id: 5 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValueOnce([]) // no sell offer

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'Player is not on the market' })
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('throws when buyer cannot afford the asking price', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 100000 })
      const player = testData.player({ id: 42, team_id: 5 })
      const sellOffer = testData.tradeOffer({ id: 99, player_id: 42, from_team_id: 5, type: 'sell', offer_value: 250000 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValueOnce([sellOffer])

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'Not enough money' })
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('throws when trying to buy own player', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      const player = testData.player({ id: 42, team_id: 2 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(player)

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'You cannot buy your own player' })
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('throws when buying team is already at max size', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      const player = testData.player({ id: 42, team_id: 5 })
      const sellOffer = testData.tradeOffer({ id: 99, player_id: 42, from_team_id: 5, type: 'sell', offer_value: 100000 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValueOnce([sellOffer])
      getPlayersByTeamId.mockResolvedValue(new Array(42).fill(testData.player()))

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'Your team cannot have more than 42 players.' })
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('throws when player not found', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(null)

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'Player not found' })
    })

    it('throws when playerId is not a number', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      getTeam.mockResolvedValue(buyingTeam)

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer('42', req))
        .rejects.toMatchObject({ message: 'Player not found' })
    })

    it('throws when seller disabled instant buy', async () => {
      const buyingTeam = testData.team({ id: 2, balance: 1000000 })
      const player = testData.player({ id: 42, team_id: 5 })
      const sellOffer = testData.tradeOffer({ id: 99, player_id: 42, from_team_id: 5, type: 'sell', offer_value: 100000, allow_instant_buy: 0 })

      getTeam.mockResolvedValue(buyingTeam)
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValueOnce([sellOffer])

      const req = createMockRequest()
      await expect(handlers.instantBuyPlayer(42, req))
        .rejects.toMatchObject({ message: 'The seller disabled instant buy for this player' })
      expect(acceptOffer).not.toHaveBeenCalled()
    })
  })
})
