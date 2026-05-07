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
    hasReceivedMiniGameRewardThisGameDay: vi.fn()
  }
})

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 2 })
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { rollMiniGameReward, hasReceivedMiniGameRewardThisGameDay } from '../../helper/miniGameHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
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

    it('saves score and awards card when roll wins and no game-day reward yet', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      hasReceivedMiniGameRewardThisGameDay.mockResolvedValue(false)
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
      expect(result.gameDayRewardUsed).toBe(false)
      expect(result.leaderboardRank).toBe(3)
      expect(result.isPersonalBest).toBe(true)

      // Score insert is stamped with the current game day and season
      expect(query).toHaveBeenCalledWith('INSERT INTO mini_game_score SET ?', expect.objectContaining({
        team_id: team.id,
        score: 150,
        goals_scored: 1,
        duration_ms: 5000,
        game_day: 5,
        season: 2
      }))

      // Game-day reward check is scoped to the current game day and season
      expect(hasReceivedMiniGameRewardThisGameDay).toHaveBeenCalledWith(team.id, 5, 2)

      // Verify card insert was called with state pending
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        team_id: team.id,
        action: 'FRESHNESS_5',
        played: 0,
        state: 'pending'
      }))
    })

    it('returns isBlank when roll loses and no game-day reward yet', async () => {
      getTeam.mockResolvedValue(testData.team())
      hasReceivedMiniGameRewardThisGameDay.mockResolvedValue(false)
      rollMiniGameReward.mockReturnValue(null)

      query.mockResolvedValueOnce({ insertId: 12 })
      query.mockResolvedValueOnce([{ leaderboard_rank: 7 }])
      query.mockResolvedValueOnce([{ best: 200 }])

      const result = await handlers.submitMiniGameScore(180, 1, 5000, createMockRequest())

      expect(result.awardedCard).toBeNull()
      expect(result.isBlank).toBe(true)
      expect(result.gameDayRewardUsed).toBe(false)
      expect(result.isPersonalBest).toBe(false)
    })

    it('flags gameDayRewardUsed and skips card when the game-day limit is reached', async () => {
      getTeam.mockResolvedValue(testData.team())
      hasReceivedMiniGameRewardThisGameDay.mockResolvedValue(true)

      query.mockResolvedValueOnce({ insertId: 13 })
      query.mockResolvedValueOnce([{ leaderboard_rank: 1 }])
      query.mockResolvedValueOnce([{ best: null }])

      const result = await handlers.submitMiniGameScore(150, 1, 5000, createMockRequest())

      expect(result.awardedCard).toBeNull()
      expect(result.isBlank).toBe(false)
      expect(result.gameDayRewardUsed).toBe(true)
      expect(rollMiniGameReward).not.toHaveBeenCalled()
      expect(result.isPersonalBest).toBe(true)
    })

    it('uses the current game day and season from getGameDayAndSeason', async () => {
      getTeam.mockResolvedValue(testData.team())
      getGameDayAndSeason.mockResolvedValueOnce({ gameDay: 12, season: 4 })
      hasReceivedMiniGameRewardThisGameDay.mockResolvedValue(false)
      rollMiniGameReward.mockReturnValue(null)

      query.mockResolvedValueOnce({ insertId: 14 })
      query.mockResolvedValueOnce([{ leaderboard_rank: 1 }])
      query.mockResolvedValueOnce([{ best: null }])

      await handlers.submitMiniGameScore(50, 0, 5000, createMockRequest())

      expect(hasReceivedMiniGameRewardThisGameDay).toHaveBeenCalledWith(expect.any(Number), 12, 4)
      expect(query).toHaveBeenCalledWith('INSERT INTO mini_game_score SET ?', expect.objectContaining({
        game_day: 12,
        season: 4
      }))
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
        { team_id: 7, score: 1000, goals_scored: 5, played_at: '2026-05-01', team_name: 'My FC', emblem: null, username: 'me' },
        { team_id: 8, score: 800, goals_scored: 3, played_at: '2026-05-02', team_name: 'Other FC', emblem: null, username: 'rival' }
      ]
      const todayRows = [allTimeRows[0]]
      const myBestRows = [{ best: 1000 }]

      query.mockResolvedValueOnce(allTimeRows)
      query.mockResolvedValueOnce(todayRows)
      query.mockResolvedValueOnce(myBestRows)

      const result = await handlers.getMiniGameLeaderboard(createMockRequest())

      expect(result.success).toBe(true)
      expect(result.topAllTime).toHaveLength(2)
      expect(result.topAllTime[0]).toMatchObject({ teamId: 7, isMyTeam: true, score: 1000, username: 'me' })
      expect(result.topAllTime[1]).toMatchObject({ teamId: 8, isMyTeam: false, username: 'rival' })
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
