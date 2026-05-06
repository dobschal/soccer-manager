import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/miniGameHelper.js', async () => {
  const actual = await vi.importActual('../../helper/miniGameHelper.js')
  return {
    ...actual,
    rollMiniGameReward: vi.fn(),
    hasReceivedMiniGameRewardToday: vi.fn()
  }
})

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { rollMiniGameReward, hasReceivedMiniGameRewardToday } from '../../helper/miniGameHelper.js'
import handlers from '../../routes/miniGame.js'

describe('miniGame routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitMiniGameScore', () => {
    it('rejects unauthenticated requests', async () => {
      await expect(handlers.submitMiniGameScore(0, 0, 0, { user: null, locale: 'en' }))
        .rejects.toMatchObject({ status: 401 })
    })

    it('rejects implausible scores', async () => {
      getTeam.mockResolvedValue(testData.team())
      await expect(handlers.submitMiniGameScore(99999, 0, 100, createMockRequest()))
        .rejects.toMatchObject({ status: 400 })
    })

    it('saves score and awards card when roll wins and no daily reward yet', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      hasReceivedMiniGameRewardToday.mockResolvedValue(false)
      rollMiniGameReward.mockReturnValue('FRESHNESS_5')

      // INSERT score, INSERT card, UPDATE score with card id, rank query, best query
      query.mockResolvedValueOnce({ insertId: 11 })       // insert score
      query.mockResolvedValueOnce({ insertId: 77 })       // insert action_card
      query.mockResolvedValueOnce({ affectedRows: 1 })    // update mini_game_score with card id
      query.mockResolvedValueOnce([{ leaderboard_rank: 3 }]) // rank
      query.mockResolvedValueOnce([{ best: 50 }])         // best score (other rows)

      const result = await handlers.submitMiniGameScore(150, 1, 5000, createMockRequest())

      expect(result.success).toBe(true)
      expect(result.awardedCard).toEqual({ id: 77, action: 'FRESHNESS_5' })
      expect(result.isBlank).toBe(false)
      expect(result.dailyRewardUsed).toBe(false)
      expect(result.leaderboardRank).toBe(3)
      expect(result.isPersonalBest).toBe(true)

      // Verify card insert was called with state pending
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        team_id: team.id,
        action: 'FRESHNESS_5',
        played: 0,
        state: 'pending'
      }))
    })

    it('returns isBlank when roll loses and no daily reward yet', async () => {
      getTeam.mockResolvedValue(testData.team())
      hasReceivedMiniGameRewardToday.mockResolvedValue(false)
      rollMiniGameReward.mockReturnValue(null)

      query.mockResolvedValueOnce({ insertId: 12 })
      query.mockResolvedValueOnce([{ leaderboard_rank: 7 }])
      query.mockResolvedValueOnce([{ best: 200 }])

      const result = await handlers.submitMiniGameScore(180, 1, 5000, createMockRequest())

      expect(result.awardedCard).toBeNull()
      expect(result.isBlank).toBe(true)
      expect(result.dailyRewardUsed).toBe(false)
      expect(result.isPersonalBest).toBe(false)
    })

    it('flags dailyRewardUsed and skips card when limit reached', async () => {
      getTeam.mockResolvedValue(testData.team())
      hasReceivedMiniGameRewardToday.mockResolvedValue(true)

      query.mockResolvedValueOnce({ insertId: 13 })
      query.mockResolvedValueOnce([{ leaderboard_rank: 1 }])
      query.mockResolvedValueOnce([{ best: null }])

      const result = await handlers.submitMiniGameScore(150, 1, 5000, createMockRequest())

      expect(result.awardedCard).toBeNull()
      expect(result.isBlank).toBe(false)
      expect(result.dailyRewardUsed).toBe(true)
      expect(rollMiniGameReward).not.toHaveBeenCalled()
      expect(result.isPersonalBest).toBe(true)
    })
  })

  describe('getMiniGameLeaderboard', () => {
    it('rejects unauthenticated requests', async () => {
      await expect(handlers.getMiniGameLeaderboard({ user: null, locale: 'en' }))
        .rejects.toMatchObject({ status: 401 })
    })

    it('returns top all-time, top today, and personal best, with isMyTeam flag', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)

      const allTimeRows = [
        { team_id: 7, score: 1000, goals_scored: 5, played_at: '2026-05-01', team_name: 'My FC', emblem: null },
        { team_id: 8, score: 800, goals_scored: 3, played_at: '2026-05-02', team_name: 'Other FC', emblem: null }
      ]
      const todayRows = [allTimeRows[0]]
      const myBestRows = [{ best: 1000 }]

      query.mockResolvedValueOnce(allTimeRows)
      query.mockResolvedValueOnce(todayRows)
      query.mockResolvedValueOnce(myBestRows)

      const result = await handlers.getMiniGameLeaderboard(createMockRequest())

      expect(result.success).toBe(true)
      expect(result.topAllTime).toHaveLength(2)
      expect(result.topAllTime[0]).toMatchObject({ teamId: 7, isMyTeam: true, score: 1000 })
      expect(result.topAllTime[1]).toMatchObject({ teamId: 8, isMyTeam: false })
      expect(result.topToday).toHaveLength(1)
      expect(result.myBest).toBe(1000)
    })

    it('returns null myBest when team has never played', async () => {
      getTeam.mockResolvedValue(testData.team())
      query.mockResolvedValueOnce([])
      query.mockResolvedValueOnce([])
      query.mockResolvedValueOnce([{ best: null }])

      const result = await handlers.getMiniGameLeaderboard(createMockRequest())
      expect(result.topAllTime).toEqual([])
      expect(result.topToday).toEqual([])
      expect(result.myBest).toBeNull()
    })
  })
})
