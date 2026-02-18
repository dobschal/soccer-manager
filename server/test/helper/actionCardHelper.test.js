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

vi.mock('../../helper/youthPlayerHelper.js', () => ({
  createYouthPlayer: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'error.playerMaxLevelUps': 'Player already got 20 level ups this season',
      'error.playerMaxLevel': 'Player already reached the maximum level',
      'error.cardMaxLevel70': 'Action card only allows level ups until level 70',
      'error.cardMaxLevel40': 'Action card only allows level ups until level 40',
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
import { createYouthPlayer } from '../../helper/youthPlayerHelper.js'
import { playActionCard, getActionCards, getPendingActionCards, claimActionCard, deleteExpiredPendingCards } from '../../helper/actionCardHelper.js'

describe('actionCardHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_40', () => {
    it('levels up a player from level 10 to level 11', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 10 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return [] // No level ups this season
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [11, 1])
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('levels up a player from level 39 to level 40 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 39 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [40, 1])
    })

    it('throws error when player is already at level 40', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 40 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 40' })
    })

    it('throws error when player is above level 40', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 70 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 40' })
    })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_70', () => {
    it('levels up a player from level 40 to level 41', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 40 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_70' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [41, 1])
    })

    it('levels up a player from level 69 to level 70 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 69 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_70' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [70, 1])
    })

    it('throws error when player is already at level 70', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 70 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_70' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 70' })
    })

    it('throws error when player is above level 70', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 90 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_70' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Action card only allows level ups until level 70' })
    })
  })

  describe('playActionCard - LEVEL_UP_PLAYER_100', () => {
    it('levels up a player from level 70 to level 71', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 70 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [71, 1])
    })

    it('levels up a player from level 99 to level 100 (at boundary)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 99 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [100, 1])
    })

    it('throws error when player is already at level 100 (max level)', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 100 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Player already reached the maximum level' })
    })

    it('can level up players at any level below 100', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 10 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          return []
        }
        return {}
      })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET level=? WHERE id=?', [11, 1])
    })
  })

  describe('playActionCard - level up limits per season', () => {
    it('throws error when player already has 20 level ups this season', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 30 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM player_history')) {
          // Return 20 level ups already this season
          return Array.from({ length: 20 }, () => ({ type: 'LEVEL_UP' }))
        }
        return {}
      })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toMatchObject({ message: 'Player already got 20 level ups this season' })
    })

    it('allows level up when player has only 1 level up this season', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, level: 30 })
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_100' })

      getPlayerById.mockResolvedValue(player)
      query.mockImplementation(async (sql) => {
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
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
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

  describe('playActionCard - FRESHNESS_5', () => {
    it('restores player freshness by 0.05', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.5 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_5' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [0.55, 1])
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('caps freshness at 1.0', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.97 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_5' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [1.0, 1])
    })
  })

  describe('playActionCard - FRESHNESS_20', () => {
    it('restores player freshness by 0.2', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.5 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_20' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET freshness=? WHERE id=?', [0.7, 1])
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('caps freshness at 1.0', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, freshness: 0.9 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_20' })

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

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, position: 'CM', actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET position=? WHERE id=?', ['CM', 1])
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('can change to any non-GK position', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, position: 'CM' })
      const actionCard = testData.actionCard({ action: 'CHANGE_PLAYER_POSITION' })

      getPlayerById.mockResolvedValue(player)

      const result = await playActionCard({ player, position: 'CA', actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET position=? WHERE id=?', ['CA', 1])
    })

    it('throws error when trying to change GK position', async () => {
      const team = testData.team()
      const player = testData.player({ id: 1, position: 'GK' })
      const actionCard = testData.actionCard({ action: 'CHANGE_PLAYER_POSITION' })

      getPlayerById.mockResolvedValue(player)

      await expect(playActionCard({ player, position: 'CA', actionCard }, team))
        .rejects.toThrow()
    })
  })

  describe('playActionCard - NEW_YOUTH_PLAYER', () => {
    it('creates a new youth player', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER' })

      const mockYouthPlayer = {
        id: 1,
        team_id: 5,
        name: 'Young Talent',
        position: 'CM',
        level: 5,
        talent: 0.8,
        moral: 0.7,
        fitness: 0.7,
        birth_season: 2
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 2 })
      createYouthPlayer.mockResolvedValue(mockYouthPlayer)

      const result = await playActionCard({ actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(createYouthPlayer).toHaveBeenCalledWith(5, 2)
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('creates youth player with team and season from context', async () => {
      const team = testData.team({ id: 7 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER' })

      const mockYouthPlayer = {
        id: 2,
        team_id: 7,
        name: 'New Talent',
        position: 'GK',
        level: 3,
        talent: 0.5,
        moral: 0.7,
        fitness: 0.7,
        birth_season: 5
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 10, season: 5 })
      createYouthPlayer.mockResolvedValue(mockYouthPlayer)

      await playActionCard({ actionCard }, team)

      expect(createYouthPlayer).toHaveBeenCalledWith(7, 5)
    })
  })

  describe('playActionCard - BONUS_100K', () => {
    it('gives team 100000 money', async () => {
      const team = testData.team({ id: 5, balance: 50000 })
      const actionCard = testData.actionCard({ action: 'BONUS_100K' })

      const result = await playActionCard({ actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(updateTeamBalance).toHaveBeenCalledWith(team, 100000, 'Action Card: Bonus Money', 1, 0)
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
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

  describe('getActionCards', () => {
    it('queries for received cards only', async () => {
      const team = testData.team({ id: 5 })
      const cards = [testData.actionCard({ state: 'received' })]
      query.mockResolvedValue(cards)

      const result = await getActionCards(team)

      expect(result).toEqual(cards)
      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM action_card WHERE team_id=? AND played=0 AND state='received'",
        [5]
      )
    })
  })

  describe('getPendingActionCards', () => {
    it('queries for pending cards', async () => {
      const team = testData.team({ id: 5 })
      const cards = [testData.actionCard({ state: 'pending' })]
      query.mockResolvedValue(cards)

      const result = await getPendingActionCards(team)

      expect(result).toEqual(cards)
      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM action_card WHERE team_id=? AND state='pending'",
        [5]
      )
    })

    it('returns empty array when no pending cards', async () => {
      const team = testData.team({ id: 5 })
      query.mockResolvedValue([])

      const result = await getPendingActionCards(team)

      expect(result).toEqual([])
    })
  })

  describe('claimActionCard', () => {
    it('claims a pending card and returns it as received', async () => {
      const card = testData.actionCard({ id: 10, team_id: 5, state: 'pending' })
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT')) return [card]
        return {}
      })

      const result = await claimActionCard(10, 5)

      expect(result.state).toBe('received')
      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM action_card WHERE id=? AND team_id=? AND state='pending'",
        [10, 5]
      )
      expect(query).toHaveBeenCalledWith(
        "UPDATE action_card SET state='received' WHERE id=?",
        [10]
      )
    })

    it('throws error when card not found', async () => {
      query.mockResolvedValue([])

      await expect(claimActionCard(999, 5))
        .rejects.toMatchObject({ message: 'Card not found or already claimed' })
    })

    it('throws error when card belongs to different team', async () => {
      query.mockResolvedValue([])

      await expect(claimActionCard(10, 999))
        .rejects.toMatchObject({ message: 'Card not found or already claimed' })
    })
  })

  describe('deleteExpiredPendingCards', () => {
    it('deletes all pending cards', async () => {
      query.mockResolvedValue({ affectedRows: 3 })

      await deleteExpiredPendingCards()

      expect(query).toHaveBeenCalledWith("DELETE FROM action_card WHERE state='pending'")
    })

    it('does nothing when no pending cards exist', async () => {
      query.mockResolvedValue({ affectedRows: 0 })

      await deleteExpiredPendingCards()

      expect(query).toHaveBeenCalledWith("DELETE FROM action_card WHERE state='pending'")
    })
  })
})
