import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getTradeHistory: vi.fn()
  }
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn().mockReturnValue(25)
}))

vi.mock('../../partials/link.js', () => ({
  Link: class {
    constructor(text) { this.text = text }
    toString() { return `<span class="link">${this.text}</span>` }
  }
}))

import { TradeHistoryPage, renderTradeHistory } from './tradeHistory.js'
import { server } from '../../lib/gateway.js'

describe('TradeHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    server.getTradeHistory.mockResolvedValue({
      trades: [],
      teams: [],
      players: []
    })
  })

  describe('TradeHistoryPage class', () => {
    it('loads data from server', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      expect(server.getTradeHistory).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Trade History')
    })

    it('template contains description text', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Trades happened in the past')
    })

    it('template contains table headers', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Player')
      expect(page.template).toContain('From')
      expect(page.template).toContain('To')
      expect(page.template).toContain('Price')
    })

    it('template renders trade history entries', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Traded Player', position: 'CM', level: 5, birth_season: -20 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Traded Player')
      expect(page.template).toContain('50,000 EUR')
      expect(page.template).toContain('Game Day: 6')
    })

    it('template shows game day dividers', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 },
          { id: 2, player_id: 2, from_team_id: 2, to_team_id: 1, price: 60000, season: 0, game_day: 6 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Player One', position: 'CM', level: 5, birth_season: -20 },
          { id: 2, name: 'Player Two', position: 'ST', level: 6, birth_season: -22 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Game Day: 6')
      expect(page.template).toContain('Game Day: 7')
    })

    it('extends UIElement', () => {
      const page = new TradeHistoryPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderTradeHistory (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderTradeHistory).toBe('function')
    })
  })
})
