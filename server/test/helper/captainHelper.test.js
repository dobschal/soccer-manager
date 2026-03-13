import { describe, it, expect } from 'vitest'
import { getCaptainStrengthMultiplier } from '../../helper/captainHelper.js'

function createPlayer (overrides = {}) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? 'Test Player',
    level: overrides.level ?? 50,
    carrier_start_season: overrides.carrier_start_season ?? 0,
    ...overrides
  }
}

describe('getCaptainStrengthMultiplier', () => {
  describe('no captain selected', () => {
    it('returns 0.90 when team has no captain_id', () => {
      const team = { id: 1, captain_id: null }
      const players = [createPlayer()]
      expect(getCaptainStrengthMultiplier(team, players, 5)).toBe(0.90)
    })

    it('returns 0.90 when team is null', () => {
      expect(getCaptainStrengthMultiplier(null, [], 5)).toBe(0.90)
    })

    it('returns 0.90 when lineup is empty', () => {
      const team = { id: 1, captain_id: 1 }
      expect(getCaptainStrengthMultiplier(team, [], 5)).toBe(0.90)
    })

    it('returns 0.90 when captain is not in lineup', () => {
      const team = { id: 1, captain_id: 99 }
      const players = [createPlayer({ id: 1 }), createPlayer({ id: 2 })]
      expect(getCaptainStrengthMultiplier(team, players, 5)).toBe(0.90)
    })
  })

  describe('captain age modifier', () => {
    it('applies -5% when captain is younger than 24', () => {
      // age = 16 + (currentSeason - carrier_start_season) = 16 + (5 - 0) = 21
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 50, carrier_start_season: 0 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 0 })
      ]
      // Captain is 21, younger than 24 -> -5%
      // Captain level 50 = same as max level -> +5%
      // Captain level 50 = same as min level -> -10%
      // Captain age 21 = same as max age -> +5%
      // Total: -5% + 5% - 10% + 5% = -5%
      expect(getCaptainStrengthMultiplier(team, players, 5)).toBeCloseTo(0.95)
    })

    it('no age penalty when captain is 24 or older', () => {
      // age = 16 + (10 - 2) = 24
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 50, carrier_start_season: 2 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 2 })
      ]
      // Captain is 24, NOT younger than 24 -> no penalty
      // Captain level 50 = max -> +5%
      // Captain level 50 = min -> -10%
      // Captain age 24 = max age -> +5%
      // Total: +5% - 10% + 5% = 0%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.00)
    })
  })

  describe('weakest player modifier', () => {
    it('applies -10% when captain is the weakest player', () => {
      const team = { id: 1, captain_id: 1 }
      // Captain (id=1) has level 20, others have level 50+
      // age = 16 + (10 - 0) = 26 -> no age penalty
      const players = [
        createPlayer({ id: 1, level: 20, carrier_start_season: 0 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 0 }),
        createPlayer({ id: 3, level: 60, carrier_start_season: 0 })
      ]
      // Captain is weakest -> -10%
      // Captain age 26 = max age -> +5%
      // Total: -10% + 5% = -5%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(0.95)
    })
  })

  describe('oldest player modifier', () => {
    it('applies +5% when captain is the oldest player', () => {
      const team = { id: 1, captain_id: 1 }
      // Player 1 (captain): carrier_start_season=0, age=26 at season 10
      // Player 2: carrier_start_season=5, age=21 at season 10
      const players = [
        createPlayer({ id: 1, level: 60, carrier_start_season: 0 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 5 })
      ]
      // Captain is oldest -> +5%
      // Captain is best -> +5%
      // Total: +5% + 5% = +10%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.10)
    })
  })

  describe('best player modifier', () => {
    it('applies +5% when captain is the best (highest level) player', () => {
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 80, carrier_start_season: 0 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 0 }),
        createPlayer({ id: 3, level: 60, carrier_start_season: 0 })
      ]
      // Captain age = 16 + (10 - 0) = 26 -> no age penalty
      // Captain is best -> +5%
      // Captain is oldest (all same) -> +5%
      // Total: +5% + 5% = +10%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.10)
    })
  })

  describe('stacked modifiers', () => {
    it('applies multiple positive modifiers', () => {
      const team = { id: 1, captain_id: 1 }
      // Captain is oldest AND best
      const players = [
        createPlayer({ id: 1, level: 90, carrier_start_season: 0 }), // age 26, best, oldest
        createPlayer({ id: 2, level: 40, carrier_start_season: 5 }) // age 21
      ]
      // oldest: +5%, best: +5% = +10%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.10)
    })

    it('applies multiple negative modifiers', () => {
      const team = { id: 1, captain_id: 1 }
      // Captain is young AND weakest
      const players = [
        createPlayer({ id: 1, level: 20, carrier_start_season: 5 }), // age 16, weakest, youngest
        createPlayer({ id: 2, level: 80, carrier_start_season: 0 }) // age 21, best, oldest
      ]
      // young (<24): -5%, weakest: -10% = -15%
      expect(getCaptainStrengthMultiplier(team, players, 5)).toBeCloseTo(0.85)
    })

    it('ideal captain: oldest and best, not young', () => {
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 100, carrier_start_season: 0 }), // age 30, best, oldest
        createPlayer({ id: 2, level: 50, carrier_start_season: 8 }), // age 22
        createPlayer({ id: 3, level: 60, carrier_start_season: 6 }) // age 24
      ]
      // oldest: +5%, best: +5% = +10%
      expect(getCaptainStrengthMultiplier(team, players, 14)).toBeCloseTo(1.10)
    })

    it('worst captain: young and weakest', () => {
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 10, carrier_start_season: 5 }), // age 16
        createPlayer({ id: 2, level: 80, carrier_start_season: 0 }), // age 21
        createPlayer({ id: 3, level: 90, carrier_start_season: 0 }) // age 21
      ]
      // young: -5%, weakest: -10% = -15%
      expect(getCaptainStrengthMultiplier(team, players, 5)).toBeCloseTo(0.85)
    })
  })

  describe('edge cases', () => {
    it('all players same level - captain is both best and weakest', () => {
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 50, carrier_start_season: 0 }),
        createPlayer({ id: 2, level: 50, carrier_start_season: 0 })
      ]
      // age 26 -> no young penalty
      // best: +5%, weakest: -10%, oldest: +5% = 0%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.00)
    })

    it('single player lineup', () => {
      const team = { id: 1, captain_id: 1 }
      const players = [
        createPlayer({ id: 1, level: 50, carrier_start_season: 0 })
      ]
      // age 26 -> no young penalty
      // best: +5%, weakest: -10%, oldest: +5% = 0%
      expect(getCaptainStrengthMultiplier(team, players, 10)).toBeCloseTo(1.00)
    })
  })
})
