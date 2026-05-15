import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))

import { query } from '../../lib/database.js'
import {
  getConstructionInfo,
  calculateConstructionTime,
  calculateConstructionEndDate
} from '../../helper/stadiumHelper.js'

/**
 * Mock getSeasonGameDayCount's underlying query: any SELECT MAX(game_day) for
 * season X returns `lengths[X]` if defined, otherwise falls back to 34.
 */
function mockSeasonLengths (lengths) {
  query.mockImplementation((sql, params) => {
    if (sql.includes('MAX(game_day)') && sql.includes('WHERE season=?')) {
      const season = params[0]
      const max = lengths[season]
      return Promise.resolve([{ max_day: max ?? null }])
    }
    if (sql.includes('MAX(game_day)') && sql.includes('season<?')) {
      const upTo = params[0]
      // pick the closest defined season below `upTo`
      const candidates = Object.keys(lengths)
        .map(Number)
        .filter(s => s < upTo)
        .sort((a, b) => b - a)
      const max = candidates.length ? lengths[candidates[0]] : null
      return Promise.resolve([{ max_day: max ?? null }])
    }
    return Promise.resolve([])
  })
}

describe('stadiumHelper', () => {
  beforeEach(() => {
    query.mockReset()
  })

  describe('getConstructionInfo', () => {
    it('returns underConstruction: false when no construction data', async () => {
      const stadium = {
        north_construction_end_game_day: null,
        north_construction_end_season: null,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      const info = await getConstructionInfo(stadium, 10, 1)

      expect(info.north.underConstruction).toBe(false)
      expect(info.south.underConstruction).toBe(false)
      expect(info.east.underConstruction).toBe(false)
      expect(info.west.underConstruction).toBe(false)
    })

    it('returns underConstruction: true with remaining days when construction is active', async () => {
      mockSeasonLengths({ 1: 34 })
      const stadium = {
        north_construction_end_game_day: 15,
        north_construction_end_season: 1,
        north_construction_target_size: 5000,
        north_construction_target_roof: 1,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      const info = await getConstructionInfo(stadium, 10, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(5)
      expect(info.north.targetSize).toBe(5000)
      expect(info.north.targetRoof).toBe(1)
      expect(info.south.underConstruction).toBe(false)
    })

    it('handles cross-season construction using actual season length', async () => {
      // Season 4 actually has 42 game days (league + cup), not 34.
      mockSeasonLengths({ 4: 42, 5: 42 })
      const stadium = {
        north_construction_end_game_day: 3,
        north_construction_end_season: 5,
        north_construction_target_size: 5000,
        north_construction_target_roof: 0,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      // Current: (4, 40). Remaining within season 4: 42 - 40 = 2. Plus 3 in season 5 = 5.
      const info = await getConstructionInfo(stadium, 40, 4)
      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(5)
    })

    // Regression for the "wird heute fertiggestellt" stuck bug: with the old
    // hardcoded GAMEDAYS_PER_SEASON=34, a build started near the end of a
    // 42-day season got endSeason wrongly bumped to season+1, which made
    // remainingGameDays evaluate to 0 immediately AND prevented the SQL
    // completion check from ever firing in the current season.
    it('does not report 0 remaining for a fresh build started near end of season', async () => {
      mockSeasonLengths({ 4: 42, 5: 42 })
      // Build ends correctly in season 4 day 43 (started day 40, duration 3) —
      // with new no-bad-wrap logic, end stays in season 4.
      const stadium = {
        north_construction_end_game_day: 43,
        north_construction_end_season: 4,
        north_construction_target_size: 5000,
        north_construction_target_roof: 0,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      const info = await getConstructionInfo(stadium, 40, 4)
      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(3)
    })
  })

  describe('calculateConstructionTime', () => {
    it('returns minimum 4 days for small expansions', () => {
      const time = calculateConstructionTime(1000, 1500, false, false)
      expect(time).toBe(4)
    })

    it('returns 5 days for 3000 seats (per new formula)', () => {
      // 3000 / 600 = 5 → max(4, 5) = 5
      const time = calculateConstructionTime(1000, 4000, false, false)
      expect(time).toBe(5)
    })

    it('scales linearly with seat difference above the minimum', () => {
      // 6000 / 600 = 10
      const time = calculateConstructionTime(0, 6000, false, false)
      expect(time).toBe(10)
    })

    it('adds 3 days when adding roof', () => {
      const timeWithoutRoof = calculateConstructionTime(1000, 2000, false, false)
      const timeWithRoof = calculateConstructionTime(1000, 2000, false, true)
      expect(timeWithRoof).toBe(timeWithoutRoof + 3)
    })

    it('does not add roof time when roof already exists', () => {
      const time = calculateConstructionTime(1000, 2000, true, true)
      expect(time).toBe(4) // Base time only (min)
    })
  })

  describe('calculateConstructionEndDate', () => {
    it('keeps end date within same season when it fits', async () => {
      mockSeasonLengths({ 1: 34 })
      const { endGameDay, endSeason } = await calculateConstructionEndDate(10, 1, 5)
      expect(endGameDay).toBe(15)
      expect(endSeason).toBe(1)
    })

    it('wraps into the next season using the ACTUAL season length, not a hardcoded 34', async () => {
      // Season 4 is 42 days long because cup days are interleaved.
      // Build started on day 40 with 5-day duration must end on day 3 of
      // season 5 (42 - 40 = 2 days remain in season 4, then 3 more in season 5).
      mockSeasonLengths({ 4: 42, 5: 42 })
      const { endGameDay, endSeason } = await calculateConstructionEndDate(40, 4, 5)
      expect(endSeason).toBe(5)
      expect(endGameDay).toBe(3)
    })

    it('does not wrap prematurely when build fits inside a longer season', async () => {
      // Old bug: with GAMEDAYS_PER_SEASON=34, started day 32 + 5 days = 37 → wrapped to (5, 3).
      // New: season 4 actually has 42 days, so end stays at (4, 37).
      mockSeasonLengths({ 4: 42 })
      const { endGameDay, endSeason } = await calculateConstructionEndDate(32, 4, 5)
      expect(endSeason).toBe(4)
      expect(endGameDay).toBe(37)
    })

    it('wraps multiple seasons if duration is huge', async () => {
      mockSeasonLengths({ 1: 34, 2: 34, 3: 34 })
      const { endGameDay, endSeason } = await calculateConstructionEndDate(30, 1, 70)
      // 30 + 4 = 34 (end of season 1). 66 remaining. season 2: 34 days. 32 remaining.
      // season 3: ends at day 32.
      expect(endSeason).toBe(3)
      expect(endGameDay).toBe(32)
    })
  })
})
