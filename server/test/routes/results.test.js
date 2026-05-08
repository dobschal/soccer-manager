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

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { calculateStanding } from '../../lib/util.js'
import { getCachedStanding, saveStandingToCache } from '../../helper/standingHelper.js'
import { clearAllCache } from '../../lib/cache.js'
import handlers from '../../routes/results.js'

describe('results routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCache()
  })

  describe('getResults', () => {
    it('returns results for specified match day and season', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 1, goalsTeam1: 2, goalsTeam2: 1, team1: 'Team A', team2: 'Team B' }
      ]

      getTeam.mockResolvedValue(team)
      // 1st: match_day → game_day lookup; 2nd: results query; 3rd: cup check
      query.mockResolvedValueOnce([{ game_day: 4 }]).mockResolvedValueOnce(results).mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getResults(5, 1, 1, 1, req)

      expect(result).toEqual({ results, isCupGameDay: false, cupRound: null })
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([{ game_day: 4 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const req = createMockRequest()
      await handlers.getResults(5, 1, null, null, req)

      // Second call is the results query, parameterized with [matchDay, season, level, league]
      expect(query.mock.calls[1][1]).toEqual([5, 1, 2, 3])
    })

    it('filters out friendly matches with game_type filter', async () => {
      const team = testData.team({ level: 1, league: 1 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([{ game_day: 4 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const req = createMockRequest()
      await handlers.getResults(5, 1, 1, 1, req)

      const sql = query.mock.calls[1][0]
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
      // First query translates match_day → internal game_day
      query.mockResolvedValueOnce([{ game_day: 7 }])
      getCachedStanding.mockResolvedValue(standing)

      const req = createMockRequest()
      const result = await handlers.getStanding(5, 1, 1, 1, req)

      expect(result).toEqual(standing)
      expect(getCachedStanding).toHaveBeenCalledWith(7, 1, 1, 1)
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
        .mockResolvedValueOnce([{ game_day: 7 }]) // match_day → game_day translation
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce(teams)
      calculateStanding.mockReturnValue(standing)
      saveStandingToCache.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.getStanding(5, 1, 1, 1, req)

      expect(result).toEqual(standing)
      expect(calculateStanding).toHaveBeenCalledWith(games, teams)
      expect(saveStandingToCache).toHaveBeenCalledWith(7, 1, 1, 1, standing)
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      query
        .mockResolvedValueOnce([{ game_day: 7 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, null, null, req)

      expect(getCachedStanding).toHaveBeenCalledWith(7, 1, 2, 3)
    })

    it('fetches teams by level/league when no games played', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const teams = [testData.team()]

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      // matchDay=1 with no row found means we still translate (returns empty), then fallback query (no games), then teams
      query
        .mockResolvedValueOnce([])      // no match_day → game_day mapping
        .mockResolvedValueOnce([])      // no games for fallback
        .mockResolvedValueOnce(teams)   // teams by level/league
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
        .mockResolvedValueOnce([{ game_day: 7 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, 1, 1, req)

      // call[1] is the standings games query
      const sql = query.mock.calls[1][0]
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })

  describe('getCurrentGameday', () => {
    it('returns current game day and season', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce([])

      const result = await handlers.getCurrentGameday()

      expect(result).toEqual({ gameDay: 5, season: 1 })
    })

    it('includes lastPlayedLeagueMatchDay when a league game has been played', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 6, season: 1 })
      query.mockResolvedValueOnce([{ game_day: 5, match_day: 4, season: 1 }])

      const result = await handlers.getCurrentGameday()

      expect(result.lastPlayedLeagueMatchDay).toBe(4)
      expect(result.lastPlayedLeagueSeason).toBe(1)
    })
  })

  describe('getResultsFilters', () => {
    it('returns leagues, seasons, and match days for given context', async () => {
      query
        .mockResolvedValueOnce([
          { level: 0, league: 0 },
          { level: 1, league: 0 },
          { level: 1, league: 1 }
        ])
        .mockResolvedValueOnce([{ season: 0 }, { season: 1 }, { season: 2 }])
        .mockResolvedValueOnce([{ match_day: 1 }, { match_day: 2 }, { match_day: 3 }])

      const result = await handlers.getResultsFilters(1, 0, 2)

      expect(result.leagues).toEqual([
        { level: 0, league: 0 },
        { level: 1, league: 0 },
        { level: 1, league: 1 }
      ])
      expect(result.seasons).toEqual([0, 1, 2])
      expect(result.matchDays).toEqual([1, 2, 3])
      expect(query.mock.calls[1][1]).toEqual([1, 0])
      expect(query.mock.calls[2][1]).toEqual([1, 0, 2])
    })

    it('omits season and match day queries when context missing', async () => {
      query.mockResolvedValueOnce([{ level: 0, league: 0 }])

      const result = await handlers.getResultsFilters()

      expect(result.leagues).toEqual([{ level: 0, league: 0 }])
      expect(result.seasons).toEqual([])
      expect(result.matchDays).toEqual([])
      expect(query).toHaveBeenCalledTimes(1)
    })
  })

  describe('getGamesForSlider', () => {
    it('returns past games oldest-first and upcoming games', async () => {
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

      const req = createMockRequest()
      const result = await handlers.getGamesForSlider(3, 0, req)

      expect(result.pastGames).toEqual([
        { id: 100, gameDay: 2 },
        { id: 101, gameDay: 3 },
        { id: 102, gameDay: 4 }
      ])
    })
  })

  describe('getSeasonResults', () => {
    it('returns all season results up to specified match day', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 1, gameDay: 0, matchDay: 1 },
        { id: 2, gameDay: 1, matchDay: 2 }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(results)

      const req = createMockRequest()
      const result = await handlers.getSeasonResults(1, 5, 1, 1, req)

      expect(result).toEqual(results)
    })

    it('filters by match_day and excludes friendly matches', async () => {
      const team = testData.team({ level: 1, league: 1 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      await handlers.getSeasonResults(1, 5, 1, 1, req)

      const sql = query.mock.calls[0][0]
      expect(sql).toContain('g.match_day <= ?')
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })
})
