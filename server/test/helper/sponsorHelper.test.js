import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn(),
  getSeasonGameDayCount: vi.fn().mockResolvedValue(34)
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason, getSeasonGameDayCount } from '../../helper/gameDayHelper.js'
import { getSponsor, getSponsorOffers } from '../../helper/sponsorHelper.js'

describe('sponsorHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSeasonGameDayCount.mockResolvedValue(34)
  })

  describe('getSponsor', () => {
    const team = { id: 1, name: 'Test FC' }

    it('returns sponsor with remaining_days when contract is active', async () => {
      // Sponsor started on season 1, game day 5 with duration 10
      // Current: season 1, game day 10
      // Contract end: 5 + 10 = 15, remaining = 15 - 10 = 5
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 5,
        duration: 10
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const result = await getSponsor(team)

      expect(result.sponsor).not.toBeNull()
      expect(result.sponsor.remaining_days).toBe(5)
      expect(result.sponsor.remaining_days).toBeGreaterThan(0)
    })

    it('returns sponsor with remaining_days = 1 on last day of contract', async () => {
      // Sponsor started on season 1, game day 5 with duration 10
      // Current: season 1, game day 14
      // Contract end: 5 + 10 = 15, remaining = 15 - 14 = 1
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 5,
        duration: 10
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 14, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const result = await getSponsor(team)

      expect(result.sponsor).not.toBeNull()
      expect(result.sponsor.remaining_days).toBe(1)
      expect(result.sponsor.remaining_days).toBeGreaterThan(0)
    })

    it('returns null sponsor when contract has exactly expired (remaining_days = 0)', async () => {
      // Sponsor started on season 1, game day 5 with duration 10
      // Current: season 1, game day 15
      // Contract end: 5 + 10 = 15, remaining = 15 - 15 = 0
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 5,
        duration: 10
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 15, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const result = await getSponsor(team)

      expect(result.sponsor).toBeNull()
    })

    it('returns null sponsor when contract has expired (remaining_days negative)', async () => {
      // Sponsor started on season 1, game day 5 with duration 10
      // Current: season 1, game day 20
      // Contract end: 5 + 10 = 15, remaining = 15 - 20 = -5
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 5,
        duration: 10
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 20, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const result = await getSponsor(team)

      expect(result.sponsor).toBeNull()
    })

    it('returns null sponsor when no sponsor found in database', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])

      const result = await getSponsor(team)

      expect(result.sponsor).toBeNull()
    })

    it('does not regenerate days across season transition when season has cup rounds (#384)', async () => {
      // Season N has 43 game days total (34 league + 9 cup days interleaved).
      // Sponsor signed at (N=1, game_day=33), duration=16. The contract should
      // expire 16 ticks after signing — ticks advance through both league and
      // cup days, then wrap to (season=2, game_day=1).
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 33,
        duration: 16
      }

      getSeasonGameDayCount.mockResolvedValue(43)

      // Just before season transition: current pointer is the last unplayed of season 1.
      getGameDayAndSeason.mockResolvedValue({ gameDay: 43, season: 1 })
      query.mockResolvedValueOnce([sponsor])
      const before = await getSponsor(team)
      expect(before.sponsor).not.toBeNull()
      expect(before.sponsor.remaining_days).toBe(6) // 16 - (43 - 33) = 6

      // Right after season transition: pointer wraps to (2, 1) — only one tick
      // happened, so remaining must drop by 1, not jump up.
      vi.clearAllMocks()
      getSeasonGameDayCount.mockResolvedValue(43)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 2 })
      query.mockResolvedValueOnce([sponsor])
      const after = await getSponsor(team)
      expect(after.sponsor).not.toBeNull()
      expect(after.sponsor.remaining_days).toBe(5) // 16 - ((43 - 33) + 1) = 5
    })

    it('handles sponsors spanning across seasons correctly', async () => {
      // Sponsor started on season 0, game day 30 with duration 10
      // Current: season 1, game day 3
      // Contract end (total): 0 * 34 + 30 + 10 = 40
      // Current total: 1 * 34 + 3 = 37
      // Remaining: 40 - 37 = 3
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 0,
        start_game_day: 30,
        duration: 10
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 3, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const result = await getSponsor(team)

      expect(result.sponsor).not.toBeNull()
      expect(result.sponsor.remaining_days).toBe(3)
      expect(result.sponsor.remaining_days).toBeGreaterThan(0)
    })

    it('when sponsor is returned, remaining_days is always > 0', async () => {
      // Test various scenarios to ensure the invariant holds
      const testCases = [
        { startSeason: 1, startDay: 1, duration: 34, currentSeason: 1, currentDay: 10 }, // Full season sponsor
        { startSeason: 1, startDay: 20, duration: 5, currentSeason: 1, currentDay: 22 }, // Short contract
        { startSeason: 0, startDay: 25, duration: 20, currentSeason: 1, currentDay: 10 }, // Cross-season
        { startSeason: 2, startDay: 1, duration: 3, currentSeason: 2, currentDay: 2 }, // Different season
      ]

      for (const tc of testCases) {
        vi.clearAllMocks()
        const sponsor = {
          id: 1,
          team_id: 1,
          name: 'Test Sponsor',
          value: 10000,
          start_season: tc.startSeason,
          start_game_day: tc.startDay,
          duration: tc.duration
        }

        getGameDayAndSeason.mockResolvedValue({ gameDay: tc.currentDay, season: tc.currentSeason })
        query.mockResolvedValueOnce([sponsor])

        const result = await getSponsor(team)

        if (result.sponsor !== null) {
          expect(result.sponsor.remaining_days).toBeGreaterThan(0)
        }
      }
    })

    it('team receives money for each game day where remaining_days > 0', async () => {
      // Simulate a 5-day sponsor contract and verify sponsor is returned for each active day
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 1,
        duration: 5
      }

      const activeDays = []
      const expiredDays = []

      // Days 1-5 should have active sponsor (remaining: 5,4,3,2,1)
      // Day 6+ should have expired sponsor (remaining: 0,-1,...)
      for (let day = 1; day <= 8; day++) {
        vi.clearAllMocks()
        getGameDayAndSeason.mockResolvedValue({ gameDay: day, season: 1 })
        query.mockResolvedValueOnce([sponsor])

        const result = await getSponsor(team)

        if (result.sponsor !== null) {
          activeDays.push({ day, remaining: result.sponsor.remaining_days })
          expect(result.sponsor.remaining_days).toBeGreaterThan(0)
        } else {
          expiredDays.push(day)
        }
      }

      // Contract should be active for days 1-5
      expect(activeDays.map(d => d.day)).toEqual([1, 2, 3, 4, 5])
      // Contract should be expired for days 6+
      expect(expiredDays).toEqual([6, 7, 8])
      // Remaining days should decrease each day
      expect(activeDays.map(d => d.remaining)).toEqual([5, 4, 3, 2, 1])
    })

    it('uses explicit gameDay/season options when provided', async () => {
      // Database returns different current day, but we pass explicit options
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 1,
        duration: 5
      }

      // Database says it's day 10 (contract would be expired)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      // But we explicitly ask for day 3 (contract should be active)
      const result = await getSponsor(team, { gameDay: 3, season: 1 })

      expect(result.sponsor).not.toBeNull()
      expect(result.sponsor.remaining_days).toBe(3) // 1 + 5 - 3 = 3
    })

    it('_giveSponsorMoney scenario: pays for correct game day even if database updated', async () => {
      // Simulates the _giveSponsorMoney scenario where gameDay/season are passed explicitly
      // This ensures teams get paid even on the last day of contract
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 1,
        duration: 5
      }

      // Simulate: game day 5 is being processed, but database already shows day 6
      getGameDayAndSeason.mockResolvedValue({ gameDay: 6, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      // Without explicit options, sponsor would be null (day 6, remaining = 0)
      const resultWithoutOptions = await getSponsor(team)
      expect(resultWithoutOptions.sponsor).toBeNull()

      // With explicit options for day 5, sponsor should be returned
      vi.clearAllMocks()
      getGameDayAndSeason.mockResolvedValue({ gameDay: 6, season: 1 })
      query.mockResolvedValueOnce([sponsor])

      const resultWithOptions = await getSponsor(team, { gameDay: 5, season: 1 })
      expect(resultWithOptions.sponsor).not.toBeNull()
      expect(resultWithOptions.sponsor.remaining_days).toBe(1) // Last day of contract
    })

    it('team gets paid exactly duration times over the contract period', async () => {
      // Verify that for a duration=5 contract, team gets sponsor exactly 5 times
      const sponsor = {
        id: 1,
        team_id: 1,
        name: 'Test Sponsor',
        value: 10000,
        start_season: 1,
        start_game_day: 1,
        duration: 5
      }

      let paymentCount = 0

      // Simulate 10 game days, passing explicit gameDay each time (like _giveSponsorMoney does)
      for (let day = 1; day <= 10; day++) {
        vi.clearAllMocks()
        getGameDayAndSeason.mockResolvedValue({ gameDay: 99, season: 99 }) // Irrelevant, we pass explicit
        query.mockResolvedValueOnce([sponsor])

        const result = await getSponsor(team, { gameDay: day, season: 1 })

        if (result.sponsor !== null) {
          paymentCount++
        }
      }

      // Team should be paid exactly 5 times (duration = 5)
      expect(paymentCount).toBe(5)
    })
  })

  describe('getSponsorOffers', () => {
    const team = { id: 7, name: 'Test FC', level: 1, league: 1 }

    /** @returns {string} the SQL of the games lookup */
    function gamesSql () {
      return query.mock.calls[0][0]
    }

    /**
     * @param {number} count how many won home games to fabricate
     * @param {string} gameType
     * @returns {object[]}
     */
    function wonGames (count, gameType = 'league') {
      return Array.from({ length: count }, (_, i) => ({
        team_1_id: team.id,
        team_2_id: 99,
        goals_team_1: 2,
        goals_team_2: 0,
        played: 1,
        game_type: gameType,
        season: 1,
        game_day: 34 - i
      }))
    }

    it('only counts league and cup games, never friendlies', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])

      await getSponsorOffers(team)

      const sql = gamesSql()
      expect(sql).toContain("game_type IN ('league', 'cup')")
      // Legacy league rows predate the game_type column and must still count.
      expect(sql).toContain('game_type IS NULL')
      expect(sql).not.toContain('friendly')
    })

    it('applies the game type filter to both the home and away subquery', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])

      await getSponsorOffers(team)

      const sql = gamesSql()
      expect(sql.match(/game_type IN \('league', 'cup'\)/g)).toHaveLength(2)
      expect(sql).toContain('team_1_id=?')
      expect(sql).toContain('team_2_id=?')
    })

    it('returns one offer per contract length', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])

      const offers = await getSponsorOffers(team)

      expect(offers.map(o => o.duration)).toEqual([3, 9, 16, 34])
      offers.forEach(offer => {
        expect(offer.team_id).toBe(team.id)
        expect(offer.start_season).toBe(1)
        expect(offer.start_game_day).toBe(10)
        expect(typeof offer.name).toBe('string')
      })
    })

    it('pays more for a higher win rate', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })

      query.mockResolvedValueOnce([])
      const [noWins] = await getSponsorOffers(team)

      vi.clearAllMocks()
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce(wonGames(3))
      const [allWins] = await getSponsorOffers(team)

      // 3/3 wins vs. the 1/3 floor, so even with the 0.9-1.1 random factor
      // the winning team's offer must come out ahead.
      expect(allWins.value).toBeGreaterThan(noWins.value)
    })

    it('never drops below the one third floor without any wins', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])

      const offers = await getSponsorOffers(team)

      // 76124 * 0.8^level(1) * 1/3 * 0.9 (worst random roll)
      const minimum = Math.floor(76124 * 0.8 * (1 / 3) * 0.9)
      offers.forEach(offer => {
        expect(offer.value).toBeGreaterThanOrEqual(minimum)
      })
    })

    it('scales the base amount down per league level', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])
      const [topLeague] = await getSponsorOffers(team)

      vi.clearAllMocks()
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([])
      const [lowLeague] = await getSponsorOffers({ ...team, level: 5 })

      expect(lowLeague.value).toBeLessThan(topLeague.value)
    })
  })
})
