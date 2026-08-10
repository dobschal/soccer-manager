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

vi.mock('../../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
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
      'error.motivatingSpeechAlreadyActive': 'Motivating speech is already active for this game day.',
      'error.playerNotInTeam': 'This player is not in your team.',
      'error.playerNotInjured': 'This player is not injured.',
      'finance.actionCardBonus': 'Action Card: Bonus Money',
      'log.cardLevelUp': `${params.playerName} has leveled up to level ${params.level}!`,
      'log.cardFreshness': `${params.playerName}'s freshness has been restored!`,
      'log.cardMoney': `You received a bonus of ${params.amount}!`,
      'log.cardYouth': `A new youth talent ${params.playerName} has joined your team!`,
      'log.cardMedicalTreatment': `${params.playerName} treated, ${params.days} game day(s) left.`,
      'log.cardMedicalTreatmentHealed': `${params.playerName} treated and available again!`
    }
    return translations[key] || key
  }),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))

vi.mock('../../lib/websocket.js', () => ({
  sendToUser: vi.fn()
}))

import { query } from '../../lib/database.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getPlayerById } from '../../helper/playerHelper.js'
import { getTeamById } from '../../helper/teamHelper.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { createYouthPlayer } from '../../helper/youthPlayerHelper.js'
import { sendToUser } from '../../lib/websocket.js'
import { SERVER_EVENTS } from '../../../client/lib/serverEvents.js'
import { playActionCard, getActionCards, getPendingActionCards, claimActionCard, canReceiveActionCard, deleteExpiredPendingCards, generateYouthPlayerOptions, YOUTH_PLAYER_CARD_RANGES, actionCardChances, CASH_CARD_AMOUNTS } from '../../helper/actionCardHelper.js'

