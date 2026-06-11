import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 1, season: 5 })
}))

import { query } from '../../lib/database.js'
import {
  awardWorldCupRewards,
  getUserPoints,
  isValidPrediction,
  outcomeFor,
  POINTS_PER_REWARD,
  rollWorldCupReward,
  WORLD_CUP_REWARD_POOL
} from '../../helper/worldCupHelper.js'

describe('worldCupHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('outcomeFor', () => {
    it('returns team_1 when team 1 scored more', () => {
      expect(outcomeFor(2, 1)).toBe('team_1')
    })
    it('returns team_2 when team 2 scored more', () => {
      expect(outcomeFor(0, 3)).toBe('team_2')
    })
    it('returns draw when scores match', () => {
      expect(outcomeFor(1, 1)).toBe('draw')
    })
    it('returns null when a goal is missing', () => {
      expect(outcomeFor(null, 2)).toBeNull()
      expect(outcomeFor(2, null)).toBeNull()
      expect(outcomeFor(undefined, undefined)).toBeNull()
    })
  })

  describe('isValidPrediction', () => {
    it('accepts the three supported predictions', () => {
      expect(isValidPrediction('team_1')).toBe(true)
      expect(isValidPrediction('draw')).toBe(true)
      expect(isValidPrediction('team_2')).toBe(true)
    })
    it('rejects anything else', () => {
      expect(isValidPrediction('home')).toBe(false)
      expect(isValidPrediction('')).toBe(false)
      expect(isValidPrediction(null)).toBe(false)
    })
  })

  describe('rollWorldCupReward', () => {
    it('always returns a card from the pool', () => {
      const card = rollWorldCupReward(() => 0)
      expect(WORLD_CUP_REWARD_POOL).toContain(card)
    })
    it('reaches the last entry when random is just under 1', () => {
      const card = rollWorldCupReward(() => 0.999999)
      expect(WORLD_CUP_REWARD_POOL).toContain(card)
    })
  })

  describe('getUserPoints', () => {
    it('runs a single aggregate query and returns the count', async () => {
      query.mockResolvedValueOnce([{ points: 7 }])
      const points = await getUserPoints(42)
      expect(points).toBe(7)
      expect(query).toHaveBeenCalledTimes(1)
    })
    it('returns 0 when no row is returned', async () => {
      query.mockResolvedValueOnce([])
      const points = await getUserPoints(42)
      expect(points).toBe(0)
    })
  })

  describe('awardWorldCupRewards', () => {
    it('does nothing when user has not reached a new threshold', async () => {
      // points = 2, claimed = 0 → eligible = 0, no new cards
      query
        .mockResolvedValueOnce([{ points: 2 }])     // getUserPoints
        .mockResolvedValueOnce([{ amount: 0 }])     // getClaimedRewardCount
      const result = await awardWorldCupRewards(1, 99)
      expect(result.newCards).toBe(0)
      expect(query).toHaveBeenCalledTimes(2)
    })

    it('issues one action card when crossing exactly one threshold', async () => {
      // points = 3, claimed = 0 → eligible = 1, new = 1
      query
        .mockResolvedValueOnce([{ points: 3 }])
        .mockResolvedValueOnce([{ amount: 0 }])
        .mockResolvedValueOnce({})                  // INSERT IGNORE INTO reward_claim
        .mockResolvedValueOnce({})                  // INSERT action_card
      const result = await awardWorldCupRewards(1, 99)
      expect(result.newCards).toBe(1)
      expect(result.totalPoints).toBe(3)
      // First call after counts is the reward_claim insert at threshold 3
      const claimCall = query.mock.calls.find(c => c[0]?.startsWith?.('INSERT IGNORE INTO world_cup_reward_claim'))
      expect(claimCall[1]).toEqual([1, POINTS_PER_REWARD])
      // The action card insert binds the team_id and a card action
      const cardCall = query.mock.calls.find(c => c[0] === 'INSERT INTO action_card SET ?')
      expect(cardCall[1].team_id).toBe(99)
      expect(cardCall[1].state).toBe('pending')
      expect(WORLD_CUP_REWARD_POOL).toContain(cardCall[1].action)
    })

    it('does not double-issue when the user goes backwards', async () => {
      // points = 3, claimed = 2 → eligible = 1, new = 1 - 2 = -1 → no new cards
      query
        .mockResolvedValueOnce([{ points: 3 }])
        .mockResolvedValueOnce([{ amount: 2 }])
      const result = await awardWorldCupRewards(1, 99)
      expect(result.newCards).toBe(0)
    })
  })
})
