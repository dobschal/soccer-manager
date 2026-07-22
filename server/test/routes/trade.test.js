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
  declineOffer: vi.fn(),
  getOpenSellOffersByTeamId: vi.fn(),
  MAX_SELL_OFFERS_PER_TEAM: 5,
  MAX_TRANSFERS_PER_SEASON: 2
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
import { acceptOffer, declineOffer, getOpenSellOffersByTeamId, MAX_SELL_OFFERS_PER_TEAM, MAX_TRANSFERS_PER_SEASON } from '../../helper/tradeHelper.js'
import { getPlayerById, getPlayersByTeamId, getAveragePlanPriceOfPlayer } from '../../helper/playerHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import handlers from '../../routes/trade.js'

describe('trade routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getOffers', () => {
    it('returns offers, players, and teams', async () => {
      const offers = [testData.tradeOffer()]
      const players = [testData.player({ carrier_end_season: 10 })]
      const teams = [testData.team()]

      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 2 })
      query
        .mockResolvedValueOnce(offers)
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce(teams)

      const result = await handlers.getOffers()

      expect(result.offers).toEqual(offers)
      expect(result.players[0].in_game_position).toBeNull()
    })

    it('returns empty arrays when no offers', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 2 })
      query.mockResolvedValue([])

      const result = await handlers.getOffers()

      expect(result).toEqual({ offers: [], players: [], teams: [] })
    })

    it('excludes offers whose player has already retired (carrier_end_season <= season)', async () => {
      // Two offers open — one for an active player, one for a retired player.
      const offers = [
        testData.tradeOffer({ id: 1, player_id: 100 }),
        testData.tradeOffer({ id: 2, player_id: 200 })
      ]
      // The player query filters by carrier_end_season > season, so only the
      // active player comes back.
      const activePlayers = [testData.player({ id: 100, carrier_end_season: 10 })]
      const teams = [testData.team()]

      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 8 })
      query
        .mockResolvedValueOnce(offers)
        .mockResolvedValueOnce(activePlayers)
        .mockResolvedValueOnce(teams)

      const result = await handlers.getOffers()

      // Retired player's offer must be filtered out — the transfer market
      // should not surface players who can no longer be signed.
      expect(result.offers).toHaveLength(1)
      expect(result.offers[0].id).toBe(1)
      expect(result.players).toHaveLength(1)
      expect(result.players[0].id).toBe(100)

      // Player fetch must pass carrier_end_season filter with the current season.
      const playerCall = query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('FROM player'))
      expect(playerCall).toBeDefined()
      expect(playerCall[0]).toContain('carrier_end_season > ?')
      expect(playerCall[1]).toEqual([[100, 200], 8])
    })
  })

  describe('addTradeOffer', () => {
    beforeEach(() => {
      getPlayersByTeamId.mockResolvedValue([])
      getOpenSellOffersByTeamId.mockResolvedValue([])
    })

    it('creates trade offer', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([])  // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }])  // no transfer this season
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

    it('#446 rejects a sell offer below 50% of the market value', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000) // market value -> min 50000
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }]) // no transfer this season

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 49999, 'sell', true, req))
        .rejects.toMatchObject({ message: expect.stringContaining('50%') })
    })

    it('#446 allows a sell offer at exactly 50% of the market value', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000) // min 50000
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }]) // no transfer this season
        .mockResolvedValueOnce([]) // no existing offers
        .mockResolvedValueOnce({}) // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects a sell offer for a player who already changed clubs the maximum times this season', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: MAX_TRANSFERS_PER_SEASON }]) // already at the transfer limit this season

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'sell', true, req))
        .rejects.toMatchObject({ message: expect.stringContaining('season') })
      expect(query).not.toHaveBeenCalledWith('INSERT INTO trade_offer SET ?', expect.anything())
    })

    it('allows a sell offer for a player who has only changed clubs once this season', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: 1 }]) // one prior transfer — still below the limit
        .mockResolvedValueOnce([]) // no existing offer for this player
        .mockResolvedValueOnce({}) // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects a sell offer for a player just signed from the free market this season', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 3 })
      getPlayerById.mockResolvedValue(player)
      // Latest ownership event is a HIRED (free-market signing) in the current season.
      query.mockResolvedValueOnce([{ type: 'HIRED', season: 3 }])

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'sell', true, req))
        .rejects.toMatchObject({ message: expect.stringContaining('free market') })
      expect(query).not.toHaveBeenCalledWith('INSERT INTO trade_offer SET ?', expect.anything())
    })

    it('allows a sell offer for a free-market signing after the season has ended', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 4 })
      getPlayerById.mockResolvedValue(player)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      query
        .mockResolvedValueOnce([{ type: 'HIRED', season: 3 }]) // signed in an earlier season — no longer locked
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('allows a sell offer when the player was acquired via a paid transfer this season', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 3 })
      getPlayerById.mockResolvedValue(player)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      // The most recent ownership event is a paid TRANSFER — even if the player was originally
      // signed for free by a prior team, the current owner paid real money and can list them.
      query
        .mockResolvedValueOnce([{ type: 'TRANSFER', season: 3 }])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects a sell offer when the team already lists the maximum number of players', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getOpenSellOffersByTeamId.mockResolvedValue(
        new Array(MAX_SELL_OFFERS_PER_TEAM).fill({}).map((_, i) => testData.tradeOffer({ id: i + 1 }))
      )

      const req = createMockRequest()

      await expect(handlers.addTradeOffer(player, 50000, 'sell', true, req))
        .rejects.toMatchObject({ message: expect.stringContaining(String(MAX_SELL_OFFERS_PER_TEAM)) })
    })

    it('allows a sell offer when the team is just below the limit', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      getOpenSellOffersByTeamId.mockResolvedValue(
        new Array(MAX_SELL_OFFERS_PER_TEAM - 1).fill({}).map((_, i) => testData.tradeOffer({ id: i + 1 }))
      )
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }]) // no transfer this season
        .mockResolvedValueOnce([]) // no existing offer for this player
        .mockResolvedValueOnce({}) // insert

      const req = createMockRequest()
      const result = await handlers.addTradeOffer(player, 50000, 'sell', true, req)

      expect(result).toEqual({ success: true })
    })

    it('stores allow_instant_buy=0 when seller disables instant buy', async () => {
      const team = testData.team({ balance: 100000 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getPlayerById.mockResolvedValue(player)
      query
        .mockResolvedValueOnce([]) // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }]) // no transfer this season
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
        .mockResolvedValueOnce([])  // no recent free-market signing
        .mockResolvedValueOnce([{ count: 0 }])  // no transfer this season
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
      // cancelOffer now first SELECTs the offer to grab player_id + type for
      // the follow-up websocket notification, then DELETEs it.
      query.mockResolvedValueOnce([{ player_id: offer.player_id, type: 'buy' }])
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

  describe('getAnsweredOffers', () => {
    it('returns answered offers, players, and teams', async () => {
      const team = testData.team({ id: 3 })
      const answeredOffers = [testData.tradeOffer({ id: 10, status: 'accepted', player_id: 7, from_team_id: 3 })]
      const players = [testData.player({ id: 7, team_id: 5 })]
      const teams = [testData.team({ id: 5 })]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(answeredOffers)
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce(teams)

      const req = createMockRequest()
      const result = await handlers.getAnsweredOffers(req)

      expect(result.answeredOffers).toEqual(answeredOffers)
      expect(result.players).toEqual(players)
      expect(result.teams).toEqual(teams)
    })

    it('returns empty arrays when no answered offers', async () => {
      const team = testData.team({ id: 3 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getAnsweredOffers(req)

      expect(result).toEqual({ answeredOffers: [], players: [], teams: [] })
    })

    it('does not produce invalid SQL when players have null team_id', async () => {
      // Regression test: players released from teams have team_id=null.
      // [null].join(', ') produces '' which causes ER_PARSE_ERROR: "WHERE id IN ()"
      const team = testData.team({ id: 3 })
      const answeredOffers = [testData.tradeOffer({ id: 10, status: 'accepted', player_id: 7, from_team_id: 3 })]
      const players = [testData.player({ id: 7, team_id: null })]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(answeredOffers)
        .mockResolvedValueOnce(players)

      const req = createMockRequest()
      const result = await handlers.getAnsweredOffers(req)

      // Should return empty teams array without making a second query (no valid team IDs)
      expect(result.teams).toEqual([])
      // The team query must NOT have been called with an empty IN clause
      const teamQueryCall = query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('FROM team WHERE id IN')
      )
      expect(teamQueryCall).toBeUndefined()
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

  describe('getTeamSellOfferPlayerIds', () => {
    it('returns player IDs of open sell offers for the given team', async () => {
      getOpenSellOffersByTeamId.mockResolvedValue([
        { player_id: 10 },
        { player_id: 20 }
      ])

      const result = await handlers.getTeamSellOfferPlayerIds(7)

      expect(result).toEqual({ playerIds: [10, 20] })
      expect(getOpenSellOffersByTeamId).toHaveBeenCalledWith(7)
    })

    it('returns empty array when the team has no sell offers', async () => {
      getOpenSellOffersByTeamId.mockResolvedValue([])

      const result = await handlers.getTeamSellOfferPlayerIds(7)

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
