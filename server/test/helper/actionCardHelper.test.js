import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../helper/playerHistoryHelper.js', () => ({
  addPlayerHistory: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayerById: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { playActionCard } from '../../helper/actionCardHelper.js'

describe('actionCardHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_4', () => {
    it('levels up a player from level 1 to level 2', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 1 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_4' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return [] // No level ups this season
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [2, 1])
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    })

    it('levels up a player from level 3 to level 4 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 3 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_4' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [4, 1])
    })

    it('throws error when player is already at level 4', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 4 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_4' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 4.' })
    })

    it('throws error when player is above level 4', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 7 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_4' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 4.' })
    })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_7', () => {
    it('levels up a player from level 4 to level 5', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 4 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_7' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [5, 1])
    })

    it('levels up a player from level 6 to level 7 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 6 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_7' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [7, 1])
    })

    it('throws error when player is already at level 7', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 7 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_7' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 7.' })
    })

    it('throws error when player is above level 7', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 9 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_7' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 7.' })
    })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_10', () => {
    it('levels up a player from level 7 to level 8', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 7 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [8, 1])
    })

    it('levels up a player from level 9 to level 10 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 9 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [10, 1])
    })

    it('throws error when player is already at level 10 (max level)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 10 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Player already reached the maximum level' })
    })

    it('can level up players at any level below 10', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 1 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [2, 1])
    })
  })

  describe('playActionCard - level up limits per season', () => {
    it('throws error when player already has 2 level ups this season', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 3 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          // Return 2 level ups already this season
          return [{ type: 'LEVEL_UP' }, { type: 'LEVEL_UP' }]
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Player already got 2 level ups this season...' })
    })

    it('allows level up when player has only 1 level up this season', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 3 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_10' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player WHERE id=?')) {
          return [player]
        }
        if (sql.includes('SELECT * FROM player_history')) {
          // Return 1 level up already this season
          return [{ type: 'LEVEL_UP' }]
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
    })
  })
})
