import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))

import { query } from '../../lib/database.js'
import {
  getConstructionInfo,
  calculateConstructionTime,
  calculateConstructionEndDate,
  calculateHomeAttendanceBonus
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
    it('returns minimum 8 days for small expansions', () => {
      const time = calculateConstructionTime(1000, 1500, false, false)
      expect(time).toBe(8)
    })

    it('returns 10 days for 3000 seats (per new formula)', () => {
      // 3000 / 300 = 10 → max(8, 10) = 10
      const time = calculateConstructionTime(1000, 4000, false, false)
      expect(time).toBe(10)
    })

    it('scales linearly with seat difference above the minimum', () => {
      // 6000 / 300 = 20
      const time = calculateConstructionTime(0, 6000, false, false)
      expect(time).toBe(20)
    })

    it('adds 6 days when adding roof', () => {
      const timeWithoutRoof = calculateConstructionTime(1000, 2000, false, false)
      const timeWithRoof = calculateConstructionTime(1000, 2000, false, true)
      expect(timeWithRoof).toBe(timeWithoutRoof + 6)
    })

    it('does not add roof time when roof already exists', () => {
      const time = calculateConstructionTime(1000, 2000, true, true)
      expect(time).toBe(8) // Base time only (min)
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

  describe('calculateHomeAttendanceBonus', () => {
    it('returns no modifier for an empty (capacity 0) input', () => {
      const { bonusPct, multiplier } = calculateHomeAttendanceBonus(0, 0)
      expect(bonusPct).toBe(0)
      expect(multiplier).toBe(1)
    })

    it('gives +1% bonus for 6000 spectators in a fully-filled small stadium', () => {
      const { bonusPct, multiplier } = calculateHomeAttendanceBonus(6000, 6000)
      expect(bonusPct).toBeCloseTo(1, 6)
      expect(multiplier).toBeCloseTo(1.01, 6)
    })

    it('gives +5% bonus for 30000 spectators in a fully-filled stadium', () => {
      const { bonusPct } = calculateHomeAttendanceBonus(30000, 30000)
      expect(bonusPct).toBeCloseTo(5, 6)
    })

    it('caps the positive bonus at +10% even when attendance exceeds 60000', () => {
      const { bonusPct } = calculateHomeAttendanceBonus(120000, 120000)
      expect(bonusPct).toBeCloseTo(10, 6)
    })

    it('applies a -10% malus when the stadium has capacity but is empty', () => {
      const { bonusPct, multiplier } = calculateHomeAttendanceBonus(0, 50000)
      expect(bonusPct).toBeCloseTo(-10, 6)
      expect(multiplier).toBeCloseTo(0.9, 6)
    })

    it('applies a -5% malus at exactly 25% fill rate', () => {
      const { bonusPct } = calculateHomeAttendanceBonus(2500, 10000)
      // attendance bonus: 2500/6000 ≈ 0.4167%, malus: ((50-25)/50)*10 = 5%, net ≈ -4.58%
      expect(bonusPct).toBeCloseTo(2500 / 6000 - 5, 6)
    })

    it('has no malus at exactly 50% fill rate', () => {
      // 5000/10000 = 50% fill; small +0.83% from absolute attendance, no malus.
      const { bonusPct, malusPct } = calculateHomeAttendanceBonus(5000, 10000)
      expect(malusPct).toBe(0)
      expect(bonusPct).toBeCloseTo(5000 / 6000, 6)
    })

    it('combines absolute bonus and fill-rate malus additively for big half-empty stadiums', () => {
      // 60k capacity, 15k attendance: bonus 15000/6000 = 2.5%, fill 25% → malus 5%, net -2.5%
      const { bonusPct } = calculateHomeAttendanceBonus(15000, 60000)
      expect(bonusPct).toBeCloseTo(-2.5, 6)
    })

    it('handles undefined / negative inputs as zero', () => {
      expect(calculateHomeAttendanceBonus(undefined, undefined).bonusPct).toBe(0)
      expect(calculateHomeAttendanceBonus(-100, -100).bonusPct).toBe(0)
    })
  })
})
