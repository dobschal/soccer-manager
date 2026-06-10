import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/worldCupHelper.js', () => ({
  awardStarPlayersToTopThree: vi.fn(),
  awardWorldCupRewards: vi.fn(),
  getLeaderboard: vi.fn(),
  getUserPoints: vi.fn(),
  isValidPrediction: (p) => ['team_1', 'draw', 'team_2'].includes(p),
  outcomeFor: (a, b) => {
    if (a === null || b === null || a === undefined || b === undefined) return null
    if (a > b) return 'team_1'
    if (a < b) return 'team_2'
    return 'draw'
  },
  POINTS_PER_REWARD: 3
}))

vi.mock('../../helper/worldCupSeedData.js', () => ({
  WORLD_CUP_NATIONS: [
    { code: 'de', name: 'Germany' },
    { code: 'br', name: 'Brazil' },
    { code: 'fr', name: 'France' }
  ],
  nationNameByCode: () => ({ de: 'Germany', br: 'Brazil', fr: 'France' })
}))

import { query } from '../../lib/database.js'
import { awardStarPlayersToTopThree, awardWorldCupRewards, getLeaderboard, getUserPoints } from '../../helper/worldCupHelper.js'
import handlers from '../../routes/worldCup.js'

const FUTURE = '2099-01-01T12:00:00Z'
const PAST = '2000-01-01T12:00:00Z'

