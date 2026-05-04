import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

vi.mock('../../helper/standingHelper.js', () => ({
  getCachedStanding: vi.fn(),
  saveStandingToCache: vi.fn()
}))

vi.mock('../../helper/seenGameHelper.js', () => ({
  getSeenGameIds: vi.fn(),
  markGameAsSeen: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { calculateStanding } from '../../lib/util.js'
import { getCachedStanding, saveStandingToCache } from '../../helper/standingHelper.js'
import { getSeenGameIds, markGameAsSeen } from '../../helper/seenGameHelper.js'
import { clearAllCache } from '../../lib/cache.js'
import handlers from '../../routes/results.js'

describe('results routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCache()
  })

  describe('getResults', () => {
    it('returns results for specified game day and season', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 1, goalsTeam1: 2, goalsTeam2: 1, team1: 'Team A', team2: 'Team B' }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce(results).mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getResults(5, 1, 1, 1, req)

      expect(result).toEqual({ results, isCupGameDay: false, cupRound: null })
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const req = createMockRequest()
      await handlers.getResults(5, 1, null, null, req)

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [5, 1, 2, 3]
      )
    })

    it('filters out friendly matches with game_type filter', async () => {
      const team = testData.team({ level: 1, league: 1 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const req = createMockRequest()
      await handlers.getResults(5, 1, 1, 1, req)

      const sql = query.mock.calls[0][0]
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })

  describe('getResult', () => {
    it('returns single game result by id', async () => {
      const gameResult = {
        id: 1,
        goalsTeam1: 2,
        goalsTeam2: 1,
        team1: 'Team A',
        team2: 'Team B'
      }

      query.mockResolvedValue([gameResult])

      const result = await handlers.getResult(1)

      expect(result).toEqual({ result: gameResult })
    })

    it('throws error when game not found', async () => {
      query.mockResolvedValue([])

      await expect(handlers.getResult(999))
        .rejects.toMatchObject({ message: 'Game not found' })
    })
  })

  describe('getStanding', () => {
    it('returns cached standing when available', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const standing = [{ team_id: 1, points: 3 }]

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(standing)

      const req = createMockRequest()
      const result = await handlers.getStanding(5, 1, 1, 1, req)

      expect(result).toEqual(standing)
      expect(getCachedStanding).toHaveBeenCalledWith(5, 1, 1, 1)
      expect(calculateStanding).not.toHaveBeenCalled()
    })

    it('calculates standing when cache miss', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const games = [testData.gameResult()]
      const teams = [testData.team({ id: 1 }), testData.team({ id: 2 })]
      const standing = [{ team_id: 1, points: 3 }]

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null) // Cache miss
      query
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce(teams)
      calculateStanding.mockReturnValue(standing)
      saveStandingToCache.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.getStanding(5, 1, 1, 1, req)

      expect(result).toEqual(standing)
      expect(calculateStanding).toHaveBeenCalledWith(games, teams)
      expect(saveStandingToCache).toHaveBeenCalledWith(5, 1, 1, 1, standing)
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, null, null, req)

      expect(getCachedStanding).toHaveBeenCalledWith(5, 1, 2, 3)
    })

    it('fetches teams by level/league when no games played', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const teams = [testData.team()]

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      query
        .mockResolvedValueOnce([])  // no games
        .mockResolvedValueOnce(teams)
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(1, 0, 1, 1, req)

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM team WHERE level=? AND league=?',
        [1, 1]
      )
      // Should not cache when no games
      expect(saveStandingToCache).not.toHaveBeenCalled()
    })

    it('filters out friendly matches with game_type filter in fallback query', async () => {
      const team = testData.team({ level: 1, league: 1 })

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, 1, 1, req)

      const sql = query.mock.calls[0][0]
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })

  describe('getCurrentGameday', () => {
    it('returns current game day and season', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      const result = await handlers.getCurrentGameday()

      expect(result).toEqual({ gameDay: 5, season: 1 })
    })
  })

  describe('getGamesForSlider', () => {
    it('annotates each past game with a seen flag from the seen-game helper', async () => {
      const team = testData.team({ id: 7, level: 1, league: 1 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 0 })
      // First query returns past games (DESC by gameDay), second returns upcoming.
      // pastGames are reversed inside the route, so input order is newest-first.
      query
        .mockResolvedValueOnce([
          { id: 102, gameDay: 4 },
          { id: 101, gameDay: 3 },
          { id: 100, gameDay: 2 }
        ])
        .mockResolvedValueOnce([])
      getSeenGameIds.mockResolvedValue(new Set([100, 101]))

      const req = createMockRequest()
      const result = await handlers.getGamesForSlider(3, 0, req)

      expect(getSeenGameIds).toHaveBeenCalledWith(7, [100, 101, 102])
      expect(result.pastGames).toEqual([
        { id: 100, gameDay: 2, seen: true },
        { id: 101, gameDay: 3, seen: true },
        { id: 102, gameDay: 4, seen: false }
      ])
    })
  })

  describe('markGameAsSeen', () => {
    it('marks the game as seen for the current team', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      markGameAsSeen.mockResolvedValue(undefined)

      const req = createMockRequest()
      const result = await handlers.markGameAsSeen(42, req)

      expect(markGameAsSeen).toHaveBeenCalledWith(7, 42)
      expect(result).toEqual({ success: true })
    })

    it('throws when called without a user', async () => {
      await expect(handlers.markGameAsSeen(42, { user: null })).rejects.toMatchObject({
        message: 'Not authorized'
      })
    })

    it('throws when called without a gameId', async () => {
      const req = createMockRequest()
      await expect(handlers.markGameAsSeen(null, req)).rejects.toMatchObject({
        message: 'gameId required'
      })
    })
  })

  describe('getSeasonResults', () => {
    it('returns all season results up to specified game day', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 1, gameDay: 1 },
        { id: 2, gameDay: 2 }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(results)

      const req = createMockRequest()
      const result = await handlers.getSeasonResults(1, 5, 1, 1, req)

      expect(result).toEqual(results)
    })

    it('filters out friendly matches with game_type filter', async () => {
      const team = testData.team({ level: 1, league: 1 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      await handlers.getSeasonResults(1, 5, 1, 1, req)

      const sql = query.mock.calls[0][0]
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })
})
