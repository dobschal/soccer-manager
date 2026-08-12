import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import {
  rollMiniGameReward,
  validateMiniGameSubmission,
  hasReceivedMiniGameRewardThisGameDay,
  MINI_GAME_REWARD_POOL,
  MINI_GAME_LIMITS
} from '../../helper/miniGameHelper.js'
import { actionCardChances } from '../../helper/actionCardHelper.js'

describe('miniGameHelper.rollMiniGameReward', () => {
  it('returns null with 0 goals (no chance)', () => {
    expect(rollMiniGameReward(0)).toBeNull()
  })

  it('returns null for negative or non-finite goals', () => {
    expect(rollMiniGameReward(-1)).toBeNull()
    expect(rollMiniGameReward(NaN)).toBeNull()
  })

  it('returns null when random above threshold', () => {
    // chance for 1 goal is ~0.33 — random 0.5 is above the threshold
    const random = vi.fn().mockReturnValue(0.5)
    expect(rollMiniGameReward(1, random)).toBeNull()
  })

  it('returns a card from the pool when random below threshold', () => {
    // 0.05 is < chance (~0.33) → wins; second call picks the pool index
    const calls = [0.05, 0]
    const random = vi.fn(() => calls.shift())
    const result = rollMiniGameReward(1, random)
    expect(MINI_GAME_REWARD_POOL).toContain(result)
    expect(result).toBe(MINI_GAME_REWARD_POOL[0])
  })

  it('guarantees a card at 3+ goals', () => {
    // chance is min(goals/3, 1) → 100% at 3 goals.
    const random = vi.fn().mockReturnValueOnce(0.9999).mockReturnValueOnce(0)
    expect(rollMiniGameReward(3, random)).not.toBeNull()
    const random2 = vi.fn().mockReturnValueOnce(0.9999).mockReturnValueOnce(0)
    expect(rollMiniGameReward(10, random2)).not.toBeNull()
  })

  it('over many trials, win-rate matches goals*33%', () => {
    // Sanity check distribution at 1 goal → ~33% win rate.
    let wins = 0
    const N = 5000
    for (let i = 0; i < N; i++) {
      if (rollMiniGameReward(1) !== null) wins++
    }
    const rate = wins / N
    expect(rate).toBeGreaterThan(0.27)
    expect(rate).toBeLessThan(0.4)
  })

  it('exposes every non-zero action card chance as a reward', () => {
    const expectedActions = Object.entries(actionCardChances)
      .filter(([, chance]) => chance > 0)
      .map(([action]) => action)
    expect(new Set(MINI_GAME_REWARD_POOL)).toEqual(new Set(expectedActions))
    // Zero-chance cards must stay out of the pool.
    for (const [action, chance] of Object.entries(actionCardChances)) {
      if (chance === 0) expect(MINI_GAME_REWARD_POOL).not.toContain(action)
    }
  })

  it('weights cards by their normal per-game-day chances', () => {
    const counts = Object.fromEntries(MINI_GAME_REWARD_POOL.map(a => [a, 0]))
    const N = 50000
    let wins = 0
    for (let i = 0; i < N; i++) {
      const r = rollMiniGameReward(10) // always wins
      if (r) {
        wins++
        counts[r]++
      }
    }
    expect(wins).toBe(N)
    const totalWeight = MINI_GAME_REWARD_POOL.reduce((s, a) => s + actionCardChances[a], 0)
    for (const action of MINI_GAME_REWARD_POOL) {
      const expectedRate = actionCardChances[action] / totalWeight
      const observedRate = counts[action] / N
      // A flat ±30% is far too tight for the rare cards: MILLION_BONUS is drawn
      // ~110 times in 50k rolls, where 30% is barely 3 standard deviations and
      // the run goes red every few hundred CI builds for no reason. The band is
      // therefore five binomial sigmas wide, with the 30% kept as a floor so a
      // real weighting bug in a common card is still caught.
      const sigma = Math.sqrt((1 - expectedRate) / (expectedRate * N))
      const tolerance = Math.max(0.3, 5 * sigma)
      expect(observedRate).toBeGreaterThan(expectedRate * (1 - tolerance))
      expect(observedRate).toBeLessThan(expectedRate * (1 + tolerance))
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

  it('accepts high goal counts without a per-duration cap', () => {
    // Even an unrealistic-looking goal count is accepted as long as the
    // resulting score is plausible — there is no hard goals/seconds limit.
    const goals = 20
    const durationMs = 200 * 1000
    const score = Math.ceil(200 * MINI_GAME_LIMITS.POINTS_PER_SECOND + goals * MINI_GAME_LIMITS.GOAL_POINTS)
    expect(validateMiniGameSubmission(score, goals, durationMs)).toEqual({ valid: true })
  })

  it('rejects unrealistically long durations', () => {
    expect(validateMiniGameSubmission(0, 0, MINI_GAME_LIMITS.MAX_DURATION_MS + 1))
      .toEqual({ valid: false, reason: 'duration_too_long' })
  })
})

describe('miniGameHelper.hasReceivedMiniGameRewardThisGameDay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when at least one rewarded score exists for the given game day and season', async () => {
    query.mockResolvedValueOnce([{ amount: 1 }])
    expect(await hasReceivedMiniGameRewardThisGameDay(42, 5, 2)).toBe(true)
  })

  it('returns false when no rewarded score exists for the given game day and season', async () => {
    query.mockResolvedValueOnce([{ amount: 0 }])
    expect(await hasReceivedMiniGameRewardThisGameDay(42, 5, 2)).toBe(false)
  })

  it('returns false when query returns empty result', async () => {
    query.mockResolvedValueOnce([])
    expect(await hasReceivedMiniGameRewardThisGameDay(42, 5, 2)).toBe(false)
  })

  it('passes teamId, gameDay and season to the query', async () => {
    query.mockResolvedValueOnce([{ amount: 0 }])
    await hasReceivedMiniGameRewardThisGameDay(42, 7, 3)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('game_day=? AND season=?'),
      [42, 7, 3]
    )
  })
})
