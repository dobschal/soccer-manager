import { describe, it, expect } from 'vitest'
import { _getBotPlayerLevelRange, _getBotStadiumConfig } from '../prepare-season.js'
import { getSalary } from '../../client/util/player.js'

describe('bot team balancing', () => {
  describe('_getBotPlayerLevelRange', () => {
    it('returns correct range for level 0 (top division)', () => {
      const range = _getBotPlayerLevelRange(0)
      expect(range).toEqual({ min: 40, max: 60 })
    })

    it('returns correct range for level 1', () => {
      const range = _getBotPlayerLevelRange(1)
      expect(range).toEqual({ min: 30, max: 50 })
    })

    it('returns correct range for level 2', () => {
      const range = _getBotPlayerLevelRange(2)
      expect(range).toEqual({ min: 20, max: 40 })
    })

    it('returns correct range for level 3', () => {
      const range = _getBotPlayerLevelRange(3)
      expect(range).toEqual({ min: 10, max: 30 })
    })

    it('uses formula for level 4+', () => {
      const range4 = _getBotPlayerLevelRange(4)
      expect(range4).toEqual({ min: 10, max: 30 })

      const range5 = _getBotPlayerLevelRange(5)
      expect(range5).toEqual({ min: 1, max: 20 })

      const range6 = _getBotPlayerLevelRange(6)
      expect(range6).toEqual({ min: 1, max: 10 })
    })

    it('never returns min below 1', () => {
      for (let level = 0; level <= 20; level++) {
        const range = _getBotPlayerLevelRange(level)
        expect(range.min).toBeGreaterThanOrEqual(1)
      }
    })

    it('never returns max above 100', () => {
      for (let level = 0; level <= 20; level++) {
        const range = _getBotPlayerLevelRange(level)
        expect(range.max).toBeLessThanOrEqual(100)
      }
    })

    it('min is always <= max', () => {
      for (let level = 0; level <= 20; level++) {
        const range = _getBotPlayerLevelRange(level)
        expect(range.min).toBeLessThanOrEqual(range.max)
      }
    })
  })

  describe('_getBotStadiumConfig', () => {
    it('returns correct config for level 0', () => {
      const config = _getBotStadiumConfig(0)
      expect(config).toEqual({ n: 2600, s: 1300, e: 650, w: 650 })
    })

    it('returns correct config for level 1', () => {
      const config = _getBotStadiumConfig(1)
      expect(config).toEqual({ n: 1700, s: 850, e: 425, w: 425 })
    })

    it('returns correct config for level 2', () => {
      const config = _getBotStadiumConfig(2)
      expect(config).toEqual({ n: 1200, s: 600, e: 300, w: 300 })
    })

    it('returns correct config for level 3', () => {
      const config = _getBotStadiumConfig(3)
      expect(config).toEqual({ n: 750, s: 375, e: 188, w: 187 })
    })

    it('returns correct config for level 4', () => {
      const config = _getBotStadiumConfig(4)
      expect(config).toEqual({ n: 750, s: 375, e: 188, w: 187 })
    })

    it('returns correct config for level 5', () => {
      const config = _getBotStadiumConfig(5)
      expect(config).toEqual({ n: 500, s: 250, e: 125, w: 125 })
    })

    it('returns correct config for level 6', () => {
      const config = _getBotStadiumConfig(6)
      expect(config).toEqual({ n: 200, s: 200, e: 122, w: 122 })
    })

    it('returns minimum config for level 7+', () => {
      const config7 = _getBotStadiumConfig(7)
      expect(config7).toEqual({ n: 200, s: 100, e: 100, w: 100 })

      const config10 = _getBotStadiumConfig(10)
      expect(config10).toEqual({ n: 200, s: 100, e: 100, w: 100 })
    })

    it('all stand sizes meet minimums (N/S >= 200, E/W >= 100)', () => {
      for (let level = 0; level <= 10; level++) {
        const config = _getBotStadiumConfig(level)
        expect(config.n).toBeGreaterThanOrEqual(200)
        expect(config.s).toBeGreaterThanOrEqual(100)
        expect(config.e).toBeGreaterThanOrEqual(100)
        expect(config.w).toBeGreaterThanOrEqual(100)
      }
    })
  })

  describe('financial viability (levels 0-4)', () => {
    for (let level = 0; level <= 4; level++) {
      it(`level ${level} stadium income covers salary costs`, () => {
        const range = _getBotPlayerLevelRange(level)
        const avgLevel = (range.min + range.max) / 2
        const salaryCost = 18 * getSalary(Math.round(avgLevel)) * 34

        const demand = Math.pow(11 * avgLevel, 2) / 100 * Math.pow(15 / 13, 2)
        const stadiumConfig = _getBotStadiumConfig(level)
        const stands = [stadiumConfig.n, stadiumConfig.s, stadiumConfig.e, stadiumConfig.w]
        const income = 17 * stands.reduce((sum, size) => sum + Math.min(size, demand) * 13, 0)

        expect(income).toBeGreaterThanOrEqual(salaryCost)
      })
    }
  })
})
