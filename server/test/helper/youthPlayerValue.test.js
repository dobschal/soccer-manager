import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import {
  calculateYouthPlayerValue,
  YOUTH_VALUE_TALENT_WEIGHT
} from '../../helper/youthPlayerHelper.js'

/**
 * @param {object} over
 * @returns {object}
 */
const youth = (over = {}) => ({ level: 10, talent: 0.5, birth_season: 5, ...over })

describe('calculateYouthPlayerValue (#524)', () => {
  it('is worth more the higher the level', () => {
    const low = calculateYouthPlayerValue(youth({ level: 3 }), 5)
    const high = calculateYouthPlayerValue(youth({ level: 12 }), 5)
    expect(high).toBeGreaterThan(low)
  })

  it('is worth more the higher the talent', () => {
    const dud = calculateYouthPlayerValue(youth({ talent: 0.1 }), 5)
    const gem = calculateYouthPlayerValue(youth({ talent: 1.0 }), 5)
    expect(gem).toBeGreaterThan(dud)
  })

  it('spans the configured talent range around the level price', () => {
    const noTalent = calculateYouthPlayerValue(youth({ talent: 0 }), 5)
    const maxTalent = calculateYouthPlayerValue(youth({ talent: 1 }), 5)
    const mid = calculateYouthPlayerValue(youth({ talent: 0.5 }), 5)
    expect(noTalent / mid).toBeCloseTo(1 - YOUTH_VALUE_TALENT_WEIGHT, 2)
    expect(maxTalent / mid).toBeCloseTo(1 + YOUTH_VALUE_TALENT_WEIGHT, 2)
  })

  it('does not depreciate for age — every youth player is under 22', () => {
    const fifteen = calculateYouthPlayerValue(youth({ birth_season: 5 }), 5)
    const eighteen = calculateYouthPlayerValue(youth({ birth_season: 2 }), 5)
    expect(eighteen).toBe(fifteen)
  })

  it('returns a whole number of euros', () => {
    const value = calculateYouthPlayerValue(youth({ level: 7.34, talent: 0.73 }), 5)
    expect(Number.isInteger(value)).toBe(true)
  })

  it('stays positive for the weakest possible prospect', () => {
    expect(calculateYouthPlayerValue(youth({ level: 1, talent: 0.1 }), 5)).toBeGreaterThan(0)
  })

  it('treats a missing talent as zero rather than NaN', () => {
    expect(calculateYouthPlayerValue({ level: 5, birth_season: 5 }, 5)).toBeGreaterThan(0)
  })

  it('clamps a talent above 1 instead of inflating the price', () => {
    const sane = calculateYouthPlayerValue(youth({ talent: 1 }), 5)
    expect(calculateYouthPlayerValue(youth({ talent: 5 }), 5)).toBe(sane)
  })
})
