import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({
  generateRandomPlayerName: vi.fn().mockResolvedValue('Test Player')
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getAveragePlanPriceOfPlayer: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 10 })
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  acceptOffer: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))

// We need to reset the module cache to clear the cached IOC team ID between tests
let fillMarketGaps, iocBuyUndervaluedPlayers, cleanupIOCPlayers, getIOCTeamId, iocEnsureMinimumTransfers, iocAutoAcceptBuyOffers

beforeEach(async () => {
  vi.clearAllMocks()
  // Re-import to reset cached IOC team ID
  vi.resetModules()

  // Re-apply mocks after resetModules
  vi.doMock('../../lib/database.js', () => ({
    query: vi.fn()
  }))
  vi.doMock('../../prepare-season.js', () => ({
    generateRandomPlayerName: vi.fn().mockResolvedValue('Test Player')
  }))
  vi.doMock('../../helper/playerHelper.js', () => ({
    getAveragePlanPriceOfPlayer: vi.fn()
  }))
  vi.doMock('../../helper/gameDayHelper.js', () => ({
    getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 10 })
  }))
  vi.doMock('../../helper/tradeHelper.js', () => ({
    acceptOffer: vi.fn()
  }))
  vi.doMock('../../helper/teamHelper.js', () => ({
    getTeamById: vi.fn()
  }))

  const mod = await import('../../helper/overseaClubHelper.js')
  fillMarketGaps = mod.fillMarketGaps
  iocBuyUndervaluedPlayers = mod.iocBuyUndervaluedPlayers
  cleanupIOCPlayers = mod.cleanupIOCPlayers
  getIOCTeamId = mod.getIOCTeamId
  iocEnsureMinimumTransfers = mod.iocEnsureMinimumTransfers
  iocAutoAcceptBuyOffers = mod.iocAutoAcceptBuyOffers

  // Get fresh references to mocked modules
  const dbMod = await import('../../lib/database.js')
  const playerHelperMod = await import('../../helper/playerHelper.js')
  const tradeHelperMod = await import('../../helper/tradeHelper.js')
  const teamHelperMod = await import('../../helper/teamHelper.js')

  // Store fresh refs globally for test usage
  globalThis._query = dbMod.query
  globalThis._getAveragePlanPriceOfPlayer = playerHelperMod.getAveragePlanPriceOfPlayer
  globalThis._acceptOffer = tradeHelperMod.acceptOffer
  globalThis._getTeamById = teamHelperMod.getTeamById
})

