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

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'error.playerMaxLevelUps': 'Player already got 2 level ups this season',
      'error.playerMaxLevel': 'Player already reached the maximum level',
      'error.cardMaxLevel7': 'Action card only allows level ups until level 7',
      'error.cardMaxLevel4': 'Action card only allows level ups until level 4',
      'error.invalidCardAction': 'Invalid card action',
      'finance.actionCardBonus': 'Action Card: Bonus Money',
      'log.cardLevelUp': `${params.playerName} has leveled up to level ${params.level}!`,
      'log.cardFreshness': `${params.playerName}'s freshness has been restored!`,
      'log.cardMoney': `You received a bonus of ${params.amount}!`,
      'log.cardYouth': `A new youth talent ${params.playerName} has joined your team!`
    }
    return translations[key] || key
  }),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getPlayerById } from '../../helper/playerHelper.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
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
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 4' })
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
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 4' })
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
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 7' })
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
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 7' })
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
        .rejects.toMatchObject({ message: 'Player already got 2 level ups this season' })
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

  describe('playActionCard - FRESHNESS_10', () => {
    it('restores player freshness by 0.1', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.5 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_10' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [0.6, 1])
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    })

    it('caps freshness at 1.0', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.95 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_10' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [1.0, 1])
    })

    it('works when freshness is already at 0.9', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.9 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_10' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [1.0, 1])
    })
  })

  describe('playActionCard - CHANGE_PLAYER_POSITION', () => {
    it('changes player position', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, position: 'CD' })
      const actionCard = testData.actionCard({ action: 'CHANGE_PLAYER_POSITION' })

      const result = await playActionCard({ player, position: 'CM', actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET position=? WHERE id=?', ['CM', 1])
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    })

    it('can change to any position', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, position: 'GK' })
      const actionCard = testData.actionCard({ action: 'CHANGE_PLAYER_POSITION' })

      const result = await playActionCard({ player, position: 'CA', actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET position=? WHERE id=?', ['CA', 1])
    })
  })

  describe('playActionCard - NEW_YOUTH_PLAYER', () => {
    it('creates a new youth player', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM game g ORDER BY')) {
          return [{ season: 2 }]
        }
        return {}
      })

      const result = await playActionCard({ actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('INSERT INTO player SET ?', expect.objectContaining({
        team_id: 5
      }))
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    })

    it('creates player with correct properties', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM game g ORDER BY')) {
          return [{ season: 2 }]
        }
        return {}
      })

      await playActionCard({ actionCard }, team)

      const insertCall = query.mock.calls.find(call => call[0].includes('INSERT INTO player'))
      const newPlayer = insertCall[1]

      expect(newPlayer.team_id).toBe(5)
      expect(newPlayer.level).toBeGreaterThanOrEqual(1)
      expect(newPlayer.level).toBeLessThanOrEqual(3)
      expect(newPlayer.freshness).toBe(1.0)
      expect(newPlayer.in_game_position).toBe('')
    })
  })

  describe('playActionCard - BONUS_100K', () => {
    it('gives team 100000 money', async () => {
      const team = testData.team({ id: 5, balance: 50000 })
      const actionCard = testData.actionCard({ action: 'BONUS_100K' })

      const result = await playActionCard({ actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(updateTeamBalance).toHaveBeenCalledWith(team, 100000, 'Action Card: Bonus Money', 1, 0)
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET played=1 WHERE id=?', [actionCard.id])
    })

    it('does not require player selection', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'BONUS_100K' })

      const result = await playActionCard({ actionCard, player: null }, team)

      expect(result).toEqual({ success: true })
      expect(updateTeamBalance).toHaveBeenCalled()
    })
  })

  describe('playActionCard - unknown action', () => {
    it('throws error for unknown action type', async () => {
      const team = testData.team()
      const actionCard = testData.actionCard({ action: 'INVALID_ACTION' })

      await expect(playActionCard({ actionCard }, team))
        .rejects.toMatchObject({ message: 'Invalid card action' })
    })
  })
})
