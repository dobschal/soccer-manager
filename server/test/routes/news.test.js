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

vi.mock('../../lib/badWordsFilter.js', async () => {
  const actual = await vi.importActual('../../lib/badWordsFilter.js')
  return actual
})

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
        .mockResolvedValueOnce([]) // like counts query
        .mockResolvedValueOnce([]) // user likes query
        .mockResolvedValueOnce([]) // comment counts query
        .mockResolvedValueOnce([newsTeam]) // teams query
        .mockResolvedValueOnce([newsPlayer]) // players query

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.gameDay).toBe(4) // Previous game day
      expect(result.season).toBe(1)
      expect(result.news.length).toBe(1)
      expect(result.news[0].type).toBe('TRANSFER')
      expect(result.news[0].commentCount).toBe(0)
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
        .mockResolvedValueOnce([]) // like counts query
        .mockResolvedValueOnce([]) // user likes query
        .mockResolvedValueOnce([]) // comment counts query
        .mockResolvedValueOnce([newsPlayer]) // players query
        .mockResolvedValueOnce([playerTeam]) // player teams query

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.teams).toContainEqual(playerTeam)
    })

    it('includes comment counts in enriched news', async () => {
      const team = testData.team({ id: 1, level: 1, league: 1 })
      const newsItem = {
        id: 5,
        game_day: 4,
        season: 1,
        level: 1,
        league: 1,
        type: 'TRANSFER',
        title: 'Transfer',
        text: 'A transfer happened',
        player_id: null,
        team_id: 1
      }

      getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
      getTeam.mockResolvedValue(team)
      getNewsByLeague.mockResolvedValue([newsItem])
      query
        .mockResolvedValueOnce([]) // like counts
        .mockResolvedValueOnce([]) // user likes
        .mockResolvedValueOnce([{ news_id: 5, count: 3 }]) // comment counts
        .mockResolvedValueOnce([team]) // teams query

      const req = createMockRequest()
      const result = await handlers.getLeagueNews(req)

      expect(result.news[0].commentCount).toBe(3)
    })
  })

  describe('getLikedNews', () => {
    it('includes commentCount on each liked news item', async () => {
      const likedItem = {
        id: 7,
        game_day: 2,
        season: 1,
        level: 1,
        league: 1,
        type: 'GOAL',
        title: 'Hat-trick',
        text: 'A hat-trick was scored',
        player_id: null,
        team_id: 1,
        liked_at: new Date()
      }

      query
        .mockResolvedValueOnce([likedItem]) // liked news lookup
        .mockResolvedValueOnce([{ news_id: 7, count: 4 }]) // like counts
        .mockResolvedValueOnce([{ news_id: 7 }]) // user likes
        .mockResolvedValueOnce([{ news_id: 7, count: 2 }]) // comment counts
        .mockResolvedValueOnce([testData.team({ id: 1 })]) // teams

      const req = createMockRequest()
      const result = await handlers.getLikedNews(req)

      expect(result.news[0].commentCount).toBe(2)
      expect(result.news[0].likeCount).toBe(4)
      expect(result.news[0].liked).toBe(true)
    })
  })

  describe('getNewsComments', () => {
    it('returns comments for a news item', async () => {
      const comments = [
        { id: 1, news_id: 5, user_id: 1, text: 'Great news!', created_at: new Date(), author_name: 'testuser' },
        { id: 2, news_id: 5, user_id: 2, text: 'Indeed!', created_at: new Date(), author_name: 'otheruser' }
      ]
      query.mockResolvedValueOnce(comments)

      const req = createMockRequest()
      const result = await handlers.getNewsComments(5, req)

      expect(result.comments).toEqual(comments)
      expect(result.comments.length).toBe(2)
    })

    it('returns empty array when no comments exist', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getNewsComments(5, req)

      expect(result.comments).toEqual([])
    })
  })

  describe('addNewsComment', () => {
    it('adds and returns a comment with author name', async () => {
      const comment = { id: 1, news_id: 5, user_id: 1, text: 'Nice game!', created_at: new Date(), author_name: 'testuser' }
      query
        .mockResolvedValueOnce({ insertId: 1 }) // INSERT
        .mockResolvedValueOnce([comment]) // SELECT back

      const req = createMockRequest()
      const result = await handlers.addNewsComment(5, 'Nice game!', req)

      expect(result.comment).toEqual(comment)
      expect(result.comment.author_name).toBe('testuser')
    })

    it('filters bad words before storing', async () => {
      const comment = { id: 1, news_id: 5, user_id: 1, text: '**** this', created_at: new Date(), author_name: 'testuser' }
      query
        .mockResolvedValueOnce({ insertId: 1 })
        .mockResolvedValueOnce([comment])

      const req = createMockRequest()
      await handlers.addNewsComment(5, 'fuck this', req)

      // Check that the INSERT was called with masked text
      const insertCall = query.mock.calls[0]
      expect(insertCall[1].text).toBe('**** this')
    })

    it('rejects empty text', async () => {
      const req = createMockRequest()
      await expect(handlers.addNewsComment(5, '', req)).rejects.toThrow('Comment text cannot be empty')
      await expect(handlers.addNewsComment(5, '   ', req)).rejects.toThrow('Comment text cannot be empty')
    })

    it('rejects text exceeding 500 characters', async () => {
      const req = createMockRequest()
      const longText = 'a'.repeat(501)
      await expect(handlers.addNewsComment(5, longText, req)).rejects.toThrow('Comment text cannot exceed 500 characters')
    })
  })
})
