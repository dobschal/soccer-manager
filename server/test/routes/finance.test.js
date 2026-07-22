import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 10, season: 1 })
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/finance.js'

describe('finance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getFinanceLog', () => {
    it('returns finance log for authenticated user', async () => {
      const team = testData.team()
      const financeLog = [testData.financeLog(), testData.financeLog({ id: 2, value: 1000 })]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result).toEqual({ log: financeLog })
      expect(query).toHaveBeenCalledWith('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    })

    // Internal game_day counts cup days too, so the user-facing label for
    // league match day 34 can be game_day 42. The query must join the game
    // table to surface the displayed match_day; the frontend uses that for
    // the "Spieltag X" dividers and filter labels.
    it('includes match_day and match_day_kind resolved from the game table', async () => {
      const team = testData.team()
      const financeLog = [
        { ...testData.financeLog({ id: 1, game_day: 42, season: 4 }), match_day: 34, match_day_kind: 'league' },
        { ...testData.financeLog({ id: 2, game_day: 20, season: 4 }), match_day: 3, match_day_kind: 'cup' }
      ]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log[0].match_day).toBe(34)
      expect(result.log[0].match_day_kind).toBe('league')
      expect(result.log[1].match_day).toBe(3)
      expect(result.log[1].match_day_kind).toBe('cup')

      // The SELECT must reach into the game table for the displayed match_day.
      const sql = query.mock.calls[1][0]
      expect(sql).toMatch(/match_day/)
      expect(sql).toMatch(/FROM game/)
    })

    it('returns empty log when no entries', async () => {
      const team = testData.team()

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result).toEqual({ log: [] })
    })

    it('returns salary entries with correct negative values', async () => {
      const team = testData.team()
      const salaryEntry = testData.financeLog({
        id: 1,
        value: -15000,
        reason: 'Player salaries',
        balance: 485000
      })

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([salaryEntry])

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log[0].value).toBe(-15000)
      expect(result.log[0].reason).toBe('Player salaries')
    })

    it('returns sponsor entries with correct positive values', async () => {
      const team = testData.team()
      const sponsorEntry = testData.financeLog({
        id: 2,
        value: 25000,
        reason: 'Sponsor deal with Nike',
        balance: 525000
      })

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([sponsorEntry])

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log[0].value).toBe(25000)
      expect(result.log[0].reason).toContain('Sponsor deal')
    })

    it('returns ticket earnings entries with correct positive values', async () => {
      const team = testData.team()
      const ticketEntry = testData.financeLog({
        id: 3,
        value: 80000,
        reason: 'Stadium ticket earnings',
        balance: 580000
      })

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([ticketEntry])

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log[0].value).toBe(80000)
      expect(result.log[0].reason).toBe('Stadium ticket earnings')
    })

    it('returns multiple finance entries in order', async () => {
      const team = testData.team()
      const financeLog = [
        testData.financeLog({ id: 1, value: 80000, reason: 'Stadium ticket earnings', game_day: 1, balance: 580000 }),
        testData.financeLog({ id: 2, value: -15000, reason: 'Player salaries', game_day: 1, balance: 565000 }),
        testData.financeLog({ id: 3, value: 25000, reason: 'Sponsor deal with Adidas', game_day: 1, balance: 590000 })
      ]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log).toHaveLength(3)
      expect(result.log[0].reason).toBe('Stadium ticket earnings')
      expect(result.log[1].reason).toBe('Player salaries')
      expect(result.log[2].reason).toContain('Sponsor deal')
    })

    it('tracks running balance correctly', async () => {
      const team = testData.team()
      const financeLog = [
        testData.financeLog({ id: 1, value: 100000, balance: 600000, game_day: 1 }),
        testData.financeLog({ id: 2, value: -20000, balance: 580000, game_day: 1 }),
        testData.financeLog({ id: 3, value: 50000, balance: 630000, game_day: 1 })
      ]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      // Verify balance progression is correct
      expect(result.log[0].balance).toBe(600000)
      expect(result.log[1].balance).toBe(580000)
      expect(result.log[2].balance).toBe(630000)
    })

    it('includes game_day and season for each entry', async () => {
      const team = testData.team()
      const financeLog = [
        testData.financeLog({ id: 1, game_day: 5, season: 2 }),
        testData.financeLog({ id: 2, game_day: 6, season: 2 })
      ]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(undefined, undefined, undefined, undefined, req)

      expect(result.log[0].game_day).toBe(5)
      expect(result.log[0].season).toBe(2)
      expect(result.log[1].game_day).toBe(6)
      expect(result.log[1].season).toBe(2)
    })

    it('filters by date range when provided', async () => {
      const team = testData.team()
      const financeLog = [testData.financeLog()]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(0, 5, 0, 10, req)

      expect(result).toEqual({ log: financeLog })
      expect(query).toHaveBeenCalledTimes(2)
    })
  })

  describe('getFinanceLogBounds', () => {
    it('returns gameDayLabels mapping game_day to displayed match_day', async () => {
      const team = testData.team()
      query.mockResolvedValueOnce([team])
      // Oldest finance entry
      query.mockResolvedValueOnce([{ season: 0, game_day: 0 }])
      // Played game days with match_day
      query.mockResolvedValueOnce([
        { season: 1, game_day: 42, league_match_day: 34, cup_match_day: null },
        { season: 1, game_day: 20, league_match_day: null, cup_match_day: 3 }
      ])

      const req = createMockRequest()
      const result = await handlers.getFinanceLogBounds(req)

      expect(result.minSeason).toBe(0)
      expect(result.minGameDay).toBe(0)
      expect(result.maxSeason).toBe(1)
      expect(result.gameDayLabels).toEqual([
        { season: 1, game_day: 42, match_day: 34, kind: 'league' },
        { season: 1, game_day: 20, match_day: 3, kind: 'cup' }
      ])
    })
  })

  describe('getEstimatedTvMoney', () => {
    it('returns an estimate based on the team level and current standing', async () => {
      const team = testData.team({ id: 5, level: 0, league: 0 })
      query.mockResolvedValueOnce([team]) // team lookup
      query.mockResolvedValueOnce([]) // games (no games played yet)
      query.mockResolvedValueOnce([{ id: 5 }]) // teams list (just our team)

      const req = createMockRequest()
      const result = await handlers.getEstimatedTvMoney(req)

      expect(result.base).toBe(150000)
      expect(result.level).toBe(0)
      expect(result.totalTeams).toBe(1)
      expect(result.rank).toBe(1)
      expect(result.estimatedValue).toBe(150000)
    })
  })
})
