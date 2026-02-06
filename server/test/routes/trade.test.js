import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  acceptOffer: vi.fn(),
  declineOffer: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { acceptOffer, declineOffer } from '../../helper/tradeHelper.js'
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
    it('creates trade offer', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([])  // no existing offers
        .mockResolvedValueOnce({})  // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO trade_offer SET ?',
        expect.objectContaining({
          offer_value: 50000,
          type: 'sell',
          player_id: player.id,
          from_team_id: team.id
        })
      )
    })

    it('throws error for buy offer when not enough money', async () => {
      const team = testData.team({ balance: 10000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'buy', req))
        .rejects.toMatchObject({ message: 'Not enough money' })
    })

    it('throws error for invalid price', async () => {
      const team = testData.team()
      const player = testData.player()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 0, 'sell', req))
        .rejects.toMatchObject({ message: 'Invalid offer value' })

      await expect(handlers.addTradeOffer(player, -100, 'sell', req))
        .rejects.toMatchObject({ message: 'Invalid offer value' })
    })

    it('throws error for duplicate offer', async () => {
      const team = testData.team()
      const player = testData.player()
      const existingOffer = testData.tradeOffer()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([existingOffer])

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'sell', req))
        .rejects.toMatchObject({ message: 'Player is already listed' })
    })

    it('throws error when player is missing', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(null, 50000, 'sell', req))
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
        'DELETE FROM trade_offer WHERE from_team_id=? AND id=?',
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
})
