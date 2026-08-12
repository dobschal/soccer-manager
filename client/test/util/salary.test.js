import { describe, it, expect } from 'vitest'
import {
  getSalary,
  SALARY_AT_LEVEL_1,
  SALARY_AT_LEVEL_100
} from '../../util/player.js'

/**
 * The single-exponential curve in place before #543, kept here so the tests
 * can assert the direction of the change rather than just its values.
 * @param {number} level
 * @returns {number}
 */
const previousCurve = (level) => Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))

describe('getSalary curve (#543)', () => {
  it('anchors both ends of the curve', () => {
    expect(getSalary(1)).toBe(SALARY_AT_LEVEL_1)
    expect(getSalary(100)).toBe(SALARY_AT_LEVEL_100)
  })

  it('matches the calibrated table', () => {
    // Tuned against live squads so the top league pays ~20% more than before
    // while the lower tiers pay less — see requirements/player-sallary.md.
    expect(getSalary(10)).toBe(119)
    expect(getSalary(20)).toBe(208)
    expect(getSalary(40)).toBe(640)
    expect(getSalary(50)).toBe(1122)
    expect(getSalary(70)).toBe(3442)
    expect(getSalary(90)).toBe(10562)
  })

  it('makes weak players cheaper than the curve it replaced', () => {
    // Previous curve: 150 * (10308/150)^((level-1)/99)
    for (const level of [1, 10, 20, 30, 40, 50]) {
      expect(getSalary(level)).toBeLessThan(previousCurve(level))
    }
  })

  it('makes strong players more expensive than the curve it replaced', () => {
    for (const level of [60, 70, 80, 90, 100]) {
      expect(getSalary(level)).toBeGreaterThan(previousCurve(level))
    }
  })

  it('crosses the old curve in the middle of the range', () => {
    // Everything below the crossover got cheaper, everything above dearer —
    // that is the whole point of the tilt.
    let crossover = 1
    while (crossover < 100 && getSalary(crossover) < previousCurve(crossover)) crossover++
    expect(crossover).toBeGreaterThan(40)
    expect(crossover).toBeLessThan(70)
  })

  it('rises monotonically across the whole range', () => {
    for (let level = 2; level <= 100; level++) {
      expect(getSalary(level)).toBeGreaterThanOrEqual(getSalary(level - 1))
    }
  })

  it('is a single smooth curve with no step in it', () => {
    // Each level multiplies the wage by the same factor — a two-segment curve
    // would show a jump where the segments meet.
    const ratios = []
    for (let level = 2; level <= 100; level++) {
      ratios.push(getSalary(level) / getSalary(level - 1))
    }
    const min = Math.min(...ratios)
    const max = Math.max(...ratios)
    expect(max - min).toBeLessThan(0.02)
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
