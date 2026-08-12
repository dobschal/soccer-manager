import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({
  generateRandomPlayerName: vi.fn().mockResolvedValue('Test Player')
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getAveragePlanPriceOfPlayer: vi.fn(),
  getPlayersByTeamId: vi.fn()
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

vi.mock('../../lib/util.js', () => ({
  randomItem: vi.fn((arr) => arr[0])
}))

// We need to reset the module cache to clear the cached IOC team ID between tests
let fillMarketGaps, iocBuyFromUsers, cleanupIOCPlayers, getIOCTeamId, iocAutoAcceptBuyOffers, repriceIOCOffers

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
    getAveragePlanPriceOfPlayer: vi.fn(),
    getPlayersByTeamId: vi.fn()
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
  vi.doMock('../../lib/util.js', () => ({
    randomItem: vi.fn((arr) => arr[0])
  }))

  const mod = await import('../../helper/overseaClubHelper.js')
  fillMarketGaps = mod.fillMarketGaps
  iocBuyFromUsers = mod.iocBuyFromUsers
  cleanupIOCPlayers = mod.cleanupIOCPlayers
  getIOCTeamId = mod.getIOCTeamId
  iocAutoAcceptBuyOffers = mod.iocAutoAcceptBuyOffers
  repriceIOCOffers = mod.repriceIOCOffers

  // Get fresh references to mocked modules
  const dbMod = await import('../../lib/database.js')
  const playerHelperMod = await import('../../helper/playerHelper.js')
  const tradeHelperMod = await import('../../helper/tradeHelper.js')
  const teamHelperMod = await import('../../helper/teamHelper.js')

  // Store fresh refs globally for test usage
  globalThis._query = dbMod.query
  globalThis._getAveragePlanPriceOfPlayer = playerHelperMod.getAveragePlanPriceOfPlayer
  globalThis._getPlayersByTeamId = playerHelperMod.getPlayersByTeamId
  globalThis._acceptOffer = tradeHelperMod.acceptOffer
  globalThis._getTeamById = teamHelperMod.getTeamById
})

