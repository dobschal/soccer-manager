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
  getTotalRounds: vi.fn()
}))

vi.mock('../../lib/websocket.js', () => ({
  sendToUser: vi.fn().mockReturnValue(true)
}))

import { query } from '../../lib/database.js'
import { getTeam, getTeamById } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getTotalRounds } from '../../helper/cupHelper.js'
import { sendToUser } from '../../lib/websocket.js'
import { SERVER_EVENTS } from '../../../client/lib/serverEvents.js'
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
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 5 })
      query
        .mockResolvedValueOnce(players) // SELECT players
        .mockResolvedValueOnce([]) // SELECT player_season_stats

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
      getGameDayAndSeason.mockResolvedValue({ season: 0, gameDay: 5 })
      query
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce([]) // SELECT player_season_stats
        .mockResolvedValueOnce([user])

      const result = await handlers.getTeam(1)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).not.toHaveProperty('password')
    })

    it('#430 attaches current-season goals/games to each player', async () => {
      const team = testData.team({ user_id: null })
      const players = [testData.player({ id: 1 }), testData.player({ id: 2, name: 'Player 2' })]

      getTeamById.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 3, gameDay: 10 })
      query
        .mockResolvedValueOnce(players) // SELECT players
        .mockResolvedValueOnce([{ player_id: 1, goals: 7, games_played: 12 }]) // stats

      const result = await handlers.getTeam(1)

      const statsCall = query.mock.calls[1]
      expect(statsCall[0]).toContain('player_season_stats')
      expect(statsCall[1][0]).toBe(3) // current season
      expect(result.players[0].season_goals).toBe(7)
      expect(result.players[0].season_games).toBe(12)
      // player without stats falls back to 0/0
      expect(result.players[1].season_goals).toBe(0)
      expect(result.players[1].season_games).toBe(0)
    })
  })

  describe('updateTeamName', () => {
    it('trims whitespace and updates the team name', async () => {
      const team = testData.team({ id: 7, level: 2, league: 1 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 4, gameDay: 1 })
      query
        .mockResolvedValueOnce([]) // uniqueness check returns no row
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // DELETE standing_cache

      const req = createMockRequest()
      const result = await handlers.updateTeamName('  FC   Berlin  ', '', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenNthCalledWith(
        2,
        'UPDATE team SET name=?, short_name=? WHERE id=?',
        ['FC Berlin', null, team.id]
      )
    })

    it('stores a user-provided short name when given', async () => {
      const team = testData.team({ id: 7, level: 2, league: 1 })
      getTeam.mockResolvedValue(team)
      getGameDayAndSeason.mockResolvedValue({ season: 4, gameDay: 1 })
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})

      const req = createMockRequest()
      await handlers.updateTeamName('FC Berlin', '  BSC  ', req)

      expect(query).toHaveBeenNthCalledWith(
        2,
        'UPDATE team SET name=?, short_name=? WHERE id=?',
        ['FC Berlin', 'BSC', team.id]
      )
    })

    it('rejects an empty name', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updateTeamName('   ', '', req))
        .rejects.toMatchObject({ message: 'Team name is required' })
    })

    it('rejects a word longer than 12 characters', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updateTeamName('FC Wolverhampton', '', req))
        .rejects.toMatchObject({ message: 'Each word can be at most 12 characters' })
    })

    it('rejects a name longer than 32 characters', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updateTeamName('AAA BBB CCC DDD EEE FFF GGG HHHHH', '', req))
        .rejects.toMatchObject({ message: 'Team name can be at most 32 characters' })
    })

    it('rejects a short name longer than 12 characters', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.updateTeamName('FC Berlin', 'AAAAAAAAAAAAA', req))
        .rejects.toMatchObject({ message: 'Short name can be at most 12 characters' })
    })

    it('rejects a duplicate name', async () => {
      const team = testData.team({ id: 7 })
      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([{ id: 42 }]) // duplicate found

      const req = createMockRequest()

      await expect(handlers.updateTeamName('FC Berlin', '', req))
        .rejects.toMatchObject({ message: 'A team with this name already exists' })
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

      expect(result).toEqual({ success: true, captainCleared: false })
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

    it('clears captain when captain is removed from lineup', async () => {
      const team = testData.team({ captain_id: 2 })
      const players = [
        testData.player({ id: 1, in_game_position: 'GK' }),
        testData.player({ id: 2, in_game_position: 'CB' })
      ]
      // Captain (id=2) removed from lineup
      const updatedPlayers = [
        { id: 1, in_game_position: 'GK' },
        { id: 2, in_game_position: '' }
      ]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)
        .mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.saveLineup(updatedPlayers, '4-3-3', req)

      expect(result).toEqual({ success: true, captainCleared: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET captain_id=NULL WHERE id=?', [team.id])
    })

    it('keeps captain when captain stays in lineup', async () => {
      const team = testData.team({ captain_id: 1 })
      const players = [
        testData.player({ id: 1, in_game_position: 'GK' }),
        testData.player({ id: 2, in_game_position: 'CB' })
      ]
      const updatedPlayers = [
        { id: 1, in_game_position: 'GK' },
        { id: 2, in_game_position: 'CB' }
      ]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)
        .mockResolvedValue({})

      const req = createMockRequest()
      await handlers.saveLineup(updatedPlayers, '4-3-3', req)

      // Should NOT have called the captain clear query
      const captainClearCalls = query.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('captain_id=NULL')
      )
      expect(captainClearCalls).toHaveLength(0)
    })
  })

  describe('setCaptain', () => {
    it('sets a player as captain', async () => {
      const team = testData.team()
      const player = testData.player({ id: 5, team_id: 1, in_game_position: 'CM' })

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([player]) // SELECT player
        .mockResolvedValueOnce({}) // UPDATE team

      const req = createMockRequest()
      const result = await handlers.setCaptain(5, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET captain_id=? WHERE id=?', [5, team.id])
    })

    it('clears captain when null is passed', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.setCaptain(null, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET captain_id=? WHERE id=?', [null, team.id])
    })

    it('rejects player not in team', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([]) // No player found

      const req = createMockRequest()
      await expect(handlers.setCaptain(99, req))
        .rejects.toMatchObject({ message: 'Player not found in your team' })
    })

    it('rejects player not in lineup', async () => {
      const team = testData.team()
      const player = testData.player({ id: 5, team_id: 1, in_game_position: '' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([player])

      const req = createMockRequest()
      await expect(handlers.setCaptain(5, req))
        .rejects.toMatchObject({ message: 'Captain must be in the lineup' })
    })

    it('sends CAPTAIN_CHANGED to the team\'s user so the client updates atomically', async () => {
      const team = testData.team({ user_id: 77 })
      const player = testData.player({ id: 5, team_id: 1, in_game_position: 'CM' })

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([player])
        .mockResolvedValueOnce({})

      const req = createMockRequest()
      await handlers.setCaptain(5, req)

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.CAPTAIN_CHANGED.name, { captainId: 5 })
    })

    it('also fires CAPTAIN_CHANGED with null when the captain is cleared', async () => {
      const team = testData.team({ user_id: 77 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.setCaptain(null, req)

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.CAPTAIN_CHANGED.name, { captainId: null })
    })

    it('skips the websocket for teams without a user (bot teams)', async () => {
      const team = testData.team({ user_id: null })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.setCaptain(null, req)

      expect(sendToUser).not.toHaveBeenCalled()
    })
  })

  describe('getTeamSeasonHistory', () => {
    it('returns correct position and points for a completed season', async () => {
      const teamId = 5
      const team = testData.team({ id: teamId, level: 1, league: 0 })

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
        // bulk: all league games
        .mockResolvedValueOnce(games)
        // bulk: all cup games for this team
        .mockResolvedValueOnce([])
        // bulk: max cup_round per season
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
      getTotalRounds.mockReturnValue(3)

      query
        .mockResolvedValueOnce([{ season: 0, level: 0, league: 0 }]) // seasonData
        .mockResolvedValueOnce(games) // bulk: all league games
        .mockResolvedValueOnce(cupGames) // bulk: all cup games
        .mockResolvedValueOnce([{ season: 0, maxRound: 4 }]) // bulk: max cup_round per season

      const result = await handlers.getTeamSeasonHistory(teamId)

      expect(result.seasons[0].cupResult).toBeDefined()
      expect(result.seasons[0].cupResult.roundReached).toBe(2)
      expect(result.seasons[0].cupResult.totalRounds).toBe(3)
      expect(result.seasons[0].cupResult.gamesPlayed).toBe(2)
    })
  })

  describe('getTeamTimelineGames', () => {
    function makeGameRow (overrides = {}) {
      return {
        id: 1,
        season: 0,
        game_day: 1,
        game_type: 'league',
        cup_round: null,
        played: 1,
        goals_team_1: 2,
        goals_team_2: 1,
        team_1_id: 5,
        team_2_id: 6,
        level: 1,
        league: 0,
        team_1_name: 'Home FC',
        team_1_color: '#fff',
        team_1_emblem: '',
        team_1_is_system_team: 0,
        team_2_name: 'Away FC',
        team_2_color: '#000',
        team_2_emblem: '',
        team_2_is_system_team: 0,
        ...overrides
      }
    }

    it('rejects invalid teamId', async () => {
      await expect(handlers.getTeamTimelineGames(0, 'initial', null, null, 10))
        .rejects.toMatchObject({ message: 'Invalid teamId' })
    })

    it('initial mode merges past (DESC then reversed) and future (ASC) games', async () => {
      const teamId = 5
      // Past: 2 played games, returned DESC then reversed to ASC
      const pastDesc = [
        makeGameRow({ id: 20, season: 1, game_day: 4, played: 1, goals_team_1: 3, goals_team_2: 0 }),
        makeGameRow({ id: 10, season: 1, game_day: 2, played: 1, goals_team_1: 1, goals_team_2: 1 })
      ]
      // Future: 1 unplayed game, ASC
      const futureAsc = [
        makeGameRow({ id: 30, season: 1, game_day: 6, played: 0, goals_team_1: 0, goals_team_2: 0 })
      ]

      query
        .mockResolvedValueOnce(pastDesc) // past query
        .mockResolvedValueOnce(futureAsc) // future query

      const result = await handlers.getTeamTimelineGames(teamId, 'initial', null, null, 4)

      expect(result.games).toHaveLength(3)
      expect(result.games.map(g => g.id)).toEqual([10, 20, 30])
      expect(result.games[0].result).toBe('draw')
      expect(result.games[1].result).toBe('win')
      expect(result.games[2].played).toBe(false)
      expect(result.games[2].result).toBeNull()
    })

    it('past mode requires cursor and orders DESC then reverses to ASC', async () => {
      const teamId = 5
      await expect(handlers.getTeamTimelineGames(teamId, 'past', null, null, 10))
        .rejects.toMatchObject({ message: 'Cursor required' })

      const rowsDesc = [
        makeGameRow({ id: 9, season: 1, game_day: 3 }),
        makeGameRow({ id: 8, season: 1, game_day: 2 })
      ]
      query.mockResolvedValueOnce(rowsDesc)

      const result = await handlers.getTeamTimelineGames(teamId, 'past', 1, 5, 10)
      expect(result.games.map(g => g.id)).toEqual([8, 9])
    })

    it('future mode requires cursor and orders ASC', async () => {
      const teamId = 5
      await expect(handlers.getTeamTimelineGames(teamId, 'future', null, null, 10))
        .rejects.toMatchObject({ message: 'Cursor required' })

      const rowsAsc = [
        makeGameRow({ id: 11, season: 1, game_day: 6, played: 0 }),
        makeGameRow({ id: 12, season: 1, game_day: 7, played: 0 })
      ]
      query.mockResolvedValueOnce(rowsAsc)

      const result = await handlers.getTeamTimelineGames(teamId, 'future', 1, 5, 10)
      expect(result.games.map(g => g.id)).toEqual([11, 12])
      expect(result.games.every(g => g.played === false)).toBe(true)
    })

    it('includes cup games with totalRounds derived from the season', async () => {
      const teamId = 5
      const rowsDesc = [
        makeGameRow({ id: 50, game_type: 'cup', cup_round: 4, season: 1, game_day: 5, played: 1, goals_team_1: 2, goals_team_2: 0 })
      ]
      query
        .mockResolvedValueOnce(rowsDesc) // past
        .mockResolvedValueOnce([]) // future
        .mockResolvedValueOnce([{ season: 1, maxRound: 8 }]) // max cup_round per season
      getTotalRounds.mockReturnValue(4)

      const result = await handlers.getTeamTimelineGames(teamId, 'initial', null, null, 4)
      expect(result.games).toHaveLength(1)
      expect(result.games[0].gameType).toBe('cup')
      expect(result.games[0].cupRound).toBe(4)
      expect(result.games[0].totalRounds).toBe(4)
    })

    it('marks opponent and isHome flag correctly', async () => {
      const teamId = 5
      const homeRow = makeGameRow({ id: 1, team_1_id: 5, team_2_id: 6, played: 1, goals_team_1: 1, goals_team_2: 2 })
      const awayRow = makeGameRow({ id: 2, team_1_id: 7, team_2_id: 5, played: 1, goals_team_1: 0, goals_team_2: 3 })

      query
        .mockResolvedValueOnce([homeRow, awayRow].reverse()) // past DESC
        .mockResolvedValueOnce([]) // future

      const result = await handlers.getTeamTimelineGames(teamId, 'initial', null, null, 4)
      const game1 = result.games.find(g => g.id === 1)
      const game2 = result.games.find(g => g.id === 2)
      expect(game1.isHome).toBe(true)
      expect(game1.opponent.id).toBe(6)
      expect(game1.result).toBe('loss')
      expect(game2.isHome).toBe(false)
      expect(game2.opponent.id).toBe(7)
      expect(game2.result).toBe('win')
    })

    it('clamps limit to a safe range', async () => {
      const teamId = 5
      query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      await handlers.getTeamTimelineGames(teamId, 'initial', null, null, 9999)
      // The past and future queries each receive halfLimit (capped at 25)
      const lastParam = query.mock.calls[0][1].at(-1)
      expect(lastParam).toBeLessThanOrEqual(50)
    })
  })

  describe('getHeadToHead', () => {
    it('aggregates wins, draws, losses and goals for both teams', async () => {
      getTeamById
        .mockResolvedValueOnce({ id: 1, name: 'FC A', color: '#aaa', emblem: 'A' })
        .mockResolvedValueOnce({ id: 2, name: 'FC B', color: '#bbb', emblem: 'B' })
      query.mockResolvedValueOnce([
        // A home wins 3:1
        { id: 100, season: 5, game_day: 10, game_type: 'league', cup_round: null, played: 1, goals_team_1: 3, goals_team_2: 1, team_1_id: 1, team_2_id: 2, created_at: '2026-06-01T10:00:00Z', team_1_name: 'FC A', team_1_color: '#aaa', team_1_emblem: 'A', team_2_name: 'FC B', team_2_color: '#bbb', team_2_emblem: 'B' },
        // B home wins 2:0 (A is team_2)
        { id: 101, season: 5, game_day: 12, game_type: 'league', cup_round: null, played: 1, goals_team_1: 2, goals_team_2: 0, team_1_id: 2, team_2_id: 1, created_at: '2026-06-02T10:00:00Z', team_1_name: 'FC B', team_1_color: '#bbb', team_1_emblem: 'B', team_2_name: 'FC A', team_2_color: '#aaa', team_2_emblem: 'A' },
        // Draw 1:1
        { id: 102, season: 6, game_day: 1, game_type: 'cup', cup_round: 4, played: 1, goals_team_1: 1, goals_team_2: 1, team_1_id: 1, team_2_id: 2, created_at: '2026-06-03T10:00:00Z', team_1_name: 'FC A', team_1_color: '#aaa', team_1_emblem: 'A', team_2_name: 'FC B', team_2_color: '#bbb', team_2_emblem: 'B' }
      ])

      const result = await handlers.getHeadToHead(1, 2)

      expect(result.stats).toEqual({ winsA: 1, winsB: 1, draws: 1, goalsA: 4, goalsB: 4, totalGames: 3 })
      expect(result.teamA.name).toBe('FC A')
      expect(result.teamB.name).toBe('FC B')
      expect(result.games).toHaveLength(3)
    })

    it('returns empty stats when teams have never played', async () => {
      getTeamById
        .mockResolvedValueOnce({ id: 1, name: 'A' })
        .mockResolvedValueOnce({ id: 2, name: 'B' })
      query.mockResolvedValueOnce([])

      const result = await handlers.getHeadToHead(1, 2)
      expect(result.stats.totalGames).toBe(0)
      expect(result.games).toEqual([])
    })

    it('rejects invalid team ids', async () => {
      await expect(handlers.getHeadToHead(0, 5)).rejects.toMatchObject({ message: 'Invalid team ids' })
      await expect(handlers.getHeadToHead(5, 5)).rejects.toMatchObject({ message: 'Invalid team ids' })
    })
  })
})
