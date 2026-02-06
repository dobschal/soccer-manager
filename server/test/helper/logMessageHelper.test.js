import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'log.incompleteLineup': `Warning: Your lineup only has ${params.count} players!`,
      'log.lowFreshness': `Warning: ${params.playerName} has low freshness (${params.freshness}%).`
    }
    return translations[key] || key
  }),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import {
  getLogMessages,
  addLogMessage,
  getLogMessageCount,
  deleteLogMessage,
  checkTeamAndNotify
} from '../../helper/logMessageHelper.js'

describe('logMessageHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLogMessages', () => {
    it('returns log messages for team', async () => {
      const team = testData.team()
      const messages = [
        testData.logMessage({ message: 'Message 1' }),
        testData.logMessage({ message: 'Message 2' })
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(messages)

      const req = createMockRequest()
      const result = await getLogMessages(0, 10, req)

      expect(result).toEqual(messages)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM log_message WHERE team_id=? ORDER BY id DESC LIMIT ?, ?',
        [team.id, 0, 10]
      )
    })

    it('handles pagination correctly', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      await getLogMessages(2, 5, req)

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM log_message WHERE team_id=? ORDER BY id DESC LIMIT ?, ?',
        [team.id, 10, 5]
      )
    })
  })

  describe('addLogMessage', () => {
    it('inserts log message into database', async () => {
      const team = testData.team()

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 })

      await addLogMessage('Test message', team)

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO log_message SET ?',
        expect.objectContaining({
          message: 'Test message',
          team_id: team.id,
          game_day: 5,
          season: 1
        })
      )
    })

    it('includes action when provided', async () => {
      const team = testData.team()

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 })

      await addLogMessage('Player traded', team, 'OPEN_PLAYER', 123)

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO log_message SET ?',
        expect.objectContaining({
          message: 'Player traded',
          team_id: team.id,
          action: 'OPEN_PLAYER',
          action_value: 123
        })
      )
    })

    it('does not include action fields when not provided', async () => {
      const team = testData.team()

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 })

      await addLogMessage('Simple message', team)

      const insertCall = query.mock.calls[0]
      expect(insertCall[1]).not.toHaveProperty('action')
      expect(insertCall[1]).not.toHaveProperty('action_value')
    })

    it('includes action without action_value for OPEN_MY_TEAM_PAGE', async () => {
      const team = testData.team()

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 })

      await addLogMessage('Check your lineup', team, 'OPEN_MY_TEAM_PAGE')

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO log_message SET ?',
        expect.objectContaining({
          action: 'OPEN_MY_TEAM_PAGE'
        })
      )
      const insertCall = query.mock.calls[0]
      expect(insertCall[1]).not.toHaveProperty('action_value')
    })
  })

  describe('getLogMessageCount', () => {
    it('returns count of log messages for team', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([{ count: 42 }])

      const req = createMockRequest()
      const result = await getLogMessageCount(req)

      expect(result).toBe(42)
      expect(query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM log_message WHERE team_id=?',
        [team.id]
      )
    })
  })

  describe('deleteLogMessage', () => {
    it('deletes log message by id and team id', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await deleteLogMessage(123, req)

      expect(query).toHaveBeenCalledWith(
        'DELETE FROM log_message WHERE id=? AND team_id=?',
        [123, team.id]
      )
    })

    it('only deletes messages belonging to users team', async () => {
      const team = testData.team({ id: 5 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await deleteLogMessage(999, req)

      // Should include team_id in WHERE clause for security
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM log_message WHERE id=? AND team_id=?',
        [999, 5]
      )
    })
  })

  describe('checkTeamAndNotify', () => {
    it('does nothing for bot teams (no user_id)', async () => {
      const team = testData.team({ user_id: null })

      await checkTeamAndNotify(team)

      // Should not query players for bot teams
      expect(query).not.toHaveBeenCalled()
    })

    it('adds log message for incomplete lineup', async () => {
      const team = testData.team({ user_id: 1 })
      const players = [
        testData.player({ in_game_position: 'GK', freshness: 0.8 }),
        testData.player({ in_game_position: 'CB', freshness: 0.8 }),
        testData.player({ in_game_position: 'CB', freshness: 0.8 })
        // Only 3 players in lineup, need 11
      ]

      query.mockResolvedValueOnce(players) // SELECT players
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 }) // INSERT log message

      await checkTeamAndNotify(team)

      // Should add a log message about incomplete lineup
      const insertCalls = query.mock.calls.filter(call =>
        call[0] === 'INSERT INTO log_message SET ?'
      )
      expect(insertCalls.length).toBeGreaterThan(0)
      expect(insertCalls[0][1].message).toContain('lineup')
      expect(insertCalls[0][1].action).toBe('OPEN_MY_TEAM_PAGE')
    })

    it('adds log message for player with low freshness', async () => {
      const team = testData.team({ user_id: 1 })
      const players = Array.from({ length: 11 }, (_, i) => testData.player({
        id: i + 1,
        name: `Player ${i + 1}`,
        in_game_position: i === 0 ? 'GK' : 'CM',
        freshness: i === 0 ? 0.3 : 0.8 // First player has low freshness
      }))

      query.mockResolvedValueOnce(players)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue({ insertId: 1 })

      await checkTeamAndNotify(team)

      // Should add a log message about low freshness
      const insertCalls = query.mock.calls.filter(call =>
        call[0] === 'INSERT INTO log_message SET ?'
      )
      const freshnessMessage = insertCalls.find(call =>
        call[1].message.includes('freshness')
      )
      expect(freshnessMessage).toBeDefined()
      expect(freshnessMessage[1].action).toBe('OPEN_PLAYER')
      expect(freshnessMessage[1].action_value).toBe(1)
    })

    it('does not add message for complete lineup with healthy players', async () => {
      const team = testData.team({ user_id: 1 })
      const players = Array.from({ length: 11 }, (_, i) => testData.player({
        id: i + 1,
        in_game_position: i === 0 ? 'GK' : 'CM',
        freshness: 0.8 // All players have good freshness
      }))

      query.mockResolvedValueOnce(players)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      await checkTeamAndNotify(team)

      // Should not insert any log messages
      const insertCalls = query.mock.calls.filter(call =>
        call[0] === 'INSERT INTO log_message SET ?'
      )
      expect(insertCalls.length).toBe(0)
    })

    it('does not warn about low freshness for players not in lineup', async () => {
      const team = testData.team({ user_id: 1 })
      const players = [
        ...Array.from({ length: 11 }, (_, i) => testData.player({
          id: i + 1,
          in_game_position: i === 0 ? 'GK' : 'CM',
          freshness: 0.8
        })),
        testData.player({
          id: 12,
          name: 'Bench Player',
          in_game_position: null, // Not in lineup
          freshness: 0.1 // Very low freshness but not in lineup
        })
      ]

      query.mockResolvedValueOnce(players)
      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })

      await checkTeamAndNotify(team)

      // Should not warn about the bench player
      const insertCalls = query.mock.calls.filter(call =>
        call[0] === 'INSERT INTO log_message SET ?'
      )
      expect(insertCalls.length).toBe(0)
    })
  })
})