afterEach(() => {
  vi.restoreAllMocks()
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

  describe('iocBuyFromUsers', () => {
    it('makes no offer when the per-team chance roll fails', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9) // >= 0.4 → skip team

      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // user teams
      globalThis._query.mockResolvedValueOnce([{ id: 5, name: 'User FC', user_id: 42, is_system_team: 0 }])

      const count = await iocBuyFromUsers()
      expect(count).toBe(0)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()
    })

    it('case 1: buys directly when a player is listed at or below market value', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // < 0.4 → proceed

      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // user teams
      globalThis._query.mockResolvedValueOnce([{ id: 5, name: 'User FC', user_id: 42, is_system_team: 0 }])
      // existing IOC offer check (none)
      globalThis._query.mockResolvedValueOnce([])
      // team's own sell offers – one listed at 50000
      globalThis._query.mockResolvedValueOnce([
        { id: 1, player_id: 10, player_name: 'Star', offer_value: 50000, level: 50, carrier_start_season: 0, carrier_end_season: 22 }
      ])
      // market value 100000 → 50000 <= market → direct buy
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)
      // INSERT buy offer
      globalThis._query.mockResolvedValueOnce({ insertId: 100 })
      // SELECT the inserted buy offer
      globalThis._query.mockResolvedValueOnce([{ id: 100, from_team_id: 999, player_id: 10, type: 'buy', offer_value: 50000 }])
      globalThis._acceptOffer.mockResolvedValueOnce()

      const count = await iocBuyFromUsers()
      expect(count).toBe(1)
      expect(globalThis._acceptOffer).toHaveBeenCalledTimes(1)
    })

    it('case 2: offers market value ±3% when the listing is above market value', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0) // chance passes; deviation factor = 0.97

      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // user teams
      globalThis._query.mockResolvedValueOnce([{ id: 5, name: 'User FC', user_id: 42, is_system_team: 0 }])
      // existing IOC offer check (none)
      globalThis._query.mockResolvedValueOnce([])
      // team's own sell offers – one listed at 200000 (above market)
      globalThis._query.mockResolvedValueOnce([
        { id: 1, player_id: 10, player_name: 'Overpriced', offer_value: 200000, level: 50, carrier_start_season: 0, carrier_end_season: 22 }
      ])
      // market value 100000 → listing above market → offer at market ±3%
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)
      // INSERT buy offer
      globalThis._query.mockResolvedValueOnce({ insertId: 300 })

      const count = await iocBuyFromUsers()
      expect(count).toBe(1)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()

      const insertCall = globalThis._query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO trade_offer')
      )
      // factor = 1 - 0.03 + 0*0.06 = 0.97 → 97000
      expect(insertCall[1].offer_value).toBe(97000)
      expect(insertCall[1].type).toBe('buy')
      expect(insertCall[1].from_team_id).toBe(999)
      expect(insertCall[1].player_id).toBe(10)
    })

    it('case 3: offers for a random player when the team lists nobody', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // user teams
      globalThis._query.mockResolvedValueOnce([{ id: 5, name: 'User FC', user_id: 42, is_system_team: 0 }])
      // existing IOC offer check (none)
      globalThis._query.mockResolvedValueOnce([])
      // team's own sell offers – none
      globalThis._query.mockResolvedValueOnce([])
      // players of the team (randomItem mock returns the first)
      globalThis._getPlayersByTeamId.mockResolvedValueOnce([
        { id: 20, name: 'Random Guy', level: 60, carrier_start_season: 0, carrier_end_season: 22 }
      ])
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)
      // INSERT buy offer
      globalThis._query.mockResolvedValueOnce({ insertId: 400 })

      const count = await iocBuyFromUsers()
      expect(count).toBe(1)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()

      const insertCall = globalThis._query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('INSERT INTO trade_offer')
      )
      expect(insertCall[1].player_id).toBe(20)
      expect(insertCall[1].offer_value).toBe(97000)
    })

    it('skips a team that already has an open IOC buy offer', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)

      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      // user teams
      globalThis._query.mockResolvedValueOnce([{ id: 5, name: 'User FC', user_id: 42, is_system_team: 0 }])
      // existing IOC offer check → one exists
      globalThis._query.mockResolvedValueOnce([{ id: 77 }])

      const count = await iocBuyFromUsers()
      expect(count).toBe(0)
      expect(globalThis._acceptOffer).not.toHaveBeenCalled()
    })

    it('returns 0 when no IOC team exists', async () => {
      globalThis._query.mockResolvedValueOnce([])
      const count = await iocBuyFromUsers()
      expect(count).toBe(0)
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

  describe('IOC player pricing', () => {
    it('creates players with prices within ±3% of market value', async () => {
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

      // Price should be within the IOC deviation of market value, minimum 1000
      expect(price).toBeGreaterThanOrEqual(Math.max(1000, Math.floor(marketValue * 0.97)))
      expect(price).toBeLessThanOrEqual(Math.floor(marketValue * 1.03))
    })
  })

  describe('repriceIOCOffers', () => {
    it('repriced a stale offer down to the current market value', async () => {
      // getIOCTeamId
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])

      // Open IOC sell offer asking far above what the aged player is worth now
      globalThis._query.mockResolvedValueOnce([
        { id: 14244, offer_value: 2513118, level: 69, carrier_start_season: -8 }
      ])

      const marketValue = 781160
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(marketValue)
      globalThis._query.mockResolvedValueOnce({ affectedRows: 1 })

      const repriced = await repriceIOCOffers()
      expect(repriced).toBe(1)

      const updateCall = globalThis._query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE trade_offer SET offer_value')
      )
      expect(updateCall).toBeDefined()
      const [newPrice, offerId] = updateCall[1]
      expect(offerId).toBe(14244)
      expect(newPrice).toBeGreaterThanOrEqual(Math.floor(marketValue * 0.97))
      expect(newPrice).toBeLessThanOrEqual(Math.floor(marketValue * 1.03))
    })

    it('leaves offers within tolerance untouched', async () => {
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      globalThis._query.mockResolvedValueOnce([
        { id: 1, offer_value: 102000, level: 50, carrier_start_season: 5 }
      ])

      // 2% above market value — inside IOC_REPRICE_TOLERANCE
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(100000)

      const repriced = await repriceIOCOffers()
      expect(repriced).toBe(0)

      const updateCalls = globalThis._query.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE trade_offer')
      )
      expect(updateCalls.length).toBe(0)
    })

    it('raises offers that sit below market value', async () => {
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      globalThis._query.mockResolvedValueOnce([
        { id: 2, offer_value: 50000, level: 80, carrier_start_season: 6 }
      ])

      const marketValue = 400000
      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(marketValue)
      globalThis._query.mockResolvedValueOnce({ affectedRows: 1 })

      const repriced = await repriceIOCOffers()
      expect(repriced).toBe(1)

      const updateCall = globalThis._query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('UPDATE trade_offer SET offer_value')
      )
      expect(updateCall[1][0]).toBeGreaterThan(50000)
    })

    it('only touches offers owned by the IOC', async () => {
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      globalThis._query.mockResolvedValueOnce([])

      await repriceIOCOffers()

      const selectCall = globalThis._query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('FROM trade_offer tro')
      )
      expect(selectCall[0]).toContain('tro.from_team_id = ?')
      expect(selectCall[0]).toContain("tro.type = 'sell'")
      expect(selectCall[0]).toContain("tro.status = 'open'")
      expect(selectCall[1]).toEqual([999])
    })

    it('returns 0 when no IOC team exists', async () => {
      globalThis._query.mockResolvedValueOnce([])
      const repriced = await repriceIOCOffers()
      expect(repriced).toBe(0)
    })

    it('skips players whose market value cannot be determined', async () => {
      globalThis._query.mockResolvedValueOnce([{ id: 999 }])
      globalThis._query.mockResolvedValueOnce([
        { id: 3, offer_value: 10000, level: 10, carrier_start_season: 1 }
      ])

      globalThis._getAveragePlanPriceOfPlayer.mockResolvedValueOnce(0)

      const repriced = await repriceIOCOffers()
      expect(repriced).toBe(0)
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
