import { describe, it, expect } from 'vitest'
import {
  AGE_IDEAL,
  getLineupAverageAge,
  getSquadAgeStrengthMultiplier,
  getSquadAgeStatus
} from '../../helper/squadAgeHelper.js'

/**
 * Build a lineup whose players all have the given age for the given season.
 * age = 16 + (season - carrier_start_season)  =>  carrier_start_season = season - (age - 16)
 */
function lineupOfAge (age, season, count = 11) {
  const carrierStart = season - (age - 16)
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    level: 50,
    carrier_start_season: carrierStart
  }))
}

describe('squadAgeHelper', () => {
  const season = 20

  describe('getLineupAverageAge', () => {
    it('returns null for an empty lineup', () => {
      expect(getLineupAverageAge([], season)).toBe(null)
    })

    it('computes the average age of the lineup', () => {
      const players = [
        ...lineupOfAge(24, season, 1),
        ...lineupOfAge(28, season, 1)
      ]
      expect(getLineupAverageAge(players, season)).toBe(26)
    })
  })

  describe('getSquadAgeStrengthMultiplier', () => {
    it('returns the full bonus (1.05) at the ideal average age of 27', () => {
      expect(getSquadAgeStrengthMultiplier(lineupOfAge(AGE_IDEAL, season), season)).toBeCloseTo(1.05, 5)
    })

    it('returns the full penalty (0.95) at the maximum deviation', () => {
      expect(getSquadAgeStrengthMultiplier(lineupOfAge(20, season), season)).toBeCloseTo(0.95, 5)
      expect(getSquadAgeStrengthMultiplier(lineupOfAge(34, season), season)).toBeCloseTo(0.95, 5)
    })

    it('stays clamped at 0.95 beyond the maximum deviation', () => {
      expect(getSquadAgeStrengthMultiplier(lineupOfAge(17, season), season)).toBeCloseTo(0.95, 5)
    })

    it('is neutral (1.0) around the crossover deviation', () => {
      // deviation 3.5 => modifier 0.05 - 0.10 * 0.5 = 0
      expect(getSquadAgeStrengthMultiplier(lineupOfAge(27 - 3.5, season), season)).toBeCloseTo(1.0, 5)
    })

    it('returns 1 for an empty lineup', () => {
      expect(getSquadAgeStrengthMultiplier([], season)).toBe(1)
    })
  })

  describe('getSquadAgeStatus', () => {
    it('flags a very young lineup as suboptimal and tooYoung', () => {
      const status = getSquadAgeStatus(lineupOfAge(20, season), season)
      expect(status.suboptimal).toBe(true)
      expect(status.tooYoung).toBe(true)
      expect(status.tooOld).toBe(false)
    })

    it('flags a very old lineup as suboptimal and tooOld', () => {
      const status = getSquadAgeStatus(lineupOfAge(33, season), season)
      expect(status.suboptimal).toBe(true)
      expect(status.tooOld).toBe(true)
      expect(status.tooYoung).toBe(false)
    })

    it('does not flag a balanced lineup', () => {
      const status = getSquadAgeStatus(lineupOfAge(27, season), season)
      expect(status.suboptimal).toBe(false)
      expect(status.tooYoung).toBe(false)
      expect(status.tooOld).toBe(false)
    })
  })
})
