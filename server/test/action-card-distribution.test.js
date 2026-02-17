import { describe, it, expect } from 'vitest'
import { TRAINING_AREA_CARD_CHANCES } from '../helper/buildingHelper.js'
import { actionCardChances } from '../helper/actionCardHelper.js'

/**
 * Simulates the action card distribution logic from _giveUsersActionCards
 * for a single team on a single game day.
 * @param {number} trainingLevel - The team's training area level (0-3)
 * @returns {Object} Map of action -> count of cards received
 */
function simulateCardDistribution (trainingLevel) {
  const cardOverrides = TRAINING_AREA_CARD_CHANCES[trainingLevel] || TRAINING_AREA_CARD_CHANCES[1]
  const cards = {}

  for (const [action, defaultChance] of Object.entries(actionCardChances)) {
    const chance = cardOverrides[action] !== undefined ? cardOverrides[action] : defaultChance
    const guaranteed = Math.floor(chance)
    const remainder = chance - guaranteed
    let count = guaranteed
    if (Math.random() < remainder) {
      count++
    }
    if (count > 0) {
      cards[action] = (cards[action] || 0) + count
    }
  }

  return cards
}

/**
 * Simulates many game days and returns totals per card type.
 * @param {number} trainingLevel
 * @param {number} days
 * @returns {Object} Map of action -> total count
 */
function simulateManyDays (trainingLevel, days) {
  const totals = {}
  for (let i = 0; i < days; i++) {
    const cards = simulateCardDistribution(trainingLevel)
    for (const [action, count] of Object.entries(cards)) {
      totals[action] = (totals[action] || 0) + count
    }
  }
  return totals
}

