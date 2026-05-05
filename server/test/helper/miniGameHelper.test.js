import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import {
  rollMiniGameReward,
  validateMiniGameSubmission,
  hasReceivedMiniGameRewardToday,
  MINI_GAME_REWARD_POOL,
  MINI_GAME_LIMITS
} from '../../helper/miniGameHelper.js'

describe('miniGameHelper.rollMiniGameReward', () => {
  it('returns null with 0 goals (no chance)', () => {
    expect(rollMiniGameReward(0)).toBeNull()
  })

  it('returns null for negative or non-finite goals', () => {
    expect(rollMiniGameReward(-1)).toBeNull()
    expect(rollMiniGameReward(NaN)).toBeNull()
  })

  it('returns null when random above threshold', () => {
    // chance for 1 goal is 0.1 — random 0.5 is above the threshold
    const random = vi.fn().mockReturnValue(0.5)
    expect(rollMiniGameReward(1, random)).toBeNull()
  })

  it('returns a card from the pool when random below threshold', () => {
    // 0.05 is < chance (0.1) → wins; second call picks the pool index
    const calls = [0.05, 0]
    const random = vi.fn(() => calls.shift())
    const result = rollMiniGameReward(1, random)
    expect(MINI_GAME_REWARD_POOL).toContain(result)
    expect(result).toBe(MINI_GAME_REWARD_POOL[0])
  })

  it('caps the chance at 100% for 10+ goals', () => {
    // chance is min(goals*0.1, 1) → 100% at 10 goals.
    const random = vi.fn().mockReturnValueOnce(0.9999).mockReturnValueOnce(0)
    expect(rollMiniGameReward(10, random)).not.toBeNull()
    const random2 = vi.fn().mockReturnValueOnce(0.9999).mockReturnValueOnce(0)
    expect(rollMiniGameReward(20, random2)).not.toBeNull()
  })

  it('over many trials, win-rate matches goals*10%', () => {
    // Sanity check distribution at 5 goals → ~50% win rate.
    let wins = 0
    const N = 5000
    for (let i = 0; i < N; i++) {
      if (rollMiniGameReward(5) !== null) wins++
    }
    const rate = wins / N
    expect(rate).toBeGreaterThan(0.4)
    expect(rate).toBeLessThan(0.6)
  })

  it('selects evenly across the reward pool', () => {
    const counts = Object.fromEntries(MINI_GAME_REWARD_POOL.map(a => [a, 0]))
    const N = 6000
    let wins = 0
    for (let i = 0; i < N; i++) {
      const r = rollMiniGameReward(10) // always wins
      if (r) {
        wins++
        counts[r]++
      }
    }
    expect(wins).toBe(N)
    const expected = N / MINI_GAME_REWARD_POOL.length
    for (const action of MINI_GAME_REWARD_POOL) {
      expect(counts[action]).toBeGreaterThan(expected * 0.7)
      expect(counts[action]).toBeLessThan(expected * 1.3)
    }
  })
})

describe('miniGameHelper.validateMiniGameSubmission', () => {
  it('accepts a plausible submission', () => {
    const result = validateMiniGameSubmission(
      Math.ceil(60 * MINI_GAME_LIMITS.POINTS_PER_SECOND + 2 * MINI_GAME_LIMITS.GOAL_POINTS),
      2,
      60 * 1000
    )
    expect(result.valid).toBe(true)
  })

  it('rejects negative score', () => {
    expect(validateMiniGameSubmission(-1, 0, 1000)).toEqual({ valid: false, reason: 'invalid_score' })
  })

  it('rejects negative goals', () => {
    expect(validateMiniGameSubmission(0, -1, 1000)).toEqual({ valid: false, reason: 'invalid_goals' })
  })

  it('rejects negative duration', () => {
    expect(validateMiniGameSubmission(0, 0, -1)).toEqual({ valid: false, reason: 'invalid_duration' })
  })

  it('rejects non-integer values', () => {
    expect(validateMiniGameSubmission(1.5, 0, 1000)).toEqual({ valid: false, reason: 'invalid_score' })
  })

  it('rejects implausibly high score for given duration', () => {
    // 10 seconds → max ~150 points, anything well above is rejected.
    expect(validateMiniGameSubmission(50000, 0, 10000)).toEqual({ valid: false, reason: 'score_too_high' })
  })

  it('rejects too many goals for given duration', () => {
    // duration 1s → max ~1 goal allowed
    expect(validateMiniGameSubmission(0, 5, 1000)).toEqual({ valid: false, reason: 'too_many_goals' })
  })

  it('rejects unrealistically long durations', () => {
    expect(validateMiniGameSubmission(0, 0, MINI_GAME_LIMITS.MAX_DURATION_MS + 1))
      .toEqual({ valid: false, reason: 'duration_too_long' })
  })
})

describe('miniGameHelper.hasReceivedMiniGameRewardToday', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when at least one rewarded score exists today', async () => {
    query.mockResolvedValueOnce([{ amount: 1 }])
    expect(await hasReceivedMiniGameRewardToday(42)).toBe(true)
  })

  it('returns false when no rewarded score exists today', async () => {
    query.mockResolvedValueOnce([{ amount: 0 }])
    expect(await hasReceivedMiniGameRewardToday(42)).toBe(false)
  })

  it('returns false when query returns empty result', async () => {
    query.mockResolvedValueOnce([])
    expect(await hasReceivedMiniGameRewardToday(42)).toBe(false)
  })
})