describe('overseaClubHelper', () => {
  describe('getIOCTeamId', () => {
    it('returns the IOC team id', async () => {
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      const id = await getIOCTeamId()
      expect(id).toBe(999)
    })

    it('returns null when no IOC team exists', async () => {
      globalThis._query.mockResolvedValueOnce([])
      const id = await getIOCTeamId()
      expect(id).toBeNull()
    })
  })

  describe('fillMarketGaps', () => {
    it('creates offers when market has gaps', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // getGameDayAndSeason is mocked at module level

      // Count existing sell offers - return empty (no offers at all)
      globalThis._query.mockResolvedValueOnce([])

      // For each created player: INSERT player, getAveragePlanPriceOfPlayer (uses getPlayerAge internally), INSERT trade_offer
      // 12 positions x (8 bronze + 10 silver + 2 gold) = 240 players
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValue(100000)

      // Mock all subsequent INSERT queries
      globalThis._query.mockResolvedValue({ insertId: 1 })

      const created = await fillMarketGaps()
      // 12 positions * (8 + 10 + 2) = 240
      expect(created).toBe(240)
    })

    it('does nothing when market is full', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Build existing offers that satisfy all position/tier combos
      // bronze: 8, silver: 10, gold: 2
      const existingOffers = []
      const positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']
      const tierLevels = [
        { level: 20, cnt: 8 }, // bronze
        { level: 50, cnt: 10 }, // silver
        { level: 80, cnt: 2 } // gold
      ]
      for (const pos of positions) {
        for (const tier of tierLevels) {
          existingOffers.push({ position: pos, level: tier.level, cnt: tier.cnt })
        }
      }
      globalThis._query.mockResolvedValueOnce(existingOffers)

      const created = await fillMarketGaps()
      expect(created).toBe(0)
    })
  })

  describe('iocBuyUndervaluedPlayers', () => {
    it('buys offers below 80% market value', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Sell offers not from IOC
      globalThis._query.mockResolvedValueOnce([
        {
          id: 1,
          player_id: 10,
          from_team_id: 5,
          offer_value: 50000,
          type: 'sell',
          level: 50,
          position: 'CM',
          carrier_start_season: 0,
          carrier_end_season: 22,
          player_team_id: 5
        }
      ])

      // Market value = 100000, offer = 50000 => 50% < 80% threshold => buy
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)

      // getTeamById for selling team (bot team, no user_id)
      globalThis._getTeamById.mockResolvedValueOnce({ id: 5, name: 'Bot Team', user_id: null })

      // Check for existing IOC offer on this player (none)
      globalThis._query.mockResolvedValueOnce([])

      // INSERT buy offer
      globalThis._query.mockResolvedValueOnce({ insertId: 100 })
      // SELECT the inserted buy offer
      globalThis._query.mockResolvedValueOnce([{ id: 100, from_team_id: 999, player_id: 10, type: 'buy', offer_value: 50000 }])
      // acceptOffer will be called
      globalThis._acceptOffer.mockResolvedValueOnce()

      const bought = await iocBuyUndervaluedPlayers()
      expect(bought).toBe(1)
      expect(globalThis._acceptOffer).toHaveBeenCalledTimes(1)
    })

    it('skips player if IOC already has an open offer', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // One undervalued sell offer
      globalThis._query.mockResolvedValueOnce([
        {
          id: 1,
          player_id: 10,
          from_team_id: 5,
          offer_value: 50000,
          type: 'sell',
          level: 50,
          position: 'CM',
          carrier_start_season: 0,
          carrier_end_season: 22,
          player_team_id: 5
        }
      ])

      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)
      globalThis._getTeamById.mockResolvedValueOnce({ id: 5, name: 'User FC', user_id: 42 })

      // IOC already has an open offer for this player
      globalThis._query.mockResolvedValueOnce([{ id: 77 }])

      const bought = await iocBuyUndervaluedPlayers()
      expect(bought).toBe(0)
    })

    it('skips player if IOC already has a rejected offer', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // One undervalued sell offer
      globalThis._query.mockResolvedValueOnce([
        {
          id: 1,
          player_id: 10,
          from_team_id: 5,
          offer_value: 50000,
          type: 'sell',
          level: 50,
          position: 'CM',
          carrier_start_season: 0,
          carrier_end_season: 22,
          player_team_id: 5
        }
      ])

      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)
      globalThis._getTeamById.mockResolvedValueOnce({ id: 5, name: 'User FC', user_id: 42 })

      // IOC already has a rejected offer for this player
      globalThis._query.mockResolvedValueOnce([{ id: 77 }])

      const bought = await iocBuyUndervaluedPlayers()
      expect(bought).toBe(0)
    })

    it('skips offers at or above 80% market value', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Sell offer at exactly 80% of market value
      globalThis._query.mockResolvedValueOnce([
        {
          id: 1,
          player_id: 10,
          from_team_id: 5,
          offer_value: 80000,
          type: 'sell',
          level: 50,
          position: 'CM',
          carrier_start_season: 0,
          carrier_end_season: 22,
          player_team_id: 5
        }
      ])

      // Market value = 100000, offer = 80000 => 80% = threshold => skip
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)

      const bought = await iocBuyUndervaluedPlayers()
      expect(bought).toBe(0)
    })

    it('respects max 10 buys per game day', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Create 15 undervalued sell offers
      const offers = []
      for (let i = 0; i < 15; i++) {
        offers.push({
          id: i + 1,
          player_id: 100 + i,
          from_team_id: 5,
          offer_value: 1000,
          type: 'sell',
          level: 50,
          position: 'CM',
          carrier_start_season: 0,
          carrier_end_season: 22,
          player_team_id: 5
        })
      }
      globalThis._query.mockResolvedValueOnce(offers)

      // All have market value much higher than offer (undervalued)
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      // All are bot teams
      globalThis._getTeamById.mockResolvedValue({ id: 5, name: 'Bot Team', user_id: null })
      // Handle queries: existing-offer check returns empty, others return buy offer
      globalThis._query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM trade_offer')) return Promise.resolve([])
        return Promise.resolve([{ id: 200, from_team_id: 999, player_id: 100, type: 'buy', offer_value: 1000 }])
      })
      globalThis._acceptOffer.mockResolvedValue()

      const bought = await iocBuyUndervaluedPlayers()
      expect(bought).toBe(10)
    })
  })

  describe('cleanupIOCPlayers', () => {
    it('deletes orphaned IOC players', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Orphaned players (no active sell offer)
      globalThis._query.mockResolvedValueOnce([
        { id: 101 },
        { id: 102 }
      ])

      // DELETE queries for each player (4 per player: player_history, trade_offer, trade_history, player)
      globalThis._query.mockResolvedValue({ affectedRows: 1 })

      const cleaned = await cleanupIOCPlayers()
      expect(cleaned).toBe(2)
    })

    it('preserves IOC players with active sell offers', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // No orphaned players (all have active sell offers)
      globalThis._query.mockResolvedValueOnce([])

      const cleaned = await cleanupIOCPlayers()
      expect(cleaned).toBe(0)
    })
  })

  describe('iocEnsureMinimumTransfers', () => {
    it('buys cheapest offers when transfers below minimum', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // COUNT teams (20 non-system teams → min 2 transfers)
      globalThis._query.mockResolvedValueOnce([{ cnt: 20 }])

      // COUNT current transfers this game day (0 so far)
      globalThis._query.mockResolvedValueOnce([{ cnt: 0 }])

      // Cheapest sell offers (need 2)
      globalThis._query.mockResolvedValueOnce([
        { id: 1, player_id: 10, from_team_id: 5, offer_value: 30000, level: 20, position: 'CM', player_team_id: 5 },
        { id: 2, player_id: 11, from_team_id: 6, offer_value: 40000, level: 25, position: 'ST', player_team_id: 6 }
      ])

      // Both are bot sellers
      globalThis._getTeamById.mockResolvedValue({ id: 5, name: 'Bot A', user_id: null })

      // Handle queries: existing-offer check returns empty, others return buy offer
      globalThis._query.mockImplementation((sql) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM trade_offer')) return Promise.resolve([])
        return Promise.resolve([{ id: 200, from_team_id: 999, player_id: 10, type: 'buy', offer_value: 30000 }])
      })
      globalThis._acceptOffer.mockResolvedValue()

      const bought = await iocEnsureMinimumTransfers()
      expect(bought).toBe(2)
      expect(globalThis._acceptOffer).toHaveBeenCalledTimes(2)
    })

    it('does nothing when enough transfers already happened', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // COUNT teams (10 → min 1 transfer)
      globalThis._query.mockResolvedValueOnce([{ cnt: 10 }])

      // COUNT current transfers (5 already happened, exceeds minimum of 1)
      globalThis._query.mockResolvedValueOnce([{ cnt: 5 }])

      const bought = await iocEnsureMinimumTransfers()
      expect(bought).toBe(0)
    })

    it('places buy offer for user seller instead of auto-accepting', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // COUNT teams (10 → min 1)
      globalThis._query.mockResolvedValueOnce([{ cnt: 10 }])

      // 0 transfers so far
      globalThis._query.mockResolvedValueOnce([{ cnt: 0 }])

      // One sell offer from a user team
      globalThis._query.mockResolvedValueOnce([
        { id: 1, player_id: 10, from_team_id: 5, offer_value: 50000, level: 30, position: 'LM', player_team_id: 5 }
      ])

      // Selling team is a user team
      globalThis._getTeamById.mockResolvedValueOnce({ id: 5, name: 'User FC', user_id: 42 })

      // Check for existing IOC offer on this player (none)
      globalThis._query.mockResolvedValueOnce([])

      // INSERT buy offer
      globalThis._query.mockResolvedValueOnce({ insertId: 300 })

      const bought = await iocEnsureMinimumTransfers()
      expect(bought).toBe(1)
      // Should NOT auto-accept (user seller)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()
    })
  })

  describe('IOC player pricing', () => {
    it('creates players with prices within 90-110% of market value', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Return partial offers (only 7 bronze GK offers, need 1 more to reach 8)
      globalThis._query.mockResolvedValueOnce([
        { position: 'GK', level: 20, cnt: 7 },
        // Fill all other slots to their minimums
        ...['LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA'].flatMap(pos =>
          [{ position: pos, level: 20, cnt: 8 }, { position: pos, level: 50, cnt: 10 }, { position: pos, level: 80, cnt: 2 }]
        ),
        { position: 'GK', level: 50, cnt: 10 },
        { position: 'GK', level: 80, cnt: 2 }
      ])

      const marketValue = 500000
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(marketValue)

      // INSERT player returns insertId
      globalThis._query.mockResolvedValueOnce({ insertId: 200 })
      // INSERT trade_offer
      globalThis._query.mockResolvedValueOnce({ insertId: 300 })

      await fillMarketGaps()

      // Check the INSERT trade_offer call
      const insertCalls = globalThis._query.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO trade_offer')
      )
      expect(insertCalls.length).toBe(1)
      const offerData = insertCalls[0][1]
      const price = offerData.offer_value

      // Price should be between 90% and 110% of market value, minimum 1000
      expect(price).toBeGreaterThanOrEqual(Math.max(1000, Math.floor(marketValue * 0.9)))
      expect(price).toBeLessThanOrEqual(Math.floor(marketValue * 1.1))
    })
  })

  describe('iocAutoAcceptBuyOffers', () => {
    it('accepts open buy offers on IOC players', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // getTeamById for IOC team
      globalThis._getTeamById.mockResolvedValueOnce({ id: 999, name: 'IOC', is_system_team: 1, user_id: null })

      // Open buy offers on IOC players
      globalThis._query.mockResolvedValueOnce([
        { id: 50, player_id: 10, from_team_id: 5, offer_value: 80000, type: 'buy', status: 'open' },
        { id: 51, player_id: 11, from_team_id: 6, offer_value: 120000, type: 'buy', status: 'open' }
      ])

      globalThis._acceptOffer.mockResolvedValue()

      const accepted = await iocAutoAcceptBuyOffers()
      expect(accepted).toBe(2)
      expect(globalThis._acceptOffer).toHaveBeenCalledTimes(2)
    })

    it('returns 0 when no buy offers exist', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // getTeamById for IOC team
      globalThis._getTeamById.mockResolvedValueOnce({ id: 999, name: 'IOC', is_system_team: 1, user_id: null })

      // No open buy offers
      globalThis._query.mockResolvedValueOnce([])

      const accepted = await iocAutoAcceptBuyOffers()
      expect(accepted).toBe(0)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()
    })

    it('continues when one offer fails', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // getTeamById for IOC team
      globalThis._getTeamById.mockResolvedValueOnce({ id: 999, name: 'IOC', is_system_team: 1, user_id: null })

      // Two buy offers
      globalThis._query.mockResolvedValueOnce([
        { id: 50, player_id: 10, from_team_id: 5, offer_value: 80000, type: 'buy', status: 'open' },
        { id: 51, player_id: 11, from_team_id: 6, offer_value: 120000, type: 'buy', status: 'open' }
      ])

      // First fails, second succeeds
      globalThis._acceptOffer.mockRejectedValueOnce(new Error('Player already sold'))
      globalThis._acceptOffer.mockResolvedValueOnce()

      const accepted = await iocAutoAcceptBuyOffers()
      expect(accepted).toBe(1)
      expect(globalThis._acceptOffer).toHaveBeenCalledTimes(2)
    })
  })
})
