import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn(),
  getConnection: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn(),
  getTeamById: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key) => key)
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../lib/errors.js', () => ({
  BadRequestError: class BadRequestError {
    constructor (message) {
      this.message = message
      this.status = 400
    }
  },
  UnauthorizedError: class UnauthorizedError {
    constructor (message) {
      this.message = message
      this.status = 401
    }
  }
}))

import { query } from '../../lib/database.js'
import { getTeam, getTeamById } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import handlers from '../../routes/friendly.js'

describe('friendly routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('playFriendlyMatch', () => {
    it('throws error if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.playFriendlyMatch(2, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('throws error if opponent team not found', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1 })

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(null)

      await expect(handlers.playFriendlyMatch(999, req))
        .rejects.toMatchObject({ message: 'Opponent team not found' })
    })

    it('throws error if playing against own team', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1 })

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(myTeam)

      await expect(handlers.playFriendlyMatch(1, req))
        .rejects.toMatchObject({ message: 'Cannot play against your own team' })
    })

    it('throws error if already played friendly today', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1 })
      const opponentTeam = testData.team({ id: 2, user_id: null, name: 'Opponent FC' })

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(opponentTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce([{ id: 100 }]) // Existing friendly game

      await expect(handlers.playFriendlyMatch(2, req))
        .rejects.toMatchObject({ message: 'You can only play one friendly match per game day' })
    })

    it('plays a friendly match successfully', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1, name: 'My FC' })
      const opponentTeam = testData.team({ id: 2, user_id: null, name: 'Opponent FC' })
      const stadium = testData.stadium({ team_id: 1 })

      // Create lineup of 11 players for each team
      const myPlayers = Array.from({ length: 11 }, (_, i) =>
        testData.player({
          id: i + 1,
          team_id: 1,
          position: i === 0 ? 'GK' : 'CM',
          in_game_position: i === 0 ? 'GK' : 'CM',
          freshness: 1,
          level: 5
        })
      )
      const opponentPlayers = Array.from({ length: 11 }, (_, i) =>
        testData.player({
          id: i + 100,
          team_id: 2,
          position: i === 0 ? 'GK' : 'CM',
          in_game_position: i === 0 ? 'GK' : 'CM',
          freshness: 1,
          level: 5
        })
      )

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(opponentTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      query
        .mockResolvedValueOnce([]) // No existing friendly
        .mockResolvedValueOnce(myPlayers) // My team players
        .mockResolvedValueOnce(opponentPlayers) // Opponent players
        .mockResolvedValueOnce([stadium]) // Stadium
      // 11 freshness update queries (user's team only, opponent not affected)
      for (let i = 0; i < 11; i++) query.mockResolvedValueOnce()
      query.mockResolvedValueOnce({ insertId: 999 }) // Insert game

      updateTeamBalance.mockResolvedValue()

      const result = await handlers.playFriendlyMatch(2, req)

      expect(result.game).toBeDefined()
      expect(result.game.team1Id).toBe(1)
      expect(result.game.team2Id).toBe(2)
      expect(result.game.isFriendly).toBe(true)
      expect(typeof result.game.goalsTeam1).toBe('number')
      expect(typeof result.game.goalsTeam2).toBe('number')
    })

    it('does not sell out the stadium at high ticket prices', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1, name: 'My FC' })
      const opponentTeam = testData.team({ id: 2, user_id: null, name: 'Opponent FC' })
      const standSize = 200
      const price = 30
      const stadium = testData.stadium({
        team_id: 1,
        north_stand_size: standSize,
        south_stand_size: standSize,
        east_stand_size: standSize,
        west_stand_size: standSize,
        north_stand_price: price,
        south_stand_price: price,
        east_stand_price: price,
        west_stand_price: price
      })

      const myPlayers = Array.from({ length: 11 }, (_, i) =>
        testData.player({
          id: i + 1,
          team_id: 1,
          position: i === 0 ? 'GK' : 'CM',
          in_game_position: i === 0 ? 'GK' : 'CM',
          freshness: 1,
          level: 5
        })
      )
      const opponentPlayers = Array.from({ length: 11 }, (_, i) =>
        testData.player({
          id: i + 100,
          team_id: 2,
          position: i === 0 ? 'GK' : 'CM',
          in_game_position: i === 0 ? 'GK' : 'CM',
          freshness: 1,
          level: 5
        })
      )

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(opponentTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(myPlayers)
        .mockResolvedValueOnce(opponentPlayers)
        .mockResolvedValueOnce([stadium])
      for (let i = 0; i < 11; i++) query.mockResolvedValueOnce()
      query.mockResolvedValueOnce({ insertId: 999 })

      updateTeamBalance.mockResolvedValue()

      const result = await handlers.playFriendlyMatch(2, req)
      const stadiumDetails = result.game.details.stadiumDetails

      // With strength 55 vs 55 and price=30 the stands must not fill up. If the
      // strength factor is not normalized, attendance caps at stand size and
      // every stand sells out regardless of price.
      for (const stand of ['north', 'south', 'east', 'west']) {
        expect(stadiumDetails[`${stand}Guests`]).toBeLessThan(standSize)
      }

      // Total earnings paid out must reflect the actual (non-sold-out) attendance.
      const soldOutEarnings = 4 * standSize * price
      const earnings = updateTeamBalance.mock.calls[0][1]
      expect(earnings).toBeLessThan(soldOutEarnings)
    })

    it('auto-fills an empty starting lineup so the stadium still earns ticket income', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1, user_id: 1, name: 'My FC', formation: '442a' })
      const opponentTeam = testData.team({ id: 2, user_id: null, name: 'Opponent FC', formation: '442a' })
      const stadium = testData.stadium({ team_id: 1 })

      const formationPositions = ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'RM', 'OM', 'LA', 'RA']
      const benchPlayers = formationPositions.map((pos, i) =>
        testData.player({
          id: i + 1,
          team_id: 1,
          position: pos,
          in_game_position: '',
          freshness: 1,
          level: 5,
          is_suspended: 0,
          is_injured: 0
        })
      )
      const opponentPlayers = formationPositions.map((pos, i) =>
        testData.player({
          id: i + 100,
          team_id: 2,
          position: pos,
          in_game_position: pos,
          freshness: 1,
          level: 5
        })
      )

      getTeam.mockResolvedValue(myTeam)
      getTeamById.mockResolvedValue(opponentTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      query.mockImplementation(async (sql, params) => {
        // Existing friendly check
        if (sql.includes('SELECT * FROM game') && sql.includes("game_type = 'friendly'")) return []
        // Initial lineup query for either team (no players with in_game_position set on my team)
        if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes('in_game_position<>')) {
          if (params[0] === 1) return []
          if (params[0] === 2) return opponentPlayers.map(p => ({ ...p }))
        }
        // Bench query used by autoFillLineup
        if (sql.includes('SELECT * FROM player WHERE team_id=?') && sql.includes("in_game_position=''")) {
          if (params[0] === 1) return benchPlayers.map(p => ({ ...p }))
          return []
        }
        if (sql.includes('SELECT * FROM stadium')) return [stadium]
        if (sql.startsWith('UPDATE player')) return { affectedRows: 1 }
        if (sql.startsWith('INSERT INTO game')) return { insertId: 999 }
        return []
      })

      updateTeamBalance.mockResolvedValue()

      const result = await handlers.playFriendlyMatch(2, req)

      // Auto-fill must have promoted all 11 bench players into the lineup
      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET in_game_position=? WHERE id=?',
        expect.arrayContaining([expect.any(String), expect.any(Number)])
      )

      // Each missing position must produce a log message for the user
      expect(addLogMessage).toHaveBeenCalled()

      // After auto-fill the home team's strength must be > 0, so stadium earnings are paid out.
      expect(updateTeamBalance).toHaveBeenCalledTimes(1)
      const earningsArg = updateTeamBalance.mock.calls[0][1]
      expect(earningsArg).toBeGreaterThan(0)

      // The game must still be recorded as a played friendly with usable details.
      expect(result.game.isFriendly).toBe(true)
      expect(result.game.details.strengthTeamA).toBeGreaterThan(0)
    })
  })

  describe('canPlayFriendlyToday', () => {
    it('throws error if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.canPlayFriendlyToday(req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns canPlay: true if no friendly played today', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1 })

      getTeam.mockResolvedValue(myTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce([]) // No existing friendly

      const result = await handlers.canPlayFriendlyToday(req)

      expect(result).toEqual({ canPlay: true })
    })

    it('returns canPlay: false if already played today', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1 })

      getTeam.mockResolvedValue(myTeam)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce([{ id: 100 }]) // Existing friendly

      const result = await handlers.canPlayFriendlyToday(req)

      expect(result).toEqual({ canPlay: false, reason: 'alreadyPlayed' })
    })
  })

  describe('getFriendlyGames', () => {
    it('throws error if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.getFriendlyGames(10, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns empty array if no friendly games', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1 })

      getTeam.mockResolvedValue(myTeam)
      query.mockResolvedValueOnce([])

      const result = await handlers.getFriendlyGames(10, req)

      expect(result).toEqual({ games: [] })
    })

    it('returns friendly games for the team', async () => {
      const req = createMockRequest()
      const myTeam = testData.team({ id: 1 })
      const games = [
        {
          id: 1,
          gameDay: 5,
          season: 1,
          goalsTeam1: 2,
          goalsTeam2: 1,
          team1: 'My FC',
          team2: 'Opponent FC',
          team1Id: 1,
          team2Id: 2,
          team1Color: '#FF0000',
          team2Color: '#0000FF'
        }
      ]

      getTeam.mockResolvedValue(myTeam)
      query.mockResolvedValueOnce(games)

      const result = await handlers.getFriendlyGames(10, req)

      expect(result.games).toHaveLength(1)
      expect(result.games[0].id).toBe(1)
    })
  })
})
