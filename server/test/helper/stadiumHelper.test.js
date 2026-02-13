import { describe, it, expect } from 'vitest'

import {
  getConstructionInfo,
  calculateConstructionTime,
  calculateConstructionEndDate
} from '../../helper/stadiumHelper.js'

describe('stadiumHelper', () => {
  describe('getConstructionInfo', () => {
    it('returns underConstruction: false when no construction data', () => {
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

      const info = getConstructionInfo(stadium, 10, 1)

      expect(info.north.underConstruction).toBe(false)
      expect(info.south.underConstruction).toBe(false)
      expect(info.east.underConstruction).toBe(false)
      expect(info.west.underConstruction).toBe(false)
    })

    it('returns underConstruction: true with remaining days when construction is active', () => {
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

      // Current: day 10, season 1. End: day 15, season 1. Remaining: 5
      const info = getConstructionInfo(stadium, 10, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(5)
      expect(info.north.remainingGameDays).toBeGreaterThan(0)
      expect(info.north.targetSize).toBe(5000)
      expect(info.north.targetRoof).toBe(1)
      expect(info.south.underConstruction).toBe(false)
    })

    it('returns underConstruction: true with remainingGameDays = 1 on last day', () => {
      const stadium = {
        north_construction_end_game_day: 15,
        north_construction_end_season: 1,
        north_construction_target_size: 5000,
        north_construction_target_roof: 0,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      // Current: day 14, season 1. End: day 15, season 1. Remaining: 1
      const info = getConstructionInfo(stadium, 14, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(1)
      expect(info.north.remainingGameDays).toBeGreaterThan(0)
    })

    it('returns underConstruction: true with 0 remaining when end day reached but not yet completed', () => {
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

      // Current: day 15, season 1. End: day 15, season 1. Remaining: 0
      // Still under construction because completeStadiumConstructions hasn't cleared the fields
      const info = getConstructionInfo(stadium, 15, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(0)
    })

    it('returns underConstruction: true with 0 remaining when past end day but not yet completed', () => {
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

      // Current: day 20, season 1. End: day 15, season 1.
      // Still under construction because completeStadiumConstructions hasn't cleared the fields
      const info = getConstructionInfo(stadium, 20, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(0)
    })

    it('handles cross-season construction correctly', () => {
      const stadium = {
        north_construction_end_game_day: 5,
        north_construction_end_season: 2,
        north_construction_target_size: 8000,
        north_construction_target_roof: 1,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      // Current: day 30, season 1. End: day 5, season 2.
      // Current total: 1*34 + 30 = 64
      // End total: 2*34 + 5 = 73
      // Remaining: 73 - 64 = 9
      const info = getConstructionInfo(stadium, 30, 1)

      expect(info.north.underConstruction).toBe(true)
      expect(info.north.remainingGameDays).toBe(9)
      expect(info.north.remainingGameDays).toBeGreaterThan(0)
    })

    it('when underConstruction is true, remainingGameDays is always > 0', () => {
      const testCases = [
        { currentDay: 1, currentSeason: 1, endDay: 10, endSeason: 1 }, // Normal
        { currentDay: 33, currentSeason: 1, endDay: 5, endSeason: 2 }, // Cross-season
        { currentDay: 9, currentSeason: 1, endDay: 10, endSeason: 1 }, // Last day before end
      ]

      for (const tc of testCases) {
        const stadium = {
          north_construction_end_game_day: tc.endDay,
          north_construction_end_season: tc.endSeason,
          north_construction_target_size: 5000,
          north_construction_target_roof: 1,
          south_construction_end_game_day: null,
          south_construction_end_season: null,
          east_construction_end_game_day: null,
          east_construction_end_season: null,
          west_construction_end_game_day: null,
          west_construction_end_season: null
        }

        const info = getConstructionInfo(stadium, tc.currentDay, tc.currentSeason)

        if (info.north.underConstruction) {
          expect(info.north.remainingGameDays).toBeGreaterThan(0)
        }
      }
    })

    it('stand shows under construction until fields are cleared', () => {
      // While construction fields are set, the stand is always under construction.
      // Only completeStadiumConstructions clears the fields and makes it available.
      const stadium = {
        north_construction_end_game_day: 10,
        north_construction_end_season: 1,
        north_construction_target_size: 5000,
        north_construction_target_roof: 1,
        north_stand_size: 2000,
        north_stand_price: 15,
        south_construction_end_game_day: null,
        south_construction_end_season: null,
        east_construction_end_game_day: null,
        east_construction_end_season: null,
        west_construction_end_game_day: null,
        west_construction_end_season: null
      }

      // Days 1-9: construction ongoing with remaining days > 0
      for (let day = 1; day <= 9; day++) {
        const info = getConstructionInfo(stadium, day, 1)
        expect(info.north.underConstruction).toBe(true)
        expect(info.north.remainingGameDays).toBeGreaterThan(0)
      }

      // Day 10+: still under construction (fields not cleared), but remaining is 0
      const infoDay10 = getConstructionInfo(stadium, 10, 1)
      expect(infoDay10.north.underConstruction).toBe(true)
      expect(infoDay10.north.remainingGameDays).toBe(0)
    })

    it('remaining days decrease correctly and reach 0 at end day', () => {
      // End day is 10, season 1. Construction fields remain until completeStadiumConstructions runs.
      const stadium = {
        north_construction_end_game_day: 10,
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

      // Days 5-9: remaining counts down
      for (let day = 5; day <= 9; day++) {
        const info = getConstructionInfo(stadium, day, 1)
        expect(info.north.underConstruction).toBe(true)
        expect(info.north.remainingGameDays).toBe(10 - day)
      }

      // Day 10+: remaining is 0, still under construction until fields cleared
      for (let day = 10; day <= 15; day++) {
        const info = getConstructionInfo(stadium, day, 1)
        expect(info.north.underConstruction).toBe(true)
        expect(info.north.remainingGameDays).toBe(0)
      }
    })
  })

  describe('calculateConstructionTime', () => {
    it('returns minimum 3 days for small expansions', () => {
      const time = calculateConstructionTime(1000, 1500, false, false)
      expect(time).toBe(3)
    })

    it('increases time based on seat difference', () => {
      const time = calculateConstructionTime(1000, 6000, false, false)
      // 5000 seats / 1000 = 5 days
      expect(time).toBe(5)
    })

    it('adds 3 days when adding roof', () => {
      const timeWithoutRoof = calculateConstructionTime(1000, 2000, false, false)
      const timeWithRoof = calculateConstructionTime(1000, 2000, false, true)
      expect(timeWithRoof).toBe(timeWithoutRoof + 3)
    })

    it('does not add time when roof already exists', () => {
      const time = calculateConstructionTime(1000, 2000, true, true)
      expect(time).toBe(3) // Base time only
    })
  })

  describe('calculateConstructionEndDate', () => {
    it('calculates end date within same season', () => {
      const { endGameDay, endSeason } = calculateConstructionEndDate(10, 1, 5)
      expect(endGameDay).toBe(15)
      expect(endSeason).toBe(1)
    })

    it('wraps to next season when needed', () => {
      const { endGameDay, endSeason } = calculateConstructionEndDate(30, 1, 10)
      // 30 + 10 = 40, 40 - 34 = 6
      expect(endGameDay).toBe(6)
      expect(endSeason).toBe(2)
    })

    it('wraps multiple seasons if necessary', () => {
      const { endGameDay, endSeason } = calculateConstructionEndDate(30, 1, 70)
      // 30 + 70 = 100, 100 - 34 = 66, 66 - 34 = 32
      expect(endGameDay).toBe(32)
      expect(endSeason).toBe(3)
    })
  })
})
