import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))

import { query } from '../../lib/database.js'
import {
  getConstructionInfo,
  calculateConstructionTime,
  calculateConstructionEndDate,
  calculateHomeAttendanceBonus,
  calculateSeatExpansionPrice,
  calcuateStadiumBuild,
  completeAllStadiumConstructionsForTeam
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

    it('reports construction on a corner stand', async () => {
      mockSeasonLengths({ 1: 34 })
      const stadium = {
        corner_ne_construction_end_game_day: 15,
        corner_ne_construction_end_season: 1,
        corner_ne_construction_target_size: 500,
        corner_ne_construction_target_roof: 0
      }

      const info = await getConstructionInfo(stadium, 10, 1)

      expect(info.corner_ne.underConstruction).toBe(true)
      expect(info.corner_ne.remainingGameDays).toBe(5)
      expect(info.corner_ne.targetSize).toBe(500)
      // Untouched corners report no construction
      expect(info.corner_nw.underConstruction).toBe(false)
      expect(info.north.underConstruction).toBe(false)
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

  describe('completeAllStadiumConstructionsForTeam', () => {
    it('does nothing when the team has no stadium', async () => {
      query.mockResolvedValueOnce([])
      await completeAllStadiumConstructionsForTeam(42, 5, 3)
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('skips stands without active construction', async () => {
      query.mockResolvedValueOnce([{
        id: 7,
        north_construction_end_game_day: null,
        south_construction_end_game_day: null,
        east_construction_end_game_day: null,
        west_construction_end_game_day: null
      }])
      await completeAllStadiumConstructionsForTeam(42, 5, 3)
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('finalizes every active stand and marks its history complete', async () => {
      query.mockResolvedValueOnce([{
        id: 7,
        north_construction_end_game_day: 20,
        north_construction_end_season: 3,
        south_construction_end_game_day: null,
        east_construction_end_game_day: 12,
        east_construction_end_season: 4,
        west_construction_end_game_day: null
      }])
      query.mockResolvedValue({})

      await completeAllStadiumConstructionsForTeam(42, 5, 3)

      const updates = query.mock.calls.filter(([sql]) => /UPDATE stadium\s+SET/.test(sql))
      expect(updates).toHaveLength(2)
      expect(updates[0][0]).toMatch(/north_stand_size\s+=\s+north_construction_target_size/)
      expect(updates[1][0]).toMatch(/east_stand_size\s+=\s+east_construction_target_size/)

      const historyUpdates = query.mock.calls.filter(([sql]) => /UPDATE stadium_construction_history/.test(sql))
      expect(historyUpdates).toHaveLength(2)
      expect(historyUpdates[0][1]).toEqual([5, 3, 7, 'north'])
      expect(historyUpdates[1][1]).toEqual([5, 3, 7, 'east'])
    })
  })

  describe('calculateSeatExpansionPrice', () => {
    it('charges 500 €/seat inside the first tier (0–2,000)', () => {
      expect(calculateSeatExpansionPrice(200, 1200)).toBe(500_000)
    })

    it('charges 1,000 €/seat inside the second tier (2,001–10,000)', () => {
      expect(calculateSeatExpansionPrice(5_000, 6_000)).toBe(1_000_000)
    })

    it('charges 1,500 €/seat inside the third tier (10,001–20,000)', () => {
      expect(calculateSeatExpansionPrice(15_000, 16_000)).toBe(1_500_000)
    })

    it('charges 2,000 €/seat inside the top tier (20,001+)', () => {
      expect(calculateSeatExpansionPrice(25_000, 26_000)).toBe(2_000_000)
    })

    it('splits cost across tier boundaries', () => {
      // 1,500 → 3,000: 500 seats @ 500 + 1,000 seats @ 1,000
      expect(calculateSeatExpansionPrice(1_500, 3_000)).toBe(500 * 500 + 1_000 * 1_000)
    })

    it('spans multiple tiers correctly', () => {
      // 0 → 12,000: 2,000@500 + 8,000@1,000 + 2,000@1,500
      expect(calculateSeatExpansionPrice(0, 12_000)).toBe(2_000 * 500 + 8_000 * 1_000 + 2_000 * 1_500)
    })

    it('returns 0 when no seats are added', () => {
      expect(calculateSeatExpansionPrice(5_000, 5_000)).toBe(0)
    })
  })

  describe('calcuateStadiumBuild', () => {
    const baseStadium = (overrides = {}) => ({
      north_stand_size: 200,
      south_stand_size: 200,
      east_stand_size: 100,
      west_stand_size: 100,
      north_stand_roof: 0,
      south_stand_roof: 0,
      east_stand_roof: 0,
      west_stand_roof: 0,
      ...overrides
    })

    it('returns 0 when nothing changes', () => {
      expect(calcuateStadiumBuild(baseStadium(), baseStadium())).toBe(0)
    })

    it('adds the 50,000 € architect fee on top of the seat price', () => {
      // 200 → 1,200 north stand: 1,000 seats @ 500 = 500,000 + 50,000 architect
      const current = baseStadium()
      const planned = baseStadium({ north_stand_size: 1_200 })
      expect(calcuateStadiumBuild(current, planned)).toBe(500_000 + 50_000)
    })

    it('applies tier pricing when expanding a large stand', () => {
      // 20,000 → 21,000: 1,000 seats @ 2,000 = 2,000,000 + 50,000 architect
      const current = baseStadium({ north_stand_size: 20_000 })
      const planned = baseStadium({ north_stand_size: 21_000 })
      expect(calcuateStadiumBuild(current, planned)).toBe(2_000_000 + 50_000)
    })

    it('sums multiple stand expansions and charges the architect fee once', () => {
      // North 200→1,200 = 500,000; South 200→1,200 = 500,000; + 50,000
      const current = baseStadium()
      const planned = baseStadium({ north_stand_size: 1_200, south_stand_size: 1_200 })
      expect(calcuateStadiumBuild(current, planned)).toBe(500_000 + 500_000 + 50_000)
    })

    it('charges the roof per covered seat on top of tier pricing', () => {
      // 200 → 1,200 = 500,000 seats; roof covers all 1,200 seats @ 100 = 120,000; + 50k
      const current = baseStadium()
      const planned = baseStadium({ north_stand_size: 1_200, north_stand_roof: 1 })
      expect(calcuateStadiumBuild(current, planned)).toBe(500_000 + 120_000 + 50_000)
    })

    it('does not charge for corner stands that stay unbuilt (size 0)', () => {
      // Corner stands start at size 0, which is below their 50 minimum. Keeping
      // them unbuilt must not trip the minimum-size validation.
      const current = baseStadium({ corner_ne_stand_size: 0, corner_nw_stand_size: 0, corner_se_stand_size: 0, corner_sw_stand_size: 0 })
      const planned = baseStadium({ corner_ne_stand_size: 0, corner_nw_stand_size: 0, corner_se_stand_size: 0, corner_sw_stand_size: 0 })
      expect(calcuateStadiumBuild(current, planned)).toBe(0)
    })

    it('prices a corner stand expansion from 0 to 500 seats', () => {
      // 0 → 500 corner: 500 seats @ 500 = 250,000 + 50,000 architect
      const current = baseStadium({ corner_ne_stand_size: 0 })
      const planned = baseStadium({ corner_ne_stand_size: 500 })
      expect(calcuateStadiumBuild(current, planned)).toBe(250_000 + 50_000)
    })

    it('rejects a corner stand below its 50-seat minimum', () => {
      const current = baseStadium({ corner_ne_stand_size: 0 })
      const planned = baseStadium({ corner_ne_stand_size: 40 })
      expect(() => calcuateStadiumBuild(current, planned)).toThrow(/Minimum size/)
    })

    it('allows a corner stand right at its 50-seat minimum', () => {
      // 50 seats @ 500 = 25,000 + 50,000 architect
      const current = baseStadium({ corner_ne_stand_size: 0 })
      const planned = baseStadium({ corner_ne_stand_size: 50 })
      expect(calcuateStadiumBuild(current, planned)).toBe(25_000 + 50_000)
    })

    it('rejects a corner stand above its 4,000-seat maximum', () => {
      const current = baseStadium({ corner_ne_stand_size: 0 })
      const planned = baseStadium({ corner_ne_stand_size: 5_000 })
      expect(() => calcuateStadiumBuild(current, planned)).toThrow(/Maximum size/)
    })

    describe('roofs', () => {
      it('charges the roof extension when a roofed stand grows and keeps its roof', () => {
        // 200 → 1,200 = 500,000 seats; extension covers the 1,000 added seats @ 100 = 100,000
        const current = baseStadium({ north_stand_roof: 1 })
        const planned = baseStadium({ north_stand_size: 1_200, north_stand_roof: 1 })
        expect(calcuateStadiumBuild(current, planned)).toBe(500_000 + 100_000 + 50_000)
      })

      it('charges the roof extension per added seat, not per seat price tier', () => {
        // 10,000 → 11,000 = 1,500,000 seats; extension: 1,000 added seats @ 100 = 100,000.
        // Expensive seats do not make the cover above them more expensive.
        const current = baseStadium({ north_stand_size: 10_000, north_stand_roof: 1 })
        const planned = baseStadium({ north_stand_size: 11_000, north_stand_roof: 1 })
        expect(calcuateStadiumBuild(current, planned)).toBe(1_500_000 + 100_000 + 50_000)
      })

      it('charges the roof extension only for the seats that were added', () => {
        // 200 → 400 = 100,000 seats; extension: 200 added seats @ 100 = 20,000
        const current = baseStadium({ north_stand_roof: 1 })
        const planned = baseStadium({ north_stand_size: 400, north_stand_roof: 1 })
        expect(calcuateStadiumBuild(current, planned)).toBe(100_000 + 20_000 + 50_000)
      })

      it('charges less for extending a roof than for putting up a new one', () => {
        // Same expansion, once with an existing roof (only the added seats need
        // cover) and once without (the whole stand does, floored at 50k).
        const planned = { north_stand_size: 400, north_stand_roof: 1 }
        const extension = calcuateStadiumBuild(
          baseStadium({ north_stand_roof: 1 }),
          baseStadium(planned)
        )
        const newRoof = calcuateStadiumBuild(baseStadium(), baseStadium(planned))
        expect(extension).toBeLessThan(newRoof)
      })

      it('lets an existing roof be torn down while the stand is expanded', () => {
        // Only the seats are charged - tearing the roof down is free
        const current = baseStadium({ north_stand_roof: 1 })
        const planned = baseStadium({ north_stand_size: 1_200, north_stand_roof: 0 })
        expect(calcuateStadiumBuild(current, planned)).toBe(500_000 + 50_000)
      })

      it('tears a roof down for free without any other change', () => {
        const current = baseStadium({ north_stand_roof: 1 })
        const planned = baseStadium({ north_stand_roof: 0 })
        expect(calcuateStadiumBuild(current, planned)).toBe(0)
      })

      it('charges the roof minimum when only a roof is added to a tiny stand', () => {
        // 200 seats @ 100 = 20,000 → floored to the 50,000 € minimum
        const current = baseStadium()
        const planned = baseStadium({ north_stand_roof: 1 })
        expect(calcuateStadiumBuild(current, planned)).toBe(50_000 + 50_000)
      })

      it('scales a retrofitted roof with the size of the stand underneath it', () => {
        // Retrofitting adds no seats, so the roof used to fall through to a flat
        // 300,000 € no matter how big the stand was. It now costs 100 €/seat.
        const roofOnly = (size) => calcuateStadiumBuild(
          baseStadium({ north_stand_size: size }),
          baseStadium({ north_stand_size: size, north_stand_roof: 1 })
        )
        expect(roofOnly(1_000)).toBe(100_000 + 50_000)
        expect(roofOnly(15_000)).toBe(1_500_000 + 50_000)
      })

      it('costs the same to build a roofed stand at once as to grow it in steps', () => {
        // Building 200 → 5,000 with a roof in one action, versus roofing at 1,000
        // and extending afterwards. Only the extra architect fee differs.
        const atOnce = calcuateStadiumBuild(
          baseStadium(),
          baseStadium({ north_stand_size: 5_000, north_stand_roof: 1 })
        )
        const firstStep = calcuateStadiumBuild(
          baseStadium(),
          baseStadium({ north_stand_size: 1_000, north_stand_roof: 1 })
        )
        const secondStep = calcuateStadiumBuild(
          baseStadium({ north_stand_size: 1_000, north_stand_roof: 1 }),
          baseStadium({ north_stand_size: 5_000, north_stand_roof: 1 })
        )
        expect(firstStep + secondStep).toBe(atOnce + 50_000)
      })

      it('rejects a roof on a corner stand that was never built', () => {
        const current = baseStadium({ corner_ne_stand_size: 0 })
        const planned = baseStadium({ corner_ne_stand_size: 0, corner_ne_stand_roof: 1 })
        expect(() => calcuateStadiumBuild(current, planned)).toThrow(/Minimum size/)
      })
    })
  })
})
