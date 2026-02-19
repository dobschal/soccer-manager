import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getLeagueNews: vi.fn()
  }
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

import { News, renderNews } from '../../pages/dashboard/news.js'
import { server } from '../../lib/gateway.js'

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
        season: 1
      })

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
        season: 0
      })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).toContain('news.noNews')
    })

    it('renders news items when present', async () => {
      const newsItem = { id: 1, title: 'Big Win!', text: 'Team A won 5-0' }
      server.getLeagueNews.mockResolvedValue({
        news: [newsItem],
        teams: [],
        players: [],
        gameDay: 5,
        season: 1
      })

      const news = new News()
      await news.load()

      const html = news.template
      expect(html).not.toContain('news.noNews')
      expect(html).toContain('row mt-4')
    })

    it('displays game day and season', async () => {
      server.getLeagueNews.mockResolvedValue({
        news: [],
        teams: [],
        players: [],
        gameDay: 10,
        season: 2
      })

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
        season: 1
      }
      server.getLeagueNews.mockResolvedValue(mockResponse)

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

      const news = new News()
      await news.load()

      expect(news.news).toEqual([])
      expect(news.teams).toEqual([])
      expect(news.players).toEqual([])
      expect(news.gameDay).toBe(0)
      expect(news.season).toBe(0)
    })
  })

  describe('renderNews', () => {
    it('returns News instance as string', () => {
      const result = renderNews()
      expect(typeof result).toBe('string')
    })
  })
})
