import { describe, it, expect } from 'vitest'
import {
  getSalary,
  SALARY_AT_LEVEL_1,
  SALARY_AT_LEVEL_100,
  SALARY_STAR_PIVOT_LEVEL
} from '../../util/player.js'

/**
 * The single-exponential curve in place before the star segment was added,
 * kept here so the tests can assert the direction of the change.
 * @param {number} level
 * @returns {number}
 */
const previousCurve = (level) => Math.floor(72 * Math.pow(18500 / 72, (level - 1) / 99))

/**
 * The curve that predated #543 — still the reference for "weak players got
 * cheaper than they historically were".
 * @param {number} level
 * @returns {number}
 */
const legacyCurve = (level) => Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))

describe('getSalary curve', () => {
  it('anchors both ends of the curve', () => {
    expect(getSalary(1)).toBe(SALARY_AT_LEVEL_1)
    expect(getSalary(100)).toBe(SALARY_AT_LEVEL_100)
  })

  it('leaves everything up to the pivot untouched', () => {
    // The base segment is the #543 exponential, unchanged.
    for (let level = 1; level <= SALARY_STAR_PIVOT_LEVEL; level++) {
      expect(getSalary(level)).toBe(previousCurve(level))
    }
  })

  it('matches the calibrated table', () => {
    // See requirements/player-sallary.md.
    expect(getSalary(10)).toBe(119)
    expect(getSalary(20)).toBe(208)
    expect(getSalary(40)).toBe(640)
    expect(getSalary(50)).toBe(1122)
    expect(getSalary(70)).toBe(3442)
    expect(getSalary(80)).toBe(8108)
    expect(getSalary(90)).toBe(19101)
  })

  it('charges star players noticeably more than the flat curve did', () => {
    // The whole point: 80+ has to hurt, and the higher you go the more it hurts.
    expect(getSalary(80) / previousCurve(80)).toBeGreaterThan(1.3)
    expect(getSalary(90) / previousCurve(90)).toBeGreaterThan(1.7)
    expect(getSalary(100) / previousCurve(100)).toBeGreaterThan(2.4)
  })

  it('makes weak players cheaper than the curve #543 replaced', () => {
    for (const level of [1, 10, 20, 30, 40, 50]) {
      expect(getSalary(level)).toBeLessThan(legacyCurve(level))
    }
  })

  it('rises monotonically across the whole range', () => {
    for (let level = 2; level <= 100; level++) {
      expect(getSalary(level)).toBeGreaterThan(getSalary(level - 1))
    }
  })

  it('joins the two segments without a jump at the pivot', () => {
    // Continuous, but the step per level must visibly grow once past the pivot —
    // otherwise the star segment is not doing its job.
    const stepBelow = getSalary(SALARY_STAR_PIVOT_LEVEL) / getSalary(SALARY_STAR_PIVOT_LEVEL - 1)
    const stepAbove = getSalary(SALARY_STAR_PIVOT_LEVEL + 1) / getSalary(SALARY_STAR_PIVOT_LEVEL)
    expect(stepAbove).toBeGreaterThan(stepBelow)
    expect(stepAbove).toBeLessThan(1.15)
  })

  it('keeps each segment itself smooth', () => {
    const ratios = (from, to) => {
      const out = []
      for (let level = from + 1; level <= to; level++) out.push(getSalary(level) / getSalary(level - 1))
      return out
    }
    for (const segment of [ratios(1, SALARY_STAR_PIVOT_LEVEL), ratios(SALARY_STAR_PIVOT_LEVEL, 100)]) {
      expect(Math.max(...segment) - Math.min(...segment)).toBeLessThan(0.02)
    }
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
