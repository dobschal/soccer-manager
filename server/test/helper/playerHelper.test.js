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

// All 12 positions
const ALL_POSITIONS = ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']

function createFreePlayer (id, position) {
  return { id, name: `Free ${position} ${id}`, team_id: null, position }
}

describe('playerHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cleanupOldFreePlayers', () => {
    it('generates players to fill positions below minimum of 5', async () => {
      // Only 2 CD players, all other positions empty
      const freePlayers = [
        createFreePlayer(1, 'CD'),
        createFreePlayer(2, 'CD')
      ]

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce(freePlayers) // Free players query
      generateRandomPlayerName.mockResolvedValue('Generated Player')
      query.mockImplementation(() => Promise.resolve({ insertId: 100 }))

      const result = await cleanupOldFreePlayers()

      // CD needs 3 more (5-2), all other 11 positions need 5 each = 55 + 3 = 58
      expect(result.generated).toBe(58)
      expect(result.deleted).toBe(0)
    })

    it('deletes excess players above maximum of 10 per position', async () => {
      // 12 CD players — should delete 2
      const freePlayers = Array.from({ length: 12 }, (_, i) => createFreePlayer(i + 1, 'CD'))

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce(freePlayers) // Free players query
      generateRandomPlayerName.mockResolvedValue('Generated Player')

      // Mock all subsequent queries (deletes + inserts for other positions)
      query.mockImplementation(() => Promise.resolve({ insertId: 100 }))

      const result = await cleanupOldFreePlayers()

      // 2 deleted (12 - 10), 11 other positions * 5 generated = 55
      expect(result.deleted).toBe(2)
      expect(result.generated).toBe(55)
    })

    it('does nothing for positions already at min-max range', async () => {
      // 7 players per position — within range [5, 10]
      const freePlayers = ALL_POSITIONS.flatMap((pos, posIdx) =>
        Array.from({ length: 7 }, (_, i) => createFreePlayer(posIdx * 100 + i, pos))
      )

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValueOnce(freePlayers) // Free players query

      const result = await cleanupOldFreePlayers()

      expect(result).toEqual({ deleted: 0, generated: 0 })
    })

    it('generates all positions when no free players exist', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 1 })
      query.mockResolvedValueOnce([]) // No free players
      generateRandomPlayerName.mockResolvedValue('Generated Player')
      query.mockImplementation(() => Promise.resolve({ insertId: 100 }))

      const result = await cleanupOldFreePlayers()

      // 12 positions * 5 per position = 60
      expect(result).toEqual({ deleted: 0, generated: 60 })
    })

    it('generates players with the correct position', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 5 })
      query.mockResolvedValueOnce([]) // No free players
      generateRandomPlayerName.mockResolvedValue('Test Player')

      const insertCalls = []
      query.mockImplementation((sql, params) => {
        if (sql === 'INSERT INTO player SET ?') {
          insertCalls.push(params)
        }
        return Promise.resolve({ insertId: 1 })
      })

      await cleanupOldFreePlayers()

      // Should have generated 5 players per position = 60
      expect(insertCalls.length).toBe(60)

      // Check that each position gets exactly 5 players
      const positionCounts = {}
      for (const player of insertCalls) {
        positionCounts[player.position] = (positionCounts[player.position] || 0) + 1
        expect(player.team_id).toBeNull()
        expect(player.level).toBeGreaterThanOrEqual(10)
        expect(player.level).toBeLessThanOrEqual(20)
      }

      for (const pos of ALL_POSITIONS) {
        expect(positionCounts[pos]).toBe(5)
      }
    })
  })
})
