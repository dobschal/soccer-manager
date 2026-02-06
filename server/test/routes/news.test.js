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

vi.mock('../../helper/newsHelper.js', () => ({
  getNewsByLeague: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  getLocaleFromRequest: vi.fn(() => 'en')
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getNewsByLeague } from '../../helper/newsHelper.js'
import handlers from '../../routes/news.js'

describe('news routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLeagueNews', () => {
    it('returns league news with related teams and players', async () => {
      const team = testData.team({ id: 1, level: 1, league: 1 })
      const newsTeam = testData.team({ id: 2, name: 'News Team' })
      const newsPlayer = testData.player({ id: 10, name: 'Star Player', team_id: 2 })
      const newsItem = {
        id: 1,
        game_day: 4,
        season: 1,
        level: 1,
        league: 1,
        type: 'TRANSFER',
        title: 'Transfer News',
        text: 'A player was transferred',
        player_id: 10,
        team_id: 2
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getTeam.mockResolvedValue(team)
      getNewsByLeague.mockResolvedValue([newsItem])
      query
        .mockResolvedValueOnce([newsTeam]) // teams query
        .mockResolvedValueOnce([newsPlayer]) // players query

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.gameDay).toBe(4) // Previous game day
      expect(result.season).toBe(1)
      expect(result.news.length).toBe(1)
      expect(result.news[0].type).toBe('TRANSFER')
      expect(result.teams).toEqual([newsTeam])
      expect(result.players).toEqual([newsPlayer])
      expect(getNewsByLeague).toHaveBeenCalledWith(4, 1, 1, 1, 'en')
    })

    it('returns empty news when no news exists', async () => {
      const team = testData.team({ id: 1, level: 1, league: 1 })

      getGameDayAndSeason.mockResolvedValue({ gameDay: 1, season: 0 })
      getTeam.mockResolvedValue(team)
      getNewsByLeague.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.news).toEqual([])
      expect(result.teams).toEqual([])
      expect(result.players).toEqual([])
    })

    it('fetches player teams when not already in teams list', async () => {
      const team = testData.team({ id: 1, level: 1, league: 1 })
      const newsPlayer = testData.player({ id: 10, team_id: 3 })
      const playerTeam = testData.team({ id: 3, name: 'Player Team' })
      const newsItem = {
        id: 1,
        game_day: 4,
        season: 1,
        level: 1,
        league: 1,
        type: 'LEVEL_UP',
        title: 'Level Up',
        text: 'Player leveled up',
        player_id: 10,
        team_id: null
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getTeam.mockResolvedValue(team)
      getNewsByLeague.mockResolvedValue([newsItem])
      query
        .mockResolvedValueOnce([newsPlayer]) // players query
        .mockResolvedValueOnce([playerTeam]) // player teams query

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.teams).toContainEqual(playerTeam)
    })
  })
})
