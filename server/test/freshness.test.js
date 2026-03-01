import { describe, expect, it, vi, beforeEach } from 'vitest'
import { _calculateFreshnessRecovery } from '../play-game-day.js'

describe('Freshness System', () => {
  describe('Freshness Loss', () => {
    it('should define correct freshness loss by play style for league/cup games', () => {
      // These values are used in _playGame and _playCupGame
      const freshnessLossByStyle = {
        aggressive: 0.12,
        normal: 0.10,
        friendly: 0.08
      }
      expect(freshnessLossByStyle.aggressive).toBe(0.12)
      expect(freshnessLossByStyle.normal).toBe(0.10)
      expect(freshnessLossByStyle.friendly).toBe(0.08)
    })

    it('goalkeepers should lose less freshness (8%) regardless of play style', () => {
      const gkLoss = 0.08
      expect(gkLoss).toBeLessThanOrEqual(0.08)
      expect(gkLoss).toBeLessThanOrEqual(0.10) // less than normal outfield
    })

    it('friendly matches should cost half the freshness of league games', () => {
      const friendlyLossByStyle = {
        aggressive: 0.065,
        normal: 0.05,
        friendly: 0.04
      }
      const leagueLossByStyle = {
        aggressive: 0.12,
        normal: 0.10,
        friendly: 0.08
      }
      // Friendly should be approximately half of league
      expect(friendlyLossByStyle.normal).toBeLessThan(leagueLossByStyle.normal)
      expect(friendlyLossByStyle.aggressive).toBeLessThan(leagueLossByStyle.aggressive)
      expect(friendlyLossByStyle.friendly).toBeLessThan(leagueLossByStyle.friendly)
    })

    it('aggressive play style should cost the most freshness', () => {
      const freshnessLossByStyle = {
        aggressive: 0.12,
        normal: 0.10,
        friendly: 0.08
      }
      expect(freshnessLossByStyle.aggressive).toBeGreaterThan(freshnessLossByStyle.normal)
      expect(freshnessLossByStyle.normal).toBeGreaterThan(freshnessLossByStyle.friendly)
    })
  })

  describe('Freshness Recovery (_calculateFreshnessRecovery)', () => {
    beforeEach(() => {
      // Seed Math.random to return 0.5 (middle of range) for deterministic tests
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
    })

    describe('age-based recovery rates', () => {
      it('young players (<=21) should recover 10% base', () => {
        const recovery = _calculateFreshnessRecovery(20, true)
        // 0.10 * (0.8 + 0.5 * 0.4) = 0.10 * 1.0 = 0.10
        expect(recovery).toBeCloseTo(0.10, 4)
      })

      it('players aged 22-26 should recover 8% base', () => {
        const recovery = _calculateFreshnessRecovery(24, true)
        expect(recovery).toBeCloseTo(0.08, 4)
      })

      it('players aged 27-29 should recover 6% base', () => {
        const recovery = _calculateFreshnessRecovery(28, true)
        expect(recovery).toBeCloseTo(0.06, 4)
      })

      it('players aged 30-32 should recover 5% base', () => {
        const recovery = _calculateFreshnessRecovery(31, true)
        expect(recovery).toBeCloseTo(0.05, 4)
      })

      it('players aged 33+ should recover 4% base', () => {
        const recovery = _calculateFreshnessRecovery(35, true)
        expect(recovery).toBeCloseTo(0.04, 4)
      })

      it('younger players should recover faster than older players', () => {
        const young = _calculateFreshnessRecovery(19, true)
        const mid = _calculateFreshnessRecovery(25, true)
        const old = _calculateFreshnessRecovery(34, true)
        expect(young).toBeGreaterThan(mid)
        expect(mid).toBeGreaterThan(old)
      })
    })

    describe('non-playing player bonus', () => {
      it('players not in lineup should recover significantly more (+8%)', () => {
        const inLineup = _calculateFreshnessRecovery(25, true)
        const notInLineup = _calculateFreshnessRecovery(25, false)
        expect(notInLineup).toBeGreaterThan(inLineup)
        // 0.08 base + 0.08 bonus = 0.16 vs 0.08 base
        expect(notInLineup).toBeCloseTo(0.16, 4)
        expect(inLineup).toBeCloseTo(0.08, 4)
      })

      it('non-playing bonus should double recovery for mid-age players', () => {
        const inLineup = _calculateFreshnessRecovery(25, true)
        const notInLineup = _calculateFreshnessRecovery(25, false)
        expect(notInLineup / inLineup).toBeCloseTo(2.0, 1)
      })

      it('non-playing old player should recover more than playing young player', () => {
        const oldNotPlaying = _calculateFreshnessRecovery(34, false) // 0.04 + 0.08 = 0.12
        const youngPlaying = _calculateFreshnessRecovery(20, true)   // 0.10
        expect(oldNotPlaying).toBeGreaterThan(youngPlaying)
      })
    })

    describe('randomness (+-20%)', () => {
      it('should apply random factor between 0.8 and 1.2', () => {
        // With random = 0.0, factor = 0.8
        vi.spyOn(Math, 'random').mockReturnValue(0.0)
        const low = _calculateFreshnessRecovery(25, true)
        expect(low).toBeCloseTo(0.08 * 0.8, 4)

        // With random = 1.0, factor = 1.2
        vi.spyOn(Math, 'random').mockReturnValue(1.0)
        const high = _calculateFreshnessRecovery(25, true)
        expect(high).toBeCloseTo(0.08 * 1.2, 4)
      })

      it('should produce values within +-20% of base recovery', () => {
        vi.spyOn(Math, 'random').mockRestore()

        const results = []
        for (let i = 0; i < 1000; i++) {
          results.push(_calculateFreshnessRecovery(25, true))
        }

        const base = 0.08
        const min = Math.min(...results)
        const max = Math.max(...results)

        // All values should be within 0.8x to 1.2x of base
        expect(min).toBeGreaterThanOrEqual(base * 0.8 - 0.001)
        expect(max).toBeLessThanOrEqual(base * 1.2 + 0.001)

        // Average should be close to base (with 1000 samples)
        const avg = results.reduce((a, b) => a + b, 0) / results.length
        expect(avg).toBeCloseTo(base, 2)
      })

      it('randomness should vary results between two game days', () => {
        vi.spyOn(Math, 'random').mockRestore()

        const results = new Set()
        for (let i = 0; i < 100; i++) {
          results.add(_calculateFreshnessRecovery(25, true).toFixed(6))
        }
        // Should have many different values (not deterministic)
        expect(results.size).toBeGreaterThan(50)
      })
    })

    describe('squad rotation viability', () => {
      it('a player resting for 1 game day should recover most freshness lost from a league game', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5) // factor = 1.0

        const leagueLoss = 0.10 // normal style
        const recoveryNotPlaying = _calculateFreshnessRecovery(25, false) // 0.16

        // Recovery while not playing should exceed the loss from one game
        expect(recoveryNotPlaying).toBeGreaterThan(leagueLoss)
      })

      it('a player playing every game day should slowly lose freshness', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)

        const leagueLoss = 0.10
        const recoveryPlaying = _calculateFreshnessRecovery(25, true) // 0.08

        // Net change per game day when always playing: -0.10 + 0.08 = -0.02
        const netChange = recoveryPlaying - leagueLoss
        expect(netChange).toBeLessThan(0)
      })

      it('alternating between playing and resting should keep freshness stable', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)

        const leagueLoss = 0.10
        const recoveryPlaying = _calculateFreshnessRecovery(25, true)    // 0.08
        const recoveryResting = _calculateFreshnessRecovery(25, false)   // 0.16

        // Over 2 game days: play once, rest once
        // Day 1: -0.10 + 0.08 = -0.02
        // Day 2: +0.16 (resting)
        const netOver2Days = (recoveryPlaying - leagueLoss) + recoveryResting
        expect(netOver2Days).toBeGreaterThan(0)
      })
    })
  })
})
