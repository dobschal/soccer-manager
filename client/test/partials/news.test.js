import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getLeagueNews: vi.fn(),
    getLikedNews: vi.fn()
  }
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn(() => '_mock_id_' + Math.random().toString(36).slice(2, 8)),
  el: vi.fn(),
  value: vi.fn()
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn(),
  onChange: vi.fn(),
  on: vi.fn()
}))

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve('<div class="player-image"></div>'))
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem"></svg>')
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params) => params ? `${key}: ${JSON.stringify(params)}` : key)
}))

vi.mock('../../partials/commentOverlay.js', () => ({
  showCommentOverlay: vi.fn()
}))

import { News } from '../../pages/dashboard/news.js'
import { server } from '../../lib/gateway.js'
import { showCommentOverlay } from '../../partials/commentOverlay.js'

describe('News', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('template', () => {
    it('renders news title', async () => {
      server.getLeagueNews.mockResolvedValue({
        news: [],
        teams: [],
        players: [],
        gameDay: 5,
        season: 1,
        level: 0,
        league: 0
      })
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).toContain('news.title')
    })

    it('shows no news message when empty', async () => {
      server.getLeagueNews.mockResolvedValue({
        news: [],
        teams: [],
        players: [],
        gameDay: 0,
        season: 0,
        level: 0,
        league: 0
      })
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).toContain('news.noNews')
    })

    it('renders news items when present', async () => {
      const newsItem = { id: 1, title: 'Big Win!', text: 'Team A won 5-0', likeCount: 0, liked: false, commentCount: 0 }
      server.getLeagueNews.mockResolvedValue({
        news: [newsItem],
        teams: [],
        players: [],
        gameDay: 5,
        season: 1,
        level: 0,
        league: 0
      })
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).not.toContain('news.noNews')
      expect(html).toContain('row mt-4')
    })

    it('renders news items with commentCount data without errors', async () => {
      const newsItem = { id: 1, title: 'Big Win!', text: 'Team A won 5-0', likeCount: 0, liked: false, commentCount: 7 }
      server.getLeagueNews.mockResolvedValue({
        news: [newsItem],
        teams: [],
        players: [],
        gameDay: 5,
        season: 1,
        level: 0,
        league: 0
      })
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).toContain('row mt-4')
      // showCommentOverlay is correctly imported and mocked
      expect(showCommentOverlay).toBeDefined()
    })

    it('displays game day and season', async () => {
      server.getLeagueNews.mockResolvedValue({
        news: [],
        teams: [],
        players: [],
        gameDay: 10,
        season: 2,
        level: 0,
        league: 0
      })
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).toContain('results.gameDay')
      expect(html).toContain('finances.season')
    })
  })

  describe('load', () => {
    it('fetches news from server', async () => {
      const mockResponse = {
        news: [{ id: 1, title: 'Test', text: 'Content' }],
        teams: [{ id: 1, name: 'Team A' }],
        players: [{ id: 1, name: 'Player 1' }],
        gameDay: 5,
        season: 1,
        level: 0,
        league: 0
      }
      server.getLeagueNews.mockResolvedValue(mockResponse)
      server.getLikedNews.mockResolvedValue({ news: [], teams: [], players: [] })

      const news = new News()
      await news.load()

      expect(news.news).toEqual(mockResponse.news)
      expect(news.teams).toEqual(mockResponse.teams)
      expect(news.players).toEqual(mockResponse.players)
      expect(news.gameDay).toBe(5)
      expect(news.season).toBe(1)
    })

    it('defaults to empty arrays and zeros on missing data', async () => {
      server.getLeagueNews.mockResolvedValue({})
      server.getLikedNews.mockResolvedValue({})

      const news = new News()
      await news.load()

      expect(news.news).toEqual([])
      expect(news.teams).toEqual([])
      expect(news.players).toEqual([])
      expect(news.gameDay).toBe(0)
      expect(news.season).toBe(0)
    })
  })

})
