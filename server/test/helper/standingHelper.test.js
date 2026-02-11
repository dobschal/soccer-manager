import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

import { query } from '../../lib/database.js'
import { calculateStanding } from '../../lib/util.js'
import {
  getCachedStanding,
  saveStandingToCache,
  cacheStandingsForGameDay
} from '../../helper/standingHelper.js'

describe('standingHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCachedStanding', () => {
    it('returns null when no cache exists', async () => {
      query.mockResolvedValue([])

      const result = await getCachedStanding(1, 0, 0, 0)

      expect(result).toBeNull()
      expect(query).toHaveBeenCalledWith(
        'SELECT data FROM standing_cache WHERE season=? AND game_day=? AND level=? AND league=? LIMIT 1',
        [0, 1, 0, 0]
      )
    })

    it('returns parsed standing data when cache exists', async () => {
      const standing = [
        { team: { id: 1, name: 'Team A' }, points: 6, games: 2, goals: 4, against: 1 },
        { team: { id: 2, name: 'Team B' }, points: 3, games: 2, goals: 2, against: 3 }
      ]
      query.mockResolvedValue([{ data: JSON.stringify(standing) }])

      const result = await getCachedStanding(5, 1, 0, 0)

      expect(result).toEqual(standing)
      expect(query).toHaveBeenCalledWith(
        'SELECT data FROM standing_cache WHERE season=? AND game_day=? AND level=? AND league=? LIMIT 1',
        [1, 5, 0, 0]
      )
    })
  })

  describe('saveStandingToCache', () => {
    it('inserts standing data with ON DUPLICATE KEY UPDATE', async () => {
      const standing = [
        { team: { id: 1, name: 'Team A' }, points: 9, games: 3, goals: 6, against: 2 }
      ]
      query.mockResolvedValue({ affectedRows: 1 })

      await saveStandingToCache(3, 1, 0, 0, standing)

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO standing_cache'),
        [1, 3, 0, 0, JSON.stringify(standing)]
      )
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ON DUPLICATE KEY UPDATE'),
        expect.any(Array)
      )
    })
  })

  describe('cacheStandingsForGameDay', () => {
    it('caches standings for all leagues that played', async () => {
      const leagues = [
        { level: 0, league: 0 },
        { level: 1, league: 0 }
      ]
      const games = [
        { team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1 }
      ]
      const teams = [
        { id: 1, name: 'Team A' },
        { id: 2, name: 'Team B' }
      ]
      const standing = [
        { team: teams[0], points: 3, games: 1, goals: 2, against: 1 },
        { team: teams[1], points: 0, games: 1, goals: 1, against: 2 }
      ]

      query
        .mockResolvedValueOnce(leagues) // Get distinct leagues
        .mockResolvedValueOnce(games) // Get games for league 0
        .mockResolvedValueOnce(teams) // Get teams for league 0
        .mockResolvedValueOnce({ affectedRows: 1 }) // Save cache for league 0
        .mockResolvedValueOnce(games) // Get games for league 1
        .mockResolvedValueOnce(teams) // Get teams for league 1
        .mockResolvedValueOnce({ affectedRows: 1 }) // Save cache for league 1

      calculateStanding.mockReturnValue(standing)

      await cacheStandingsForGameDay(1, 0)

      expect(query).toHaveBeenCalledWith(
        'SELECT DISTINCT level, league FROM game WHERE season=? AND game_day=? AND played=1',
        [0, 1]
      )
      expect(calculateStanding).toHaveBeenCalledTimes(2)
    })

    it('skips leagues with no games', async () => {
      query
        .mockResolvedValueOnce([{ level: 0, league: 0 }]) // Get distinct leagues
        .mockResolvedValueOnce([]) // No games for this league

      await cacheStandingsForGameDay(1, 0)

      expect(calculateStanding).not.toHaveBeenCalled()
    })
  })
})
