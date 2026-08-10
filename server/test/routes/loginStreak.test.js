import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../../helper/loginStreakHelper.js', () => ({
  registerDailyLogin: vi.fn(),
  getStreakState: vi.fn(),
  getStreakLeaderboard: vi.fn(),
  REWARD_CYCLE_LENGTH: 30,
  LOGIN_STREAK_REWARDS: [
    { day: 3, key: 'recovery', actions: [] },
    { day: 7, key: 'training', actions: [] },
    { day: 15, key: 'special', actions: [] },
    { day: 30, key: 'youth', actions: [] }
  ]
}))

import { query } from '../../lib/database.js'
import {
  getStreakLeaderboard,
  getStreakState,
  registerDailyLogin
} from '../../helper/loginStreakHelper.js'
import handlers from '../../routes/loginStreak.js'

beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue([{ id: 42 }])
})

describe('getDailyLoginStatus', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(handlers.getDailyLoginStatus({ user: null })).rejects.toThrow('Not authorized')
  })

  it('registers the login against the caller\'s team and returns the cycle', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 12, cycleDay: 12, claimed: [3, 7], newRewards: [] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(registerDailyLogin).toHaveBeenCalledWith(5, 42)
    expect(result).toMatchObject({
      streak: 12,
      cycleDay: 12,
      cycleLength: 30,
      claimed: [3, 7],
      nextMilestone: 15
    })
    expect(result.milestones.map(m => m.day)).toEqual([3, 7, 15, 30])
  })

  it('reports no next milestone once the cycle is complete', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 30, cycleDay: 30, claimed: [3, 7, 15, 30], newRewards: [] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(result.nextMilestone).toBe(null)
  })

  it('passes a null team through for a user without a club', async () => {
    query.mockResolvedValue([])
    registerDailyLogin.mockResolvedValue({ streak: 1, cycleDay: 1, claimed: [], newRewards: [] })

    await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(registerDailyLogin).toHaveBeenCalledWith(5, null)
  })

  it('forwards freshly unlocked rewards to the client', async () => {
    registerDailyLogin.mockResolvedValue({
      streak: 3,
      cycleDay: 3,
      claimed: [3],
      newRewards: [{ day: 3, key: 'recovery', action: 'FRESHNESS_10' }]
    })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(result.newRewards).toHaveLength(1)
    expect(result.newRewards[0].action).toBe('FRESHNESS_10')
  })
})

describe('getLoginStreakLeaderboard', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(handlers.getLoginStreakLeaderboard(10, { user: null })).rejects.toThrow('Not authorized')
  })

  it('returns the board together with the caller\'s own progress', async () => {
    getStreakLeaderboard.mockResolvedValue({
      top: [{ userId: 2, username: 'Ana', streak: 40, rank: 1, isMe: false }],
      me: { rank: 4, streak: 12 },
      total: 20
    })
    getStreakState.mockResolvedValue({ streak: 12, cycleDay: 12, claimed: [3, 7] })

    const result = await handlers.getLoginStreakLeaderboard(10, createMockRequest({ user: { id: 5 } }))

    expect(getStreakLeaderboard).toHaveBeenCalledWith(5, 10)
    expect(result.top).toHaveLength(1)
    expect(result.me).toEqual({ rank: 4, streak: 12 })
    expect(result.streak).toBe(12)
    expect(result.cycleLength).toBe(30)
    expect(result.milestones.map(m => m.day)).toEqual([3, 7, 15, 30])
  })

  it('does not register a login — the board is read-only', async () => {
    getStreakLeaderboard.mockResolvedValue({ top: [], me: null, total: 0 })
    getStreakState.mockResolvedValue({ streak: 0, cycleDay: 0, claimed: [] })

    await handlers.getLoginStreakLeaderboard(100, createMockRequest({ user: { id: 5 } }))

    expect(registerDailyLogin).not.toHaveBeenCalled()
  })
})
