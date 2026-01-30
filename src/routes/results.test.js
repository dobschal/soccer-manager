import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { calculateStanding } from '../lib/util.js'
import handlers from './results.js'

describe('results routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getResults', () => {
    it('returns results for specified game day and season', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const results = [
        { id: 1, goalsTeam1: 2, goalsTeam2: 1, team1: 'Team A', team2: 'Team B' }
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(results)

      const req = createMockRequest()
      const result = await handlers.getResults(5, 1, 1, 1, req)

      expect(result).toEqual({ results })
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      await handlers.getResults(5, 1, null, null, req)

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [5, 1, 2, 3]
      )
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
    it('returns standing for specified league', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const games = [testData.gameResult()]
      const teams = [testData.team({ id: 1 }), testData.team({ id: 2 })]
      const standing = [{ team_id: 1, points: 3 }]

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce(teams)
      calculateStanding.mockReturnValue(standing)

      const req = createMockRequest()
      const result = await handlers.getStanding(5, 1, 1, 1, req)

      expect(result).toEqual(standing)
      expect(calculateStanding).toHaveBeenCalledWith(games, teams)
    })

    it('uses team level and league when not specified', async () => {
      const team = testData.team({ level: 2, league: 3 })

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      calculateStanding.mockReturnValue([])

      const req = createMockRequest()
      await handlers.getStanding(5, 1, null, null, req)

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [5, 1, 2, 3]
      )
    })

    it('fetches teams by level/league when no games played', async () => {
      const team = testData.team({ level: 1, league: 1 })
      const teams = [testData.team()]

      getTeam.mockResolvedValue(team)
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
    })
  })

  describe('getCurrentGameday', () => {
    it('returns current game day and season', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      const result = await handlers.getCurrentGameday()

      expect(result).toEqual({ gameDay: 5, season: 1 })
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
  })
})
