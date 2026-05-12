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

vi.mock('../../helper/cupHelper.js', () => ({
  getTotalRoundsForSeason: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { calculateStanding } from '../../lib/util.js'
import { getCachedStanding, saveStandingToCache } from '../../helper/standingHelper.js'
import { getTotalRoundsForSeason } from '../../helper/cupHelper.js'
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
      // 1: match_day → game_day translation. 2: lastPlayed game_day lookup.
      query
        .mockResolvedValueOnce([{ game_day: 7 }])
        .mockResolvedValueOnce([{ lastDay: 9 }])
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
        .mockResolvedValueOnce([{ game_day: 7 }])  // match_day → game_day translation
        .mockResolvedValueOnce([{ lastDay: 9 }])    // lastPlayed game_day
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

    it('skips cache for future match days and never writes a future-game_day cache row', async () => {
      const team = testData.team({ level: 0, league: 0 })
      const games = [testData.gameResult()]
      const teams = [testData.team({ id: 1 }), testData.team({ id: 2 })]
      const standing = [{ team_id: 1, points: 3 }]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([{ game_day: 34 }])  // match_day 29 → game_day 34
        .mockResolvedValueOnce([{ lastDay: 32 }])    // last played was game_day 32 (match_day 28)
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce(teams)
      calculateStanding.mockReturnValue(standing)

      const req = createMockRequest()
      const result = await handlers.getStanding(29, 4, 0, 0, req)

      expect(result).toEqual(standing)
      // Cache must not be read for a future match day; otherwise stale snapshots leak.
      expect(getCachedStanding).not.toHaveBeenCalled()
      // And we must not write a future-game_day cache row.
      expect(saveStandingToCache).not.toHaveBeenCalled()
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      getCachedStanding.mockResolvedValue(null)
      query
        .mockResolvedValueOnce([{ game_day: 7 }])
        .mockResolvedValueOnce([{ lastDay: 9 }])
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
      // matchDay=1 with no row found means we still translate (returns empty), then lastPlayed lookup (none), then fallback query (no games), then teams
      query
        .mockResolvedValueOnce([])                  // no match_day → game_day mapping
        .mockResolvedValueOnce([{ lastDay: null }]) // no league games played yet
        .mockResolvedValueOnce([])                  // no games for fallback
        .mockResolvedValueOnce(teams)               // teams by level/league
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
        .mockResolvedValueOnce([{ lastDay: 9 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, 1, 1, req)

      // call[2] is the standings games query (after game_day translation and lastPlayed lookup)
      const sql = query.mock.calls[2][0]
      expect(sql).toContain("g.game_type = 'league' OR g.game_type IS NULL")
    })
  })

  describe('getCurrentGameday', () => {
    it('returns current game day and season with null label fields when no user', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query
        .mockResolvedValueOnce([])  // last played
        .mockResolvedValueOnce([])  // cup today

      const result = await handlers.getCurrentGameday()

      expect(result).toEqual({
        gameDay: 5,
        season: 1,
        cupRoundToday: null,
        userMatchDayToday: null,
        userNextMatchDay: null
      })
    })

    it('includes lastPlayedLeagueMatchDay when a league game has been played', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 6, season: 1 })
      query
        .mockResolvedValueOnce([{ game_day: 5, match_day: 4, season: 1 }])  // last played
        .mockResolvedValueOnce([])  // cup today

      const result = await handlers.getCurrentGameday()

      expect(result.lastPlayedLeagueMatchDay).toBe(4)
      expect(result.lastPlayedLeagueSeason).toBe(1)
    })

    it('returns cupRoundToday when a cup game is scheduled on the current game day', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 22, season: 4 })
      query
        .mockResolvedValueOnce([])                       // last played
        .mockResolvedValueOnce([{ cup_round: 8 }])       // cup today
      getTotalRoundsForSeason.mockResolvedValue(7)

      const result = await handlers.getCurrentGameday()

      expect(result.cupRoundToday).toEqual({ cupRound: 8, totalRounds: 7 })
      expect(getTotalRoundsForSeason).toHaveBeenCalledWith(4)
    })

    it('returns userMatchDayToday when the user team has a league game on the current game day', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getTeam.mockResolvedValue(testData.team({ level: 1, league: 2 }))
      query
        .mockResolvedValueOnce([])                       // last played
        .mockResolvedValueOnce([])                       // cup today
        .mockResolvedValueOnce([{ match_day: 4 }])       // today's match day for user league
        .mockResolvedValueOnce([{ match_day: 4 }])       // next upcoming match day

      const req = createMockRequest()
      const result = await handlers.getCurrentGameday(req)

      expect(result.userMatchDayToday).toBe(4)
      expect(result.userNextMatchDay).toBe(4)
    })

    it('returns userNextMatchDay only when the user team has no game today (rest day)', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 33, season: 4 })
      getTeam.mockResolvedValue(testData.team({ level: 0, league: 0 }))
      query
        .mockResolvedValueOnce([])                       // last played
        .mockResolvedValueOnce([])                       // cup today
        .mockResolvedValueOnce([])                       // no league game today for user league
        .mockResolvedValueOnce([{ match_day: 29 }])      // next upcoming match day

      const req = createMockRequest()
      const result = await handlers.getCurrentGameday(req)

      expect(result.userMatchDayToday).toBeNull()
      expect(result.userNextMatchDay).toBe(29)
    })

    it('reports lastPlayedLeagueMatchDay for the user league (not the global latest)', async () => {
      // The global ORDER BY game_day DESC can return a different league's
      // row when several leagues play on the same internal game_day. The
      // results page default must reflect the *user's* league, otherwise it
      // lands on a match_day they haven't even played yet.
      getGameDayAndSeason.mockResolvedValue({ gameDay: 34, season: 4 })
      getTeam.mockResolvedValue(testData.team({ level: 0, league: 0 }))
      query
        .mockResolvedValueOnce([{ game_day: 34, match_day: 29, season: 4 }]) // last played (user-league filtered)
        .mockResolvedValueOnce([])  // cup today
        .mockResolvedValueOnce([])  // user today
        .mockResolvedValueOnce([])  // user next

      const req = createMockRequest()
      const result = await handlers.getCurrentGameday(req)

      expect(result.lastPlayedLeagueMatchDay).toBe(29)
      // The query must filter by the user's level and league.
      const sql = query.mock.calls[0][0]
      const params = query.mock.calls[0][1]
      expect(sql).toContain('level=?')
      expect(sql).toContain('league=?')
      expect(params).toEqual([0, 0])
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
