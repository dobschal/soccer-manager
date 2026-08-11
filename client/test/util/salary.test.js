import { describe, it, expect } from 'vitest'
import {
  getSalary,
  SALARY_AT_KNEE,
  SALARY_AT_LEVEL_1,
  SALARY_AT_LEVEL_100,
  SALARY_KNEE_LEVEL
} from '../../util/player.js'

describe('getSalary two-segment curve (#543)', () => {
  it('anchors the three fixed points of the curve', () => {
    expect(getSalary(1)).toBe(SALARY_AT_LEVEL_1)
    expect(getSalary(SALARY_KNEE_LEVEL)).toBe(SALARY_AT_KNEE)
    expect(getSalary(100)).toBe(SALARY_AT_LEVEL_100)
  })

  it('leaves the lower half of the curve exactly where it was', () => {
    // These are the values the old single-segment curve produced — small clubs
    // must not notice this change at all.
    expect(getSalary(10)).toBe(220)
    expect(getSalary(20)).toBe(337)
    expect(getSalary(30)).toBe(517)
    expect(getSalary(40)).toBe(793)
  })

  it('climbs far more steeply above the knee', () => {
    // Whole lower segment (1 → 50) multiplies the wage by ~8; the upper one
    // (50 → 100) by ~41, over the same number of levels.
    const lowerSegment = getSalary(SALARY_KNEE_LEVEL) / getSalary(1)
    const upperSegment = getSalary(100) / getSalary(SALARY_KNEE_LEVEL)
    expect(upperSegment).toBeGreaterThan(lowerSegment * 4)
  })

  it('makes a genuine star cost real money', () => {
    // The point of the ticket: a level-100 player should hurt a top club.
    expect(getSalary(100)).toBeGreaterThan(getSalary(50) * 40)
  })

  it('rises monotonically across the whole range', () => {
    for (let level = 2; level <= 100; level++) {
      expect(getSalary(level)).toBeGreaterThanOrEqual(getSalary(level - 1))
    }
  })

  it('has no jump at the knee', () => {
    const step = getSalary(SALARY_KNEE_LEVEL + 1) - getSalary(SALARY_KNEE_LEVEL)
    const previousStep = getSalary(SALARY_KNEE_LEVEL) - getSalary(SALARY_KNEE_LEVEL - 1)
    // The gradient changes, but not discontinuously.
    expect(step).toBeGreaterThan(previousStep)
    expect(step).toBeLessThan(previousStep * 4)
  })

  it('returns whole euros', () => {
    for (const level of [7, 33, 58, 91]) {
      expect(Number.isInteger(getSalary(level))).toBe(true)
    }
  })

  it('pays nothing for a level of zero or below', () => {
    expect(getSalary(0)).toBe(0)
    expect(getSalary(-5)).toBe(0)
  })
})
