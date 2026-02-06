import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { cleanupOldFreePlayers } from '../../helper/playerHelper.js'

describe('playerHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cleanupOldFreePlayers', () => {
    it('deletes free players fired more than 6 game days ago', async () => {
      const freePlayer = { id: 1, name: 'Old Free Player', team_id: null }
      const firedHistory = { player_id: 1, type: 'FIRED', season: 1, game_day: 1 }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 }) // 9 days later
      query
        .mockResolvedValueOnce([freePlayer]) // Free players query
        .mockResolvedValueOnce([firedHistory]) // Player history query
        .mockResolvedValueOnce({}) // Delete player history
        .mockResolvedValueOnce({}) // Delete trade offers
        .mockResolvedValueOnce({}) // Delete player

      const result = await cleanupOldFreePlayers()

      expect(result).toBe(1)
      expect(query).toHaveBeenCalledWith('DELETE FROM player WHERE id = ?', [1])
    })

    it('does not delete free players fired less than 6 game days ago', async () => {
      const freePlayer = { id: 1, name: 'Recent Free Player', team_id: null }
      const firedHistory = { player_id: 1, type: 'FIRED', season: 1, game_day: 5 }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 8, season: 1 }) // 3 days later
      query
        .mockResolvedValueOnce([freePlayer]) // Free players query
        .mockResolvedValueOnce([firedHistory]) // Player history query

      const result = await cleanupOldFreePlayers()

      expect(result).toBe(0)
      expect(query).not.toHaveBeenCalledWith('DELETE FROM player WHERE id = ?', [1])
    })

    it('handles season changes correctly', async () => {
      const freePlayer = { id: 1, name: 'Cross Season Player', team_id: null }
      const firedHistory = { player_id: 1, type: 'FIRED', season: 0, game_day: 32 }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 }) // New season, day 5
      query
        .mockResolvedValueOnce([freePlayer]) // Free players query
        .mockResolvedValueOnce([firedHistory]) // Player history query
        .mockResolvedValueOnce({}) // Delete player history
        .mockResolvedValueOnce({}) // Delete trade offers
        .mockResolvedValueOnce({}) // Delete player

      const result = await cleanupOldFreePlayers()

      // 34 - 32 + 5 = 7 game days passed
      expect(result).toBe(1)
    })

    it('skips players without FIRED history', async () => {
      const freePlayer = { id: 1, name: 'Mystery Player', team_id: null }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query
        .mockResolvedValueOnce([freePlayer]) // Free players query
        .mockResolvedValueOnce([]) // No FIRED history

      const result = await cleanupOldFreePlayers()

      expect(result).toBe(0)
    })

    it('returns 0 when no free players exist', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([]) // No free players

      const result = await cleanupOldFreePlayers()

      expect(result).toBe(0)
    })

    it('deletes multiple expired free players', async () => {
      const freePlayers = [
        { id: 1, name: 'Old Player 1', team_id: null },
        { id: 2, name: 'Old Player 2', team_id: null }
      ]
      const firedHistory1 = { player_id: 1, type: 'FIRED', season: 1, game_day: 1 }
      const firedHistory2 = { player_id: 2, type: 'FIRED', season: 1, game_day: 2 }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query
        .mockResolvedValueOnce(freePlayers) // Free players query
        .mockResolvedValueOnce([firedHistory1]) // Player 1 history
        .mockResolvedValueOnce({}) // Delete player 1 history
        .mockResolvedValueOnce({}) // Delete player 1 offers
        .mockResolvedValueOnce({}) // Delete player 1
        .mockResolvedValueOnce([firedHistory2]) // Player 2 history
        .mockResolvedValueOnce({}) // Delete player 2 history
        .mockResolvedValueOnce({}) // Delete player 2 offers
        .mockResolvedValueOnce({}) // Delete player 2

      const result = await cleanupOldFreePlayers()

      expect(result).toBe(2)
    })
  })
})
