import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn(),
  getTicksUntilGameDay: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

vi.mock('../../helper/standingHelper.js', () => ({
  getCachedStanding: vi.fn(),
  saveStandingToCache: vi.fn()
}))

vi.mock('../../helper/cupHelper.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getTotalRoundsForSeason: vi.fn()
  }
})

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason, getTicksUntilGameDay } from '../../helper/gameDayHelper.js'
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

      expect(result).toEqual({
        results: [{ ...results[0], isForfeit: false }],
        isCupGameDay: false,
        cupRound: null
      })
    })

    it('flags forfeit games as isForfeit=true', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 9, goalsTeam1: 0, goalsTeam2: 0, team1: 'Team A', team2: 'Team B', isForfeit: 1 }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([{ game_day: 4 }]).mockResolvedValueOnce(results).mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getResults(5, 1, 1, 1, req)

      expect(result.results[0].isForfeit).toBe(true)
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

  describe('getMySchedule', () => {
    it('combines league and cup games and adds placeholders for cup rounds without team games', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 2, gameDay: 3 })

      const leagueGames = [
        { id: 100, gameDay: 1, matchDay: 1, season: 2, goalsTeam1: 2, goalsTeam2: 1, isForfeit: 0, played: 1, team1Id: 7, team1: 'Mine', team1Color: '#fff', team1Emblem: 0, team1UserId: 1, team2Id: 8, team2: 'Other', team2Color: '#000', team2Emblem: 1, team2UserId: null },
        { id: 101, gameDay: 5, matchDay: 2, season: 2, goalsTeam1: null, goalsTeam2: null, isForfeit: 0, played: 0, team1Id: 8, team1: 'Other', team1Color: '#000', team1Emblem: 1, team1UserId: null, team2Id: 7, team2: 'Mine', team2Color: '#fff', team2Emblem: 0, team2UserId: 1 }
      ]
      const cupGames = [
        { id: 200, gameDay: 2, season: 2, cupRound: 4, goalsTeam1: 3, goalsTeam2: 0, played: 1, team1Id: 7, team1: 'Mine', team1Color: '#fff', team1Emblem: 0, team1UserId: 1, team2Id: 9, team2: 'Cup Opponent', team2Color: '#abc', team2Emblem: 2, team2UserId: null }
      ]
      const cupRounds = [
        { cupRound: 4, gameDay: 2, allPlayed: 1 },
        { cupRound: 2, gameDay: 6, allPlayed: 0 }
      ]
      const unplayedDays = [{ game_day: 5 }, { game_day: 6 }]
      const totalRounds = [{ maxRound: 4 }]

      query
        .mockResolvedValueOnce(leagueGames)
        .mockResolvedValueOnce(cupGames)
        .mockResolvedValueOnce(cupRounds)
        .mockResolvedValueOnce(unplayedDays)
        .mockResolvedValueOnce(totalRounds)

      const req = createMockRequest()
      const result = await handlers.getMySchedule(undefined, req)

      expect(result.season).toBe(2)
      expect(result.currentGameDay).toBe(3)
      expect(result.totalCupRounds).toBe(3)
      // 4 actual entries + 1 placeholder for the undrawn final (cupRound=1)
      expect(result.schedule).toHaveLength(5)

      // Sorted by gameDay; the undrawn final gets its predicted game_day from
      // the interleaved cup schedule.
      expect(result.schedule.map(e => ({ type: e.type, gameDay: e.gameDay, cupRound: e.cupRound }))).toEqual([
        { type: 'league', gameDay: 1, cupRound: undefined },
        { type: 'cup', gameDay: 2, cupRound: 4 },
        { type: 'league', gameDay: 5, cupRound: undefined },
        { type: 'cup_round', gameDay: 6, cupRound: 2 },
        { type: 'cup_round', gameDay: 35, cupRound: 1 }
      ])

      // Played league game has played=true, no gameDate
      expect(result.schedule[0].played).toBe(true)
      expect(result.schedule[0].gameDate).toBeNull()

      // Upcoming league has a gameDate at index 0 of unplayedDays => nextTick + 0
      expect(result.schedule[2].played).toBe(false)
      expect(result.schedule[2].gameDate).toBe(result.nextGameDate)

      // Cup-round placeholder for an existing-but-not-our round (team not in this round)
      const placeholder = result.schedule[3]
      expect(placeholder.type).toBe('cup_round')
      expect(placeholder.cupRound).toBe(2)
      expect(placeholder.played).toBe(false)
      expect(placeholder.gameDate).not.toBeNull()

      // Future-round placeholder for the not-yet-drawn final
      const future = result.schedule[4]
      expect(future.type).toBe('cup_round')
      expect(future.cupRound).toBe(1)
      expect(future.played).toBe(false)
      expect(future.gameDate).not.toBeNull()
    })

    it('adds future cup round placeholders for rounds not yet drawn', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 1 })

      // Only the first round has been drawn so far (cupRound=4 of a 3-round
      // tournament). The semi-final (2) and final (1) should appear as
      // placeholders even though no game rows exist for them yet.
      query
        .mockResolvedValueOnce([]) // leagueGames
        .mockResolvedValueOnce([]) // cupGames (user not in cup or no games yet)
        .mockResolvedValueOnce([{ cupRound: 4, gameDay: 4, allPlayed: 0 }]) // cupRoundsRows
        .mockResolvedValueOnce([{ game_day: 4 }]) // unplayedDayRows
        .mockResolvedValueOnce([{ maxRound: 4 }]) // totalRoundsRow

      const req = createMockRequest()
      const result = await handlers.getMySchedule(undefined, req)

      const cupRoundEntries = result.schedule.filter(e => e.type === 'cup_round')
      const rounds = cupRoundEntries.map(e => e.cupRound).sort((a, b) => b - a)
      expect(rounds).toEqual([4, 2, 1])
      expect(cupRoundEntries.every(e => e.played === false)).toBe(true)
      expect(cupRoundEntries.every(e => e.gameDate != null)).toBe(true)
    })

    it('returns empty schedule when team has no games', async () => {
      const team = testData.team({ id: 1 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 0 })

      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ maxRound: null }])

      const req = createMockRequest()
      const result = await handlers.getMySchedule(undefined, req)

      expect(result.schedule).toEqual([])
      expect(result.totalCupRounds).toBe(0)
    })
  })

  describe('getResult', () => {
    it('returns single game result by id', async () => {
      const gameResult = {
        id: 1,
        goalsTeam1: 2,
        goalsTeam2: 1,
        team1: 'Team A',
        team2: 'Team B',
        isForfeit: 0
      }

      query.mockResolvedValue([gameResult])

      const result = await handlers.getResult(1)

      expect(result.result.isForfeit).toBe(false)
      expect(result.result.goalsTeam1).toBe(2)
    })

    it('returns isForfeit=true for forfeited games', async () => {
      query.mockResolvedValue([{
        id: 2,
        goalsTeam1: 3,
        goalsTeam2: 0,
        team1: 'Team A',
        team2: 'Empty FC',
        isForfeit: 1
      }])

      const result = await handlers.getResult(2)

      expect(result.result.isForfeit).toBe(true)
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

  describe('getLeagueStandingHistory', () => {
    it('returns empty matchDays and team list with empty positions when no games played', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const teams = [
        { id: 10, name: 'Team A', short_name: 'A', color: '#111111', emblem: null },
        { id: 11, name: 'Team B', short_name: 'B', color: '#222222', emblem: null }
      ]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([])      // no games
        .mockResolvedValueOnce(teams)   // teams by level/league fallback

      const req = createMockRequest()
      const result = await handlers.getLeagueStandingHistory(1, 1, 1, req)

      expect(result.matchDays).toEqual([])
      expect(result.teams).toEqual([
        { id: 10, name: 'Team A', color: '#111111', positions: [] },
        { id: 11, name: 'Team B', color: '#222222', positions: [] }
      ])
      expect(calculateStanding).not.toHaveBeenCalled()
    })

    it('computes positions for each match day from cumulative standings', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const games = [
        { team_1_id: 10, team_2_id: 11, goals_team_1: 1, goals_team_2: 0, is_forfeit: 0, match_day: 1 },
        { team_1_id: 10, team_2_id: 11, goals_team_1: 0, goals_team_2: 2, is_forfeit: 0, match_day: 2 }
      ]
      const teams = [
        { id: 10, name: 'Team A', short_name: 'A', color: '#111111', emblem: null },
        { id: 11, name: 'Team B', short_name: 'B', color: '#222222', emblem: null }
      ]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce(teams)

      // After md=1: A leads → 10 first, 11 second
      // After md=2: B leads → 11 first, 10 second
      calculateStanding
        .mockReturnValueOnce([{ team: teams[0] }, { team: teams[1] }])
        .mockReturnValueOnce([{ team: teams[1] }, { team: teams[0] }])

      const req = createMockRequest()
      const result = await handlers.getLeagueStandingHistory(1, 1, 1, req)

      expect(result.matchDays).toEqual([1, 2])
      const teamA = result.teams.find(t => t.id === 10)
      const teamB = result.teams.find(t => t.id === 11)
      expect(teamA.positions).toEqual([1, 2])
      expect(teamB.positions).toEqual([2, 1])
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const req = createMockRequest()
      await handlers.getLeagueStandingHistory(1, null, null, req)

      expect(query.mock.calls[0][1]).toEqual([1, 2, 3])
    })
  })

  describe('getCurrentGameday', () => {
    it('returns current game day and season with null label fields when no user', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query
        .mockResolvedValueOnce([])  // last played
        .mockResolvedValueOnce([])  // cup today
        .mockResolvedValueOnce([{ unplayedCount: 12 }])  // unplayed count

      const result = await handlers.getCurrentGameday()

      expect(result).toEqual({
        gameDay: 5,
        season: 1,
        cupRoundToday: null,
        userMatchDayToday: null,
        userNextMatchDay: null,
        isSeasonEnd: false
      })
    })

    it('flags isSeasonEnd when no unplayed games remain', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 42, season: 4 })
      query
        .mockResolvedValueOnce([])  // last played
        .mockResolvedValueOnce([])  // cup today
        .mockResolvedValueOnce([{ unplayedCount: 0 }])

      const result = await handlers.getCurrentGameday()

      expect(result.isSeasonEnd).toBe(true)
    })

    it('includes lastPlayedLeagueMatchDay when a league game has been played', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 6, season: 1 })
      query
        .mockResolvedValueOnce([{ game_day: 5, match_day: 4, season: 1 }])  // last played
        .mockResolvedValueOnce([])  // cup today
        .mockResolvedValueOnce([{ unplayedCount: 12 }])

      const result = await handlers.getCurrentGameday()

      expect(result.lastPlayedLeagueMatchDay).toBe(4)
      expect(result.lastPlayedLeagueSeason).toBe(1)
    })

    it('returns cupRoundToday when a cup game is scheduled on the current game day', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 22, season: 4 })
      query
        .mockResolvedValueOnce([])                       // last played
        .mockResolvedValueOnce([{ cup_round: 8 }])       // cup today
        .mockResolvedValueOnce([{ unplayedCount: 12 }])
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
        .mockResolvedValueOnce([{ unplayedCount: 12 }])

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
        .mockResolvedValueOnce([{ unplayedCount: 12 }])

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
        .mockResolvedValueOnce([{ unplayedCount: 12 }])

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
      // 1: past games (DESC by gameDay) — reversed by the route, so input is newest-first
      // 2: upcoming games (none here)
      // 3: distinct unplayed game_days for tick-offset math
      query
        .mockResolvedValueOnce([
          { id: 102, gameDay: 4 },
          { id: 101, gameDay: 3 },
          { id: 100, gameDay: 2 }
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getGamesForSlider(3, 0, req)

      expect(result.pastGames).toEqual([
        { id: 100, gameDay: 2 },
        { id: 101, gameDay: 3 },
        { id: 102, gameDay: 4 }
      ])
    })

    it('computes gameDate from tick-position when earlier game_days were skipped', async () => {
      // The cron always plays the lowest unplayed game_day next. When older
      // game_days were skipped or already played out of order (e.g. a league
      // round advanced past a stuck cup round), naively offsetting by
      // `game_day - currentGameDay` overshoots. The expected offset is the
      // ordinal position of the game in the sorted distinct unplayed days.
      const team = testData.team({ id: 7, level: 2, league: 0 })
      getTeam.mockResolvedValue(team)
      // Stuck cup round 2 on game_day 33 keeps "current game day" at 33 even
      // though league rounds 34 have already been played.
      getGameDayAndSeason.mockResolvedValue({ gameDay: 33, season: 4 })
      // 1: past games
      // 2: upcoming games for this team (game_day 35)
      // 3: distinct unplayed game_days {33 cup, 35 league, 36 league, ...}
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 999, gameDay: 35 }])
        .mockResolvedValueOnce([
          { game_day: 33 },
          { game_day: 35 },
          { game_day: 36 }
        ])

      const req = createMockRequest()
      const result = await handlers.getGamesForSlider(0, 1, req)

      // The user's next game is on game_day 35. Day 33 plays first (1 tick),
      // then day 35 plays — so the team's game is exactly 1 tick (12h) after
      // nextTick, not 2 ticks like the naive 35-33 math would yield.
      const expected = result.nextGameDate.getTime() + 12 * 60 * 60 * 1000
      expect(result.upcomingGames[0].gameDate.getTime()).toBe(expected)
    })
  })

  describe('getNextGameDate', () => {
    it('returns next-tick fallback for unauthenticated requests', async () => {
      const result = await handlers.getNextGameDate({})

      // Must return a Date in the future (within 24h)
      expect(result.date).toBeInstanceOf(Date)
      const delta = result.date.getTime() - Date.now()
      expect(delta).toBeGreaterThan(0)
      expect(delta).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
    })

    it('offsets by ticks-away, not raw game_day difference, when earlier days were skipped', async () => {
      // Repro for the bug: cup round 2 stuck on game_day 33 keeps the
      // "current game day" at 33 while league has already played day 34.
      // The user team's next league game is on game_day 35 — which actually
      // plays on the NEXT tick (after the stuck cup), not two ticks later.
      const team = testData.team({ id: 17, level: 2, league: 0 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 33, season: 4 })
      query.mockResolvedValueOnce([{ game_day: 35 }]) // team's next unplayed
      getTicksUntilGameDay.mockResolvedValue(1)

      const req = createMockRequest()
      const result = await handlers.getNextGameDate(req)

      expect(getTicksUntilGameDay).toHaveBeenCalledWith(4, 35)
      // Should be 12h (one tick) after the imminent tick, not 24h.
      // We don't know the exact nextTick clock value, but ticks-away of 1
      // means the offset from "now" is between 0 and 12h (if the imminent
      // tick is right now) or up to 24h (if the imminent tick is 12h away).
      // Asserting >12h and <=24h would be too loose — instead test that the
      // helper got the right inputs.
      expect(result.date).toBeInstanceOf(Date)
    })

    it('returns next-tick when the team has no scheduled games', async () => {
      const team = testData.team({ id: 17, level: 2, league: 0 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 33, season: 4 })
      query.mockResolvedValueOnce([]) // no upcoming games

      const req = createMockRequest()
      const result = await handlers.getNextGameDate(req)

      expect(getTicksUntilGameDay).not.toHaveBeenCalled()
      expect(result.date).toBeInstanceOf(Date)
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
