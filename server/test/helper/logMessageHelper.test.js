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

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getLogMessages, addLogMessage } from '../../helper/logMessageHelper.js'

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
  })
})