describe('action card distribution by training area level', () => {
  const SIMULATION_DAYS = 10000

  describe('level 0 - no training area', () => {
    it('should never give LEVEL_UP_PLAYER_70 cards', () => {
      const totals = simulateManyDays(0, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_70 || 0).toBe(0)
    })

    it('should never give LEVEL_UP_PLAYER_100 cards', () => {
      const totals = simulateManyDays(0, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_100 || 0).toBe(0)
    })

    it('should give very few LEVEL_UP_PLAYER_40 cards (chance 0.2/day)', () => {
      const totals = simulateManyDays(0, SIMULATION_DAYS)
      const count = totals.LEVEL_UP_PLAYER_40 || 0
      // Expected: ~2000 over 10000 days (0.2/day). Allow wide margin.
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThan(SIMULATION_DAYS * 0.4)
    })

    it('should still give non-LEVEL_UP cards normally', () => {
      const totals = simulateManyDays(0, SIMULATION_DAYS)
      // FRESHNESS_10 has 0.88/day chance, should appear many times
      expect(totals.FRESHNESS_10 || 0).toBeGreaterThan(SIMULATION_DAYS * 0.5)
    })
  })

  describe('level 1 - basic training area', () => {
    it('should give LEVEL_UP_PLAYER_40 cards (chance 1.2/day)', () => {
      const totals = simulateManyDays(1, SIMULATION_DAYS)
      const count = totals.LEVEL_UP_PLAYER_40 || 0
      // Expected: ~12000 over 10000 days. Must be significantly more than level 0.
      expect(count).toBeGreaterThan(SIMULATION_DAYS * 0.8)
    })

    it('should never give LEVEL_UP_PLAYER_70 cards', () => {
      const totals = simulateManyDays(1, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_70 || 0).toBe(0)
    })

    it('should never give LEVEL_UP_PLAYER_100 cards', () => {
      const totals = simulateManyDays(1, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_100 || 0).toBe(0)
    })
  })

  describe('level 2 - intermediate training area', () => {
    it('should give LEVEL_UP_PLAYER_40 cards', () => {
      const totals = simulateManyDays(2, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_40 || 0).toBeGreaterThan(SIMULATION_DAYS * 0.8)
    })

    it('should give LEVEL_UP_PLAYER_70 cards (chance 0.3/day)', () => {
      const totals = simulateManyDays(2, SIMULATION_DAYS)
      const count = totals.LEVEL_UP_PLAYER_70 || 0
      // Expected: ~3000 over 10000 days
      expect(count).toBeGreaterThan(SIMULATION_DAYS * 0.15)
      expect(count).toBeLessThan(SIMULATION_DAYS * 0.5)
    })

    it('should never give LEVEL_UP_PLAYER_100 cards', () => {
      const totals = simulateManyDays(2, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_100 || 0).toBe(0)
    })
  })

  describe('level 3 - professional training area', () => {
    it('should give LEVEL_UP_PLAYER_40 cards', () => {
      const totals = simulateManyDays(3, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_40 || 0).toBeGreaterThan(SIMULATION_DAYS * 0.8)
    })

    it('should give LEVEL_UP_PLAYER_70 cards', () => {
      const totals = simulateManyDays(3, SIMULATION_DAYS)
      expect(totals.LEVEL_UP_PLAYER_70 || 0).toBeGreaterThan(SIMULATION_DAYS * 0.15)
    })

    it('should give LEVEL_UP_PLAYER_100 cards (chance 0.06/day)', () => {
      const totals = simulateManyDays(3, SIMULATION_DAYS)
      const count = totals.LEVEL_UP_PLAYER_100 || 0
      // Expected: ~600 over 10000 days
      expect(count).toBeGreaterThan(SIMULATION_DAYS * 0.02)
      expect(count).toBeLessThan(SIMULATION_DAYS * 0.15)
    })
  })

  describe('comparison across levels', () => {
    it('level 0 should get far fewer LEVEL_UP_PLAYER_40 than level 1', () => {
      const totals0 = simulateManyDays(0, SIMULATION_DAYS)
      const totals1 = simulateManyDays(1, SIMULATION_DAYS)

      const count0 = totals0.LEVEL_UP_PLAYER_40 || 0
      const count1 = totals1.LEVEL_UP_PLAYER_40 || 0

      // Level 1 has 1.2/day vs level 0 has 0.2/day = 6x more
      expect(count1).toBeGreaterThan(count0 * 3)
    })

    it('only level 2+ should receive silver cards', () => {
      const totals0 = simulateManyDays(0, SIMULATION_DAYS)
      const totals1 = simulateManyDays(1, SIMULATION_DAYS)
      const totals2 = simulateManyDays(2, SIMULATION_DAYS)

      expect(totals0.LEVEL_UP_PLAYER_70 || 0).toBe(0)
      expect(totals1.LEVEL_UP_PLAYER_70 || 0).toBe(0)
      expect(totals2.LEVEL_UP_PLAYER_70 || 0).toBeGreaterThan(0)
    })

    it('only level 3 should receive gold cards', () => {
      const totals0 = simulateManyDays(0, SIMULATION_DAYS)
      const totals1 = simulateManyDays(1, SIMULATION_DAYS)
      const totals2 = simulateManyDays(2, SIMULATION_DAYS)
      const totals3 = simulateManyDays(3, SIMULATION_DAYS)

      expect(totals0.LEVEL_UP_PLAYER_100 || 0).toBe(0)
      expect(totals1.LEVEL_UP_PLAYER_100 || 0).toBe(0)
      expect(totals2.LEVEL_UP_PLAYER_100 || 0).toBe(0)
      expect(totals3.LEVEL_UP_PLAYER_100 || 0).toBeGreaterThan(0)
    })

    it('non-LEVEL_UP cards should be unaffected by training level', () => {
      const totals0 = simulateManyDays(0, SIMULATION_DAYS)
      const totals3 = simulateManyDays(3, SIMULATION_DAYS)

      // FRESHNESS_10 should be roughly equal for both levels (0.88/day)
      const fresh0 = totals0.FRESHNESS_10 || 0
      const fresh3 = totals3.FRESHNESS_10 || 0

      // Allow 20% tolerance
      expect(fresh0).toBeGreaterThan(fresh3 * 0.8)
      expect(fresh0).toBeLessThan(fresh3 * 1.2)
    })
  })
})