describe('worldCup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getWorldCupGames', () => {
    it('returns games with the requesting user\'s bet attached', async () => {
      // 1) total query, 2) games query, 3) bets-by-game query
      query
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([
          { id: 1, team_1_code: 'de', team_1_name: 'Germany', team_2_code: 'br', team_2_name: 'Brazil', kickoff: FUTURE, goals_team_1: null, goals_team_2: null, stage: 'group' },
          { id: 2, team_1_code: 'fr', team_1_name: 'France', team_2_code: 'de', team_2_name: 'Germany', kickoff: PAST, goals_team_1: 1, goals_team_2: 2, stage: 'group' }
        ])
        .mockResolvedValueOnce([
          { game_id: 1, prediction: 'team_1' }
        ])

      const req = createMockRequest()
      const result = await handlers.getWorldCupGames(0, 6, req)

      expect(result.total).toBe(2)
      expect(result.games).toHaveLength(2)
      expect(result.games[0].myPrediction).toBe('team_1')
      expect(result.games[0].hasKickedOff).toBe(false)
      expect(result.games[1].isPlayed).toBe(true)
      expect(result.games[1].outcome).toBe('team_2')
      expect(result.games[1].myPrediction).toBeNull()
    })
  })

  describe('placeWorldCupBet', () => {
    it('rejects bets after kickoff', async () => {
      query.mockResolvedValueOnce([{ id: 1, kickoff: PAST }])
      const req = createMockRequest()
      await expect(handlers.placeWorldCupBet(1, 'team_1', req)).rejects.toThrow()
    })
    it('upserts a bet when kickoff is in the future', async () => {
      query
        .mockResolvedValueOnce([{ id: 1, kickoff: FUTURE }])
        .mockResolvedValueOnce({ insertId: 1 })
      const req = createMockRequest()
      const result = await handlers.placeWorldCupBet(1, 'draw', req)
      expect(result.success).toBe(true)
      expect(result.prediction).toBe('draw')
      const insertCall = query.mock.calls.find(c => /INSERT INTO world_cup_bet/.test(c[0]))
      expect(insertCall[1]).toEqual([req.user.id, 1, 'draw'])
    })
    it('rejects invalid prediction values', async () => {
      const req = createMockRequest()
      await expect(handlers.placeWorldCupBet(1, 'home', req)).rejects.toThrow()
    })
  })

  describe('getWorldCupLeaderboard', () => {
    it('returns top, me, and next-reward info', async () => {
      getLeaderboard.mockResolvedValue({
        top: [{ userId: 7, username: 'a', points: 4, isMe: true, rank: 1 }],
        me: { rank: 1, points: 4 }
      })
      const req = createMockRequest({ user: { id: 7, username: 'a' } })
      const result = await handlers.getWorldCupLeaderboard(req)
      expect(result.myPoints).toBe(4)
      expect(result.nextRewardAt).toBe(6)
      expect(result.pointsToNextReward).toBe(2)
      expect(result.pointsPerReward).toBe(3)
    })
    it('falls back to getUserPoints when the user is not on the board', async () => {
      getLeaderboard.mockResolvedValue({ top: [], me: null })
      getUserPoints.mockResolvedValue(0)
      const req = createMockRequest()
      const result = await handlers.getWorldCupLeaderboard(req)
      expect(result.myPoints).toBe(0)
      expect(result.nextRewardAt).toBe(3)
    })
  })

  describe('admin endpoints require admin', () => {
    it('adminListWorldCupGames rejects non-admins', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: false } })
      await expect(handlers.adminListWorldCupGames(req)).rejects.toThrow()
    })
    it('adminCreateWorldCupGame inserts and rejects matching teams', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      await expect(handlers.adminCreateWorldCupGame({
        team1Code: 'de', team2Code: 'de', kickoff: FUTURE, stage: 'group'
      }, req)).rejects.toThrow()

      query.mockResolvedValueOnce({ insertId: 99 })
      const res = await handlers.adminCreateWorldCupGame({
        team1Code: 'de', team2Code: 'br', kickoff: FUTURE, stage: 'group'
      }, req)
      expect(res.id).toBe(99)
      const insertCall = query.mock.calls.find(c => /INSERT INTO world_cup_game/.test(c[0]))
      expect(insertCall[1][0]).toBe('de')
      expect(insertCall[1][2]).toBe('br')
    })
    it('adminUpdateWorldCupGame awards rewards when a result is set', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      query
        // SELECT existing game
        .mockResolvedValueOnce([{ goals_team_1: null, goals_team_2: null }])
        // UPDATE
        .mockResolvedValueOnce({ affectedRows: 1 })
        // SELECT bettors
        .mockResolvedValueOnce([{ user_id: 10, team_id: 200 }])
      awardWorldCupRewards.mockResolvedValue({ newCards: 1, totalPoints: 3, claimed: 1 })

      const result = await handlers.adminUpdateWorldCupGame({
        id: 5,
        team1Code: 'de',
        team2Code: 'br',
        kickoff: FUTURE,
        stage: 'group',
        goalsTeam1: 2,
        goalsTeam2: 1
      }, req)
      expect(result.awarded).toEqual([{ userId: 10, newCards: 1 }])
      expect(awardWorldCupRewards).toHaveBeenCalledWith(10, 200)
    })
    it('adminUpdateWorldCupGame rejects when only one goal is set', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      await expect(handlers.adminUpdateWorldCupGame({
        id: 5,
        team1Code: 'de',
        team2Code: 'br',
        kickoff: FUTURE,
        stage: 'group',
        goalsTeam1: 2,
        goalsTeam2: null
      }, req)).rejects.toThrow()
    })
    it('adminDeleteWorldCupGame removes bets first then the game', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      query.mockResolvedValue({ affectedRows: 1 })
      await handlers.adminDeleteWorldCupGame(7, req)
      const calls = query.mock.calls.map(c => c[0])
      expect(calls[0]).toMatch(/DELETE FROM world_cup_bet/)
      expect(calls[1]).toMatch(/DELETE FROM world_cup_game/)
    })
    it('adminConcludeWorldCup is idempotent', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      query.mockResolvedValueOnce([{ is_concluded: 1, star_players_awarded: 1 }])
      const result = await handlers.adminConcludeWorldCup(req)
      expect(result.alreadyAwarded).toBe(true)
      expect(awardStarPlayersToTopThree).not.toHaveBeenCalled()
    })
    it('adminConcludeWorldCup awards and updates state on first call', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: true } })
      query
        .mockResolvedValueOnce([{ is_concluded: 0, star_players_awarded: 0 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
      awardStarPlayersToTopThree.mockResolvedValue({ recipients: [{ userId: 1, teamId: 1, rank: 1 }] })
      const result = await handlers.adminConcludeWorldCup(req)
      expect(result.alreadyAwarded).toBe(false)
      expect(result.recipients).toHaveLength(1)
    })
  })
})
