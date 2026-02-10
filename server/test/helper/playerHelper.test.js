import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({
  generateRandomPlayerName: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  randomItem: vi.fn((arr) => arr[0])
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { generateRandomPlayerName } from '../../prepare-season.js'
import { cleanupOldFreePlayers } from '../../helper/playerHelper.js'

describe('playerHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cleanupOldFreePlayers', () => {
    it('deletes excess free players when above minimum of 20', async () => {
      // 22 free players, should delete 2
      const freePlayers = Array.from({ length: 22 }, (_, i) => ({
        id: i + 1,
        name: `Free Player ${i + 1}`,
        team_id: null
      }))

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce(freePlayers) // Free players query

      // Mock delete queries for 2 players
      for (let i = 0; i < 2; i++) {
        query.mockResolvedValueOnce({}) // Delete player history
        query.mockResolvedValueOnce({}) // Delete trade offers
        query.mockResolvedValueOnce({}) // Delete player
      }

      const result = await cleanupOldFreePlayers()

      expect(result).toEqual({ deleted: 2, generated: 0 })
    })

    it('generates players when below minimum of 20', async () => {
      const freePlayers = [{ id: 1, name: 'Lonely Player', team_id: null }]

      getGameDayAndSeason.mockResolvedValue({ gameDay: 8, season: 1 })
      query.mockResolvedValueOnce(freePlayers) // Free players query

      // Should generate 19 players to reach minimum of 20
      generateRandomPlayerName.mockResolvedValue('Generated Player')
      for (let i = 0; i < 19; i++) {
        query.mockResolvedValueOnce({ insertId: 100 + i }) // Insert player
      }

      const result = await cleanupOldFreePlayers()

      expect(result).toEqual({ deleted: 0, generated: 19 })
    })

    it('does nothing when exactly at minimum of 20', async () => {
      const freePlayers = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `Free Player ${i + 1}`,
        team_id: null
      }))

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce(freePlayers)

      const result = await cleanupOldFreePlayers()

      expect(result).toEqual({ deleted: 0, generated: 0 })
    })

    it('generates all 20 players when no free players exist', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([]) // No free players

      // Should generate 20 players
      generateRandomPlayerName.mockResolvedValue('Generated Player')
      for (let i = 0; i < 20; i++) {
        query.mockResolvedValueOnce({ insertId: 100 + i })
      }

      const result = await cleanupOldFreePlayers()

      expect(result).toEqual({ deleted: 0, generated: 20 })
    })

    it('generates weak free players with correct attributes', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 5 })
      query.mockResolvedValueOnce([]) // No free players

      generateRandomPlayerName.mockResolvedValue('Test Player')

      // Capture the insert calls
      const insertCalls = []
      query.mockImplementation((sql, params) => {
        if (sql === 'INSERT INTO player SET ?') {
          insertCalls.push(params)
        }
        return Promise.resolve({ insertId: 1 })
      })

      await cleanupOldFreePlayers()

      // Should have generated 20 players
      expect(insertCalls.length).toBe(20)

      // Check first generated player has expected structure
      const player = insertCalls[0]
      expect(player.team_id).toBeNull()
      expect(player.level).toBeGreaterThanOrEqual(1)
      expect(player.level).toBeLessThanOrEqual(2)
      expect(player.freshness).toBeGreaterThanOrEqual(0.5)
      expect(player.freshness).toBeLessThanOrEqual(1.0)
      expect(player.position).toBeDefined()
      expect(player.position).not.toBe('GK') // No goalkeepers
    })
  })
})
