import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn(),
  getTeamById: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/cupHelper.js', () => ({
  getTotalRoundsForSeason: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam, getTeamById } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getTotalRoundsForSeason } from '../../helper/cupHelper.js'
import handlers from '../../routes/team.js'

describe('team routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMyTeam', () => {
    it('returns team, players, and user for authenticated user', async () => {
      const team = testData.team()
      const players = [testData.player(), testData.player({ id: 2, name: 'Player 2' })]
      const user = testData.user()

      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 5 })
      query
        .mockResolvedValueOnce(players) // SELECT players
        .mockResolvedValueOnce([]) // SELECT player_season_stats

      const req = createMockRequest({ user })
      const result = await handlers.getMyTeam(req)

      expect(result.team).toEqual(team)
      expect(result.players).toHaveLength(2)
      expect(result.user).not.toHaveProperty('password')
    })
  })

  describe('getMyBalance', () => {
    it('returns balance for authenticated user', async () => {
      const team = testData.team({ balance: 123456 })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()
      const result = await handlers.getMyBalance(req)

      expect(result).toEqual({ balance: 123456 })
    })
  })

  describe('updateColor', () => {
    it('updates team color', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updateColor('#00FF00', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET color=? WHERE id=?', ['#00FF00', team.id])
    })
  })

  describe('getTeam', () => {
    it('returns team and players by team id', async () => {
      const team = testData.team({ user_id: null })
      const players = [testData.player()]

      getTeamById.mockResolvedValue(team)
      query.mockResolvedValue(players)

      const result = await handlers.getTeam(1)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).toBeUndefined()
    })

    it('returns team, players, and user when team has user', async () => {
      const team = testData.team({ user_id: 1 })
      const players = [testData.player()]
      const user = testData.user()

      getTeamById.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce([user])

      const result = await handlers.getTeam(1)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).not.toHaveProperty('password')
    })
  })

  describe('updatePassStyle', () => {
    it('updates team pass style', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updatePassStyle('long', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET pass_style=? WHERE id=?', ['long', team.id])
    })

    it('rejects invalid pass style', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updatePassStyle('invalid', req))
        .rejects.toMatchObject({ message: 'Invalid pass style' })
    })
  })

  describe('updatePlayStyle', () => {
    it('updates team play style to aggressive', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updatePlayStyle('aggressive', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET play_style=? WHERE id=?', ['aggressive', team.id])
    })

    it('updates team play style to friendly', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updatePlayStyle('friendly', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET play_style=? WHERE id=?', ['friendly', team.id])
    })

    it('updates team play style to normal', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updatePlayStyle('normal', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET play_style=? WHERE id=?', ['normal', team.id])
    })

    it('rejects invalid play style', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updatePlayStyle('invalid', req))
        .rejects.toMatchObject({ message: 'Invalid play style' })
    })

    it('rejects empty play style', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updatePlayStyle('', req))
        .rejects.toMatchObject({ message: 'Invalid play style' })
    })
  })

  describe('saveLineup', () => {
    it('updates player positions and formation', async () => {
      const team = testData.team()
      const players = [
        testData.player({ id: 1, in_game_position: 'GK' }),
        testData.player({ id: 2, in_game_position: 'CB' })
      ]
      const updatedPlayers = [
        { id: 1, in_game_position: 'GK' },
        { id: 2, in_game_position: 'LB' }
      ]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)
        .mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.saveLineup(updatedPlayers, '4-3-3', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET formation=? WHERE id=?', ['4-3-3', team.id])
    })

    it('throws error for unknown player', async () => {
      const team = testData.team()
      const players = [testData.player({ id: 1 })]
      const updatedPlayers = [{ id: 999, in_game_position: 'GK' }]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)

      const req = createMockRequest()

      await expect(handlers.saveLineup(updatedPlayers, '4-3-3', req))
        .rejects.toMatchObject({ message: 'Unknown player...' })
    })
  })

  describe('getTeamSeasonHistory', () => {
    it('returns correct position and points for a completed season', async () => {
      const teamId = 5
      const team = testData.team({ id: teamId, level: 1, league: 0 })

      // Team played at level 1, league 0 during season 0
      const leagueTeams = Array.from({ length: 18 }, (_, i) => ({
        id: i + 1, name: `Team ${i + 1}`, level: 1, league: 0
      }))

      // Create games where team 5 wins most games
      const games = []
      for (let i = 0; i < 18; i++) {
        for (let j = i + 1; j < 18; j++) {
          games.push({
            team_1_id: i + 1,
            team_2_id: j + 1,
            goals_team_1: i + 1 === teamId ? 3 : 1,
            goals_team_2: j + 1 === teamId ? 3 : 1,
            season: 0, level: 1, league: 0, played: 1, game_day: 0,
            game_type: 'league'
          })
        }
      }

      getTeamById.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1, gameDay: 0 })

      query
        // seasonData: DISTINCT season/level/league (league games only)
        .mockResolvedValueOnce([{ season: 0, level: 1, league: 0 }])
        // lastGameDay
        .mockResolvedValueOnce([{ lastGameDay: 33 }])
        // games for standing
        .mockResolvedValueOnce(games)
        // teams for standing
        .mockResolvedValueOnce(leagueTeams)
        // cup games
        .mockResolvedValueOnce([])

      const result = await handlers.getTeamSeasonHistory(teamId)

      expect(result.seasons).toHaveLength(1)
      expect(result.seasons[0].position).toBeGreaterThan(0)
      expect(result.seasons[0].points).toBeGreaterThan(0)
      expect(result.seasons[0].season).toBe(0)
      expect(result.seasons[0].level).toBe(1)
      expect(result.seasons[0].league).toBe(0)
    })

    it('excludes cup games from season data query to prevent wrong level/league', async () => {
      const teamId = 5
      const team = testData.team({ id: teamId, level: 1, league: 0 })

      getTeamById.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1, gameDay: 0 })

      // Return no seasons so the loop doesn't run
      query.mockResolvedValueOnce([])

      await handlers.getTeamSeasonHistory(teamId)

      // Verify the seasonData query filters for league games
      const seasonDataCall = query.mock.calls[0]
      expect(seasonDataCall[0]).toContain('game_type')
      expect(seasonDataCall[0]).toContain("game_type = 'league'")
    })

    it('returns empty seasons when team has no completed seasons', async () => {
      const team = testData.team({ id: 1 })

      getTeamById.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 5 })

      query.mockResolvedValueOnce([]) // no completed seasons

      const result = await handlers.getTeamSeasonHistory(1)

      expect(result.seasons).toEqual([])
    })

    it('returns empty seasons when team does not exist', async () => {
      getTeamById.mockResolvedValue(null)

      const result = await handlers.getTeamSeasonHistory(999)

      expect(result.seasons).toEqual([])
    })

    it('includes cup results when team participated in cup', async () => {
      const teamId = 1
      const team = testData.team({ id: teamId })
      const leagueTeams = [
        { id: 1, name: 'Team 1', level: 0, league: 0 },
        { id: 2, name: 'Team 2', level: 0, league: 0 }
      ]

      const games = [
        { team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1, season: 0, level: 0, league: 0, played: 1, game_day: 0, game_type: 'league' }
      ]

      // Ordered by cup_round ASC (as the SQL query returns): smallest = deepest round reached
      const cupGames = [
        { id: 11, team_1_id: 1, team_2_id: 4, goals_team_1: 1, goals_team_2: 2, season: 0, level: 0, league: 0, played: 1, game_day: 10, game_type: 'cup', cup_round: 2 },
        { id: 10, team_1_id: 1, team_2_id: 3, goals_team_1: 2, goals_team_2: 0, season: 0, level: 0, league: 0, played: 1, game_day: 5, game_type: 'cup', cup_round: 4 }
      ]

      getTeamById.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 1, gameDay: 0 })
      getTotalRoundsForSeason.mockResolvedValue(3)

      query
        .mockResolvedValueOnce([{ season: 0, level: 0, league: 0 }]) // seasonData
        .mockResolvedValueOnce([{ lastGameDay: 33 }]) // lastGameDay
        .mockResolvedValueOnce(games) // league games
        .mockResolvedValueOnce(leagueTeams) // teams
        .mockResolvedValueOnce(cupGames) // cup games

      const result = await handlers.getTeamSeasonHistory(teamId)

      expect(result.seasons[0].cupResult).toBeDefined()
      expect(result.seasons[0].cupResult.roundReached).toBe(2)
      expect(result.seasons[0].cupResult.totalRounds).toBe(3)
      expect(result.seasons[0].cupResult.gamesPlayed).toBe(2)
    })
  })
})