describe('actionCardHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
  })

  describe('playActionCard - PLAYER_UPDATED emission', () => {
    it('sends PLAYER_UPDATED with the fresh player after a level-up card', async () => {
      const team = testData.team({ id: 1, user_id: 77 })
      const player = testData.player({ id: 42, level: 10, freshness: 0.5 })
      const freshPlayer = { ...player, level: 11 }
      const actionCard = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      // First getPlayerById inside the branch, second inside _emitPlayerUpdated.
      getPlayerById
        .mockResolvedValueOnce(player)
        .mockResolvedValueOnce(freshPlayer)
      query.mockImplementation(async (sql) => sql.includes('SELECT * FROM player_history') ? [] : {})

      await playActionCard({ player, actionCard }, team)

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.PLAYER_UPDATED.name, { player: freshPlayer })
    })

    it('sends PLAYER_UPDATED after a freshness card', async () => {
      const team = testData.team({ id: 1, user_id: 77 })
      const player = testData.player({ id: 42, freshness: 0.5 })
      const freshPlayer = { ...player, freshness: 0.6 }
      const actionCard = testData.actionCard({ action: 'FRESHNESS_10' })

      getPlayerById
        .mockResolvedValueOnce(player)
        .mockResolvedValueOnce(freshPlayer)
      query.mockResolvedValue({})

      await playActionCard({ player, actionCard }, team)

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.PLAYER_UPDATED.name, { player: freshPlayer })
    })

    it('does not emit PLAYER_UPDATED for bot teams (no user_id)', async () => {
      const team = testData.team({ id: 1, user_id: null })
      const player = testData.player({ id: 42, freshness: 0.5 })
      const actionCard = testData.actionCard({ action: 'FRESHNESS_10' })

      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValue({})

      await playActionCard({ player, actionCard }, team)

      expect(sendToUser).not.toHaveBeenCalled()
    })
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

  describe('playActionCard - NEW_YOUTH_PLAYER_X cards', () => {
    it('creates a youth player from a NEW_YOUTH_PLAYER_1 option within the allowed level/talent range', async () => {
      const team = testData.team({ id: 11 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER_1' })
      const selectedOption = {
        name: 'Lukas Müller',
        position: 'CM',
        level: 3.4,
        talent: 0.2,
        hair_color: 2,
        skin_color: 1
      }
      getGameDayAndSeason.mockResolvedValue({ gameDay: 4, season: 3 })
      createYouthPlayer.mockResolvedValue({ id: 99, name: 'Lukas Müller' })

      const result = await playActionCard({ actionCard, player: selectedOption }, team)

      expect(result).toEqual({ success: true })
      expect(createYouthPlayer).toHaveBeenCalledWith(11, 3, expect.objectContaining({
        name: 'Lukas Müller',
        position: 'CM',
        level: 3.4,
        talent: 0.2,
        hair_color: 2,
        skin_color: 1
      }))
    })

    it('clamps level/talent to the card range for NEW_YOUTH_PLAYER_2 (anti-cheat)', async () => {
      const team = testData.team({ id: 12 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER_2' })
      const selectedOption = {
        name: 'Cheat Attempt',
        position: 'GK',
        level: 99,
        talent: 1.0,
        hair_color: 0,
        skin_color: 0
      }
      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
      createYouthPlayer.mockResolvedValue({ id: 100, name: 'Cheat Attempt' })

      await playActionCard({ actionCard, player: selectedOption }, team)

      const passedOverrides = createYouthPlayer.mock.calls[0][2]
      expect(passedOverrides.level).toBe(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_2.levelMax)
      expect(passedOverrides.talent).toBe(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_2.talentMax)
    })

    it('rejects missing option name', async () => {
      const team = testData.team({ id: 13 })
      const actionCard = testData.actionCard({ action: 'NEW_YOUTH_PLAYER_3' })
      await expect(playActionCard({ actionCard, player: {
        name: '',
        position: 'CA',
        level: 12,
        talent: 0.9,
        hair_color: 0,
        skin_color: 0
      } }, team)).rejects.toThrow()
    })
  })

  describe('generateYouthPlayerOptions', () => {
    it('returns 3 options with level/talent inside the card range', async () => {
      query.mockResolvedValue([])
      const options = await generateYouthPlayerOptions('NEW_YOUTH_PLAYER_3')
      expect(options).toHaveLength(3)
      for (const opt of options) {
        expect(opt.level).toBeGreaterThanOrEqual(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_3.levelMin)
        expect(opt.level).toBeLessThanOrEqual(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_3.levelMax)
        expect(opt.talent).toBeGreaterThanOrEqual(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_3.talentMin)
        expect(opt.talent).toBeLessThanOrEqual(YOUTH_PLAYER_CARD_RANGES.NEW_YOUTH_PLAYER_3.talentMax)
        expect(typeof opt.name).toBe('string')
        expect(typeof opt.position).toBe('string')
      }
    })

    it('returns 3 distinct positions', async () => {
      query.mockResolvedValue([])
      // Run many times so a chance-based duplicate would be caught reliably.
      for (let i = 0; i < 50; i++) {
        const options = await generateYouthPlayerOptions('NEW_YOUTH_PLAYER_1')
        const positions = options.map(opt => opt.position)
        expect(new Set(positions).size).toBe(3)
      }
    })

    it('throws for unknown action', async () => {
      await expect(generateYouthPlayerOptions('UNKNOWN_ACTION')).rejects.toThrow()
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

  describe('playActionCard - MOTIVATING_SPEECH', () => {
    it('activates motivating speech for the team', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'MOTIVATING_SPEECH' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT motivating_speech_active')) {
          return [{ motivating_speech_active: 0 }]
        }
        return {}
      })

      const result = await playActionCard({ actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET motivating_speech_active=1 WHERE id=?', [5])
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [actionCard.id])
    })

    it('throws error when motivating speech is already active', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ action: 'MOTIVATING_SPEECH' })

      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT motivating_speech_active')) {
          return [{ motivating_speech_active: 1 }]
        }
        return {}
      })

      await expect(playActionCard({ actionCard }, team))
        .rejects.toMatchObject({ message: 'Motivating speech is already active for this game day.' })
    })
  })

  describe('playActionCard - SPY', () => {
    it('just consumes the card (reveal happens client-side)', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ id: 77, action: 'SPY' })

      query.mockResolvedValue({})

      const result = await playActionCard({ actionCard, player: null }, team)

      expect(result).toEqual({ success: true, report: null })
      expect(query).toHaveBeenCalledWith("UPDATE action_card SET played=1, state='played' WHERE id=?", [77])
      // A spy card has no side effect on players or balance.
      expect(updateTeamBalance).not.toHaveBeenCalled()
    })

    it('#513 stores a frozen snapshot of the spied team and returns it as the report', async () => {
      const team = testData.team({ id: 5 })
      const spiedTeam = testData.team({ id: 42, formation: '4-3-3', motivating_speech_active: 1 })
      const spiedPlayers = [testData.player({ id: 1, team_id: 42 }), testData.player({ id: 2, team_id: 42 })]
      const actionCard = testData.actionCard({ id: 77, action: 'SPY' })

      getTeamById.mockResolvedValue(spiedTeam)
      query.mockImplementation((sql) => {
        if (sql.startsWith('SELECT * FROM player')) return Promise.resolve(spiedPlayers)
        return Promise.resolve({})
      })

      const result = await playActionCard({ actionCard, player: null, position: '42' }, team)

      // The report reveals the snapshot to the client.
      expect(result.success).toBe(true)
      expect(result.report.team.id).toBe(42)
      expect(result.report.players).toHaveLength(2)
      expect(result.report.motivatingSpeechActive).toBe(true)

      // The snapshot is persisted on the spying team so the report is stable.
      const updateCall = query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('last_spied_snapshot'))
      expect(updateCall).toBeDefined()
      expect(updateCall[1][0]).toBe(42) // spied team id
      const storedSnapshot = JSON.parse(updateCall[1][1])
      expect(storedSnapshot.team.id).toBe(42)
      expect(storedSnapshot.motivatingSpeechActive).toBe(true)
      expect(updateCall[1][2]).toBe(5) // spying team id
    })

    it('does not persist a scout target when no team id is given', async () => {
      const team = testData.team({ id: 5 })
      const actionCard = testData.actionCard({ id: 77, action: 'SPY' })

      query.mockResolvedValue({})

      const result = await playActionCard({ actionCard, player: null }, team)

      expect(result.report).toBeNull()
      expect(getTeamById).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('last_spied_snapshot'),
        expect.anything()
      )
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

    it('allows claiming when the team is below the per-type hold limit', async () => {
      const card = testData.actionCard({ id: 10, team_id: 5, action: 'FRESHNESS_10', state: 'pending' })
      query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT(*)')) return [{ heldCount: 9 }]
        if (sql.includes("state='pending'")) return [card]
        return {}
      })

      const result = await claimActionCard(10, 5)

      expect(result.state).toBe('received')
      expect(query).toHaveBeenCalledWith(
        "UPDATE action_card SET state='received' WHERE id=?",
        [10]
      )
    })

    it('rejects claiming when the per-type hold limit is reached', async () => {
      const card = testData.actionCard({ id: 10, team_id: 5, action: 'FRESHNESS_10', state: 'pending' })
      query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT(*)')) return [{ heldCount: 20 }]
        if (sql.includes("state='pending'")) return [card]
        return {}
      })

      await expect(claimActionCard(10, 5, 'en'))
        .rejects.toMatchObject({ message: 'error.actionCardLimitReached' })

      // The card must not be flipped to received when the limit is hit.
      expect(query).not.toHaveBeenCalledWith(
        "UPDATE action_card SET state='received' WHERE id=?",
        [10]
      )
    })
  })

  describe('canReceiveActionCard', () => {
    it('returns true when the team holds fewer than the per-type limit', async () => {
      query.mockResolvedValue([{ heldCount: 9 }])

      const result = await canReceiveActionCard(5, 'FRESHNESS_10')

      expect(result).toBe(true)
      expect(query).toHaveBeenCalledWith(
        "SELECT COUNT(*) AS heldCount FROM action_card WHERE team_id=? AND action=? AND played=0 AND state IN ('received','pending')",
        [5, 'FRESHNESS_10']
      )
    })

    it('returns false when the team is already at the per-type limit', async () => {
      query.mockResolvedValue([{ heldCount: 20 }])

      const result = await canReceiveActionCard(5, 'LEVEL_UP_PLAYER_40')

      expect(result).toBe(false)
    })

    it('counts pending cards toward the limit so a backlog stops further dealing', async () => {
      // 12 received + 8 pending = 20 held → at the limit.
      query.mockResolvedValue([{ heldCount: 20 }])

      expect(await canReceiveActionCard(5, 'FRESHNESS_10')).toBe(false)
    })
  })

  describe('playActionCard - MEDICAL_TREATMENT', () => {
    const setup = (playerOverrides) => {
      const team = testData.team({ id: 1, user_id: 77 })
      const player = testData.player({ id: 42, team_id: 1, ...playerOverrides })
      const actionCard = testData.actionCard({ id: 9, action: 'MEDICAL_TREATMENT' })
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValue({})
      return { team, player, actionCard }
    }

    it('takes one game day off a longer injury and leaves the player injured', async () => {
      const { team, player, actionCard } = setup({ is_injured: 1, injury_type: 'fracture', injury_days_left: 6 })

      const result = await playActionCard({ player, actionCard }, team)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET injury_days_left=? WHERE id=?', [5, 42]
      )
      expect(query).toHaveBeenCalledWith(
        "UPDATE action_card SET played=1, state='played' WHERE id=?", [9]
      )
      expect(addLogMessage).toHaveBeenCalledWith(
        'Test Player treated, 5 game day(s) left.',
        team, 'OPEN_PLAYER', 42, 'medkit', undefined, 'success'
      )
    })

    it('ends the injury outright when the last game day comes off', async () => {
      // Clearing it here rather than letting the next game day's recovery sweep do
      // it is what makes the player available for today's match.
      const { team, player, actionCard } = setup({ is_injured: 1, injury_type: 'bruise', injury_days_left: 1 })

      await playActionCard({ player, actionCard }, team)

      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET is_injured=0, injury_type=NULL, injury_days_left=0 WHERE id=?', [42]
      )
      expect(addLogMessage).toHaveBeenCalledWith(
        'Test Player treated and available again!',
        team, 'OPEN_PLAYER', 42, 'medkit', undefined, 'success'
      )
    })

    it('also clears an injury whose counter already ran out', async () => {
      const { team, player, actionCard } = setup({ is_injured: 1, injury_days_left: 0 })

      await playActionCard({ player, actionCard }, team)

      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET is_injured=0, injury_type=NULL, injury_days_left=0 WHERE id=?', [42]
      )
    })

    it('rejects a player who is not injured, without spending the card', async () => {
      const { team, player, actionCard } = setup({ is_injured: 0, injury_days_left: 0 })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toThrow('This player is not injured.')
      expect(query).not.toHaveBeenCalledWith(
        "UPDATE action_card SET played=1, state='played' WHERE id=?", [9]
      )
    })

    it('rejects a player from another team', async () => {
      const { team, player, actionCard } = setup({ team_id: 2, is_injured: 1, injury_days_left: 3 })

      await expect(playActionCard({ player, actionCard }, team))
        .rejects.toThrow('This player is not in your team.')
    })

    it('pushes the updated player to the owner so every open view refreshes', async () => {
      const team = testData.team({ id: 1, user_id: 77 })
      const player = testData.player({ id: 42, team_id: 1, is_injured: 1, injury_days_left: 3 })
      const fresh = { ...player, injury_days_left: 2 }
      const actionCard = testData.actionCard({ id: 9, action: 'MEDICAL_TREATMENT' })
      getPlayerById.mockResolvedValueOnce(player).mockResolvedValueOnce(fresh)
      query.mockResolvedValue({})

      await playActionCard({ player, actionCard }, team)

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.PLAYER_UPDATED.name, { player: fresh })
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

describe('MILLION_BONUS card (#537)', () => {
  it('is a tenth as likely as the cash bonus', () => {
    expect(actionCardChances.MILLION_BONUS).toBeCloseTo(actionCardChances.BONUS_100K * 0.1, 10)
  })

  it('pays out ten times the cash bonus', () => {
    expect(CASH_CARD_AMOUNTS.MILLION_BONUS).toBe(1_000_000)
    expect(CASH_CARD_AMOUNTS.MILLION_BONUS).toBe(CASH_CARD_AMOUNTS.BONUS_100K * 10)
  })
})
