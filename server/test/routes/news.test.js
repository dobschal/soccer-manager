import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn(),
  getTeamById: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayerById: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  randomItem: vi.fn((arr) => arr[0])
}))

import { query } from '../../lib/database.js'
import { getTeam, getTeamById } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getPlayerById } from '../../helper/playerHelper.js'
import handlers from '../../routes/news.js'

describe('news routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLogMessages', () => {
    it('returns news messages for team', async () => {
      const team = testData.team()
      const messages = [
        testData.newsMessage({ message: 'Message 1' }),
        testData.newsMessage({ message: 'Message 2' })
      ]

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(messages)

      const req = createMockRequest()
      const result = await handlers.getLogMessages(0, 10, req)

      expect(result).toEqual(messages)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM news WHERE team_id=? ORDER BY id DESC LIMIT ?, ?',
        [team.id, 0, 10]
      )
    })

    it('handles pagination correctly', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()
      await handlers.getLogMessages(2, 5, req)

      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM news WHERE team_id=? ORDER BY id DESC LIMIT ?, ?',
        [team.id, 10, 5]
      )
    })
  })

  describe('getLeagueNews', () => {
    it('returns league news with transfer articles', async () => {
      const tradeHistory = testData.tradeHistory({ player_id: 1, from_team_id: 1, to_team_id: 2, price: 100000 })
      const player = testData.player({ id: 1, name: 'Star Player' })
      const oldTeam = testData.team({ id: 1, name: 'Old FC' })
      const newTeam = testData.team({ id: 2, name: 'New FC' })

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      query.mockResolvedValue([tradeHistory])
      getPlayerById.mockResolvedValue(player)
      getTeamById
        .mockResolvedValueOnce(newTeam)
        .mockResolvedValueOnce(oldTeam)

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.gameDay).toBe(5)
      expect(result.season).toBe(1)
      expect(result.news.length).toBe(1)
      expect(result.news[0].playerId).toBe(1)
    })

    it('returns empty news when no trades', async () => {
      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
      query.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.news).toEqual([])
    })
  })
})
