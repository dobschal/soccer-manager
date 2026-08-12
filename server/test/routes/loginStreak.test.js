import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

const MILESTONES = [
  { day: 3, key: 'recovery', actions: [{ action: 'FRESHNESS_5', weight: 50 }, { action: 'FRESHNESS_20', weight: 50 }] },
  { day: 7, key: 'training', actions: [{ action: 'LEVEL_UP_PLAYER_40', weight: 100 }] },
  { day: 15, key: 'special', actions: [{ action: 'SPY', weight: 90 }, { action: 'STAR_PLAYER', weight: 10 }] },
  { day: 23, key: 'training', actions: [{ action: 'LEVEL_UP_PLAYER_70', weight: 100 }] },
  { day: 30, key: 'jackpot', actions: [{ action: 'MILLION_BONUS', weight: 70 }, { action: 'STAR_PLAYER', weight: 30 }] }
]

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))
vi.mock('../../helper/loginStreakHelper.js', () => ({
  registerDailyLogin: vi.fn(),
  claimLoginStreakRewards: vi.fn(),
  getStreakState: vi.fn(),
  getStreakLeaderboard: vi.fn(),
  openRewards: vi.fn(() => []),
  REWARD_CYCLE_LENGTH: 30,
  LOGIN_STREAK_REWARDS: [
    { day: 3, key: 'recovery', actions: [{ action: 'FRESHNESS_5', weight: 50 }, { action: 'FRESHNESS_20', weight: 50 }] },
    { day: 7, key: 'training', actions: [{ action: 'LEVEL_UP_PLAYER_40', weight: 100 }] },
    { day: 15, key: 'special', actions: [{ action: 'SPY', weight: 90 }, { action: 'STAR_PLAYER', weight: 10 }] },
    { day: 23, key: 'training', actions: [{ action: 'LEVEL_UP_PLAYER_70', weight: 100 }] },
    { day: 30, key: 'jackpot', actions: [{ action: 'MILLION_BONUS', weight: 70 }, { action: 'STAR_PLAYER', weight: 30 }] }
  ]
}))

import { getTeam } from '../../helper/teamHelper.js'
import {
  claimLoginStreakRewards,
  getStreakLeaderboard,
  getStreakState,
  openRewards,
  registerDailyLogin
} from '../../helper/loginStreakHelper.js'
import handlers from '../../routes/loginStreak.js'

beforeEach(() => {
  vi.clearAllMocks()
  getTeam.mockResolvedValue({ id: 42 })
  openRewards.mockImplementation((cycleDay, claimed) =>
    MILESTONES.filter(r => r.day <= cycleDay && !claimed.includes(r.day))
  )
})

describe('getDailyLoginStatus', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(handlers.getDailyLoginStatus({ user: null })).rejects.toThrow('Not authorized')
  })

  it('registers the login and returns the cycle', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 12, cycleDay: 12, claimed: [3, 7] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(registerDailyLogin).toHaveBeenCalledWith(5)
    expect(result).toMatchObject({
      streak: 12,
      cycleDay: 12,
      cycleLength: 30,
      claimed: [3, 7],
      nextMilestone: 15
    })
    expect(result.milestones.map(m => m.day)).toEqual([3, 7, 15, 23, 30])
  })

  it('reports no next milestone once the cycle is complete', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 30, cycleDay: 30, claimed: [3, 7, 15, 23, 30] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(result.nextMilestone).toBe(null)
  })

  it('does not hand out a card just for opening the app', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 3, cycleDay: 3, claimed: [] })

    await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(claimLoginStreakRewards).not.toHaveBeenCalled()
  })

  it('reports the milestones still waiting to be collected', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 16, cycleDay: 16, claimed: [3] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(result.availableRewards).toEqual([
      { day: 7, key: 'training' },
      { day: 15, key: 'special' }
    ])
  })

  it('reports no gift when everything reached is collected', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 12, cycleDay: 12, claimed: [3, 7] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    expect(result.availableRewards).toEqual([])
  })

  it('#501 exposes each milestone card pool as percentage chances', async () => {
    registerDailyLogin.mockResolvedValue({ streak: 1, cycleDay: 1, claimed: [] })

    const result = await handlers.getDailyLoginStatus(createMockRequest({ user: { id: 5 } }))

    const jackpot = result.milestones.find(m => m.day === 30)
    expect(jackpot.key).toBe('jackpot')
    expect(jackpot.actions).toEqual([
      { action: 'MILLION_BONUS', chance: 70 },
      { action: 'STAR_PLAYER', chance: 30 }
    ])
    const special = result.milestones.find(m => m.day === 15)
    expect(special.actions).toEqual([
      { action: 'SPY', chance: 90 },
      { action: 'STAR_PLAYER', chance: 10 }
    ])
  })
})

describe('claimDailyLoginReward (#501)', () => {
  it('rejects unauthenticated callers', async () => {
    await expect(handlers.claimDailyLoginReward({ user: null })).rejects.toThrow('Not authorized')
  })

  it('grants the open rewards to the caller\'s team and returns the cards', async () => {
    claimLoginStreakRewards.mockResolvedValue({
      cards: [{ id: 7, action: 'FRESHNESS_10', day: 3, key: 'recovery' }],
      claimed: [3],
      limitReached: false
    })
    getStreakState.mockResolvedValue({ streak: 3, cycleDay: 3, claimed: [3] })

    const result = await handlers.claimDailyLoginReward(createMockRequest({ user: { id: 5 } }))

    expect(claimLoginStreakRewards).toHaveBeenCalledWith(5, 42)
    expect(result.cards[0].action).toBe('FRESHNESS_10')
    expect(result.availableRewards).toEqual([])
  })

  it('keeps the gift alive when the card limit blocked the reward', async () => {
    claimLoginStreakRewards.mockResolvedValue({ cards: [], claimed: [], limitReached: true })
    getStreakState.mockResolvedValue({ streak: 3, cycleDay: 3, claimed: [] })

    const result = await handlers.claimDailyLoginReward(createMockRequest({ user: { id: 5 } }))

    expect(result.limitReached).toBe(true)
    expect(result.availableRewards).toEqual([{ day: 3, key: 'recovery' }])
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
    expect(result.milestones.map(m => m.day)).toEqual([3, 7, 15, 23, 30])
  })

  it('does not register a login — the board is read-only', async () => {
    getStreakLeaderboard.mockResolvedValue({ top: [], me: null, total: 0 })
    getStreakState.mockResolvedValue({ streak: 0, cycleDay: 0, claimed: [] })

    await handlers.getLoginStreakLeaderboard(100, createMockRequest({ user: { id: 5 } }))

    expect(registerDailyLogin).not.toHaveBeenCalled()
  })
})
