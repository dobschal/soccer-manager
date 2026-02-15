import { describe, it, expect, vi, beforeEach } from 'vitest'

let tableConstructorArgs = null

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'trades.tradeHistoryTitle': 'Trade History',
      'trades.tradeHistoryDesc': 'Here are the recent transfers:',
      'trades.noTradeHistory': 'No trade history...',
      'trades.player': 'Player',
      'finances.from': 'From',
      'finances.to2': 'To',
      'finances.date': 'Date',
      'trades.price': 'Price',
      'results.gameDay': `Game Day ${params.day || ''}`,
      'finances.season': `Season ${params.season || ''}`,
      'common.prev': 'Previous',
      'common.next': 'Next'
    }
    return translations[key] || key
  })
}))

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getTradeHistory: vi.fn()
  }
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../../util/player.js', () => ({
  calculatePlayerAge: vi.fn().mockReturnValue(25)
}))

vi.mock('../../../partials/link.js', () => ({
  Link: class {
    constructor (text) { this.text = text }
    toString () { return `<span class="link">${this.text}</span>` }
  }
}))

vi.mock('../../../lib/router.js', () => ({
  goTo: vi.fn(),
  getQueryParams: vi.fn().mockReturnValue({}),
  setQueryParams: vi.fn()
}))

vi.mock('../../../partials/table.js', () => ({
  Table: class MockTable {
    constructor (config) {
      tableConstructorArgs = config
      this.config = config
    }

    toString () {
      const headers = this.config.cols.map(c => `<th>${c.name}</th>`).join('')
      const rows = this.config.data.map(item => {
        const cells = this.config.renderRow(item).map(c => `<td>${c}</td>`).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      return `<table class="table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
    }
  }
}))

import { TradeHistoryPage, renderTradeHistory } from '../../../pages/trades/tradeHistory.js'
import { server } from '../../../lib/gateway.js'

describe('TradeHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableConstructorArgs = null

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
      expect(page.template).toContain('Here are the recent transfers')
    })

    it('shows no trade history message when empty', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('No trade history...')
    })

    it('template contains table headers', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Test Player', position: 'CM', level: 5, birth_season: -20 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('Player')
      expect(page.template).toContain('From')
      expect(page.template).toContain('To')
      expect(page.template).toContain('Date')
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
    })

    it('shows date column with season and game day', async () => {
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
      expect(page.template).toContain('Game Day 6')
      expect(page.template).toContain('Game Day 7')
      expect(page.template).toContain('Season 1')
    })

    it('shows team names with team link attributes', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Test Player', position: 'CM', level: 5, birth_season: -20 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('data-team-link="1"')
      expect(page.template).toContain('data-team-link="2"')
      expect(page.template).toContain('Team A')
      expect(page.template).toContain('Team B')
    })

    it('passes correct columns to Table', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 }
        ],
        teams: [{ id: 1, name: 'Team A' }, { id: 2, name: 'Team B' }],
        players: [{ id: 1, name: 'P1', position: 'CM', level: 5, birth_season: -20 }]
      })

      const page = new TradeHistoryPage()
      await page.load()
      // Access template to trigger Table construction
      page.template

      expect(tableConstructorArgs).not.toBeNull()
      expect(tableConstructorArgs.cols).toHaveLength(5)
      expect(tableConstructorArgs.cols[0].name).toBe('Player')
      expect(tableConstructorArgs.cols[1].name).toBe('From')
      expect(tableConstructorArgs.cols[2].name).toBe('To')
      expect(tableConstructorArgs.cols[3].name).toBe('Date')
      expect(tableConstructorArgs.cols[4].name).toBe('Price')
    })

    it('columns have correct sortable configuration', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 }
        ],
        teams: [{ id: 1, name: 'Team A' }, { id: 2, name: 'Team B' }],
        players: [{ id: 1, name: 'P1', position: 'CM', level: 5, birth_season: -20 }]
      })

      const page = new TradeHistoryPage()
      await page.load()
      page.template

      // Player, From, To, Date have sortFn
      expect(typeof tableConstructorArgs.cols[0].sortFn).toBe('function')
      expect(typeof tableConstructorArgs.cols[1].sortFn).toBe('function')
      expect(typeof tableConstructorArgs.cols[2].sortFn).toBe('function')
      expect(typeof tableConstructorArgs.cols[3].sortFn).toBe('function')
      // Price has sortKey
      expect(tableConstructorArgs.cols[4].sortKey).toBe('price')
    })

    it('extends UIElement', () => {
      const page = new TradeHistoryPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('pagination', () => {
    function createTrades (count) {
      const trades = []
      const teams = [{ id: 1, name: 'Team A' }, { id: 2, name: 'Team B' }]
      const players = [{ id: 1, name: 'Player', position: 'CM', level: 5, birth_season: -20 }]
      for (let i = 0; i < count; i++) {
        trades.push({
          id: i + 1,
          player_id: 1,
          from_team_id: 1,
          to_team_id: 2,
          price: 10000 * (i + 1),
          season: 0,
          game_day: i
        })
      }
      return { trades, teams, players }
    }

    it('shows pagination when more than 20 trades', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(25))

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).toContain('pagination')
      expect(page.template).toContain('Previous')
      expect(page.template).toContain('Next')
    })

    it('hides pagination when 20 or fewer trades', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(20))

      const page = new TradeHistoryPage()
      await page.load()
      expect(page.template).not.toContain('Previous')
      expect(page.template).not.toContain('Next')
    })

    it('only shows PAGE_SIZE trades per page', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(25))

      const page = new TradeHistoryPage()
      await page.load()
      page.template

      expect(tableConstructorArgs).not.toBeNull()
      expect(tableConstructorArgs.data).toHaveLength(20)
    })

    it('second page shows remaining trades', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(25))

      const page = new TradeHistoryPage()
      await page.load()
      page._page = 1
      page.template

      expect(tableConstructorArgs).not.toBeNull()
      expect(tableConstructorArgs.data).toHaveLength(5)
    })

    it('_loadPage updates page and calls update', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(25))

      const page = new TradeHistoryPage()
      await page.load()
      page.update = vi.fn()

      page._loadPage(1)
      expect(page._page).toBe(1)
      expect(page.update).toHaveBeenCalled()
    })

    it('_loadPage ignores out of bounds page index', async () => {
      server.getTradeHistory.mockResolvedValue(createTrades(25))

      const page = new TradeHistoryPage()
      await page.load()
      page.update = vi.fn()

      page._loadPage(-1)
      expect(page._page).toBe(0)
      expect(page.update).not.toHaveBeenCalled()

      page._loadPage(5)
      expect(page._page).toBe(0)
      expect(page.update).not.toHaveBeenCalled()
    })
  })

  describe('sorting', () => {
    it('onQueryChanged sorts trades and resets page', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 },
          { id: 2, player_id: 2, from_team_id: 2, to_team_id: 1, price: 30000, season: 0, game_day: 6 },
          { id: 3, player_id: 1, from_team_id: 1, to_team_id: 2, price: 70000, season: 0, game_day: 7 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Alpha', position: 'CM', level: 5, birth_season: -20 },
          { id: 2, name: 'Beta', position: 'ST', level: 6, birth_season: -22 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      page._page = 1
      page.update = vi.fn()

      // Sort by price ascending (col index 4, sortKey: 'price')
      page.onQueryChanged({ sort_dir: 'ASC', col: '4' })

      expect(page._page).toBe(0)
      expect(page.update).toHaveBeenCalled()
      expect(page.trades[0].price).toBe(30000)
      expect(page.trades[1].price).toBe(50000)
      expect(page.trades[2].price).toBe(70000)
    })

    it('onQueryChanged sorts by price descending', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 1, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 },
          { id: 2, player_id: 2, from_team_id: 2, to_team_id: 1, price: 30000, season: 0, game_day: 6 },
          { id: 3, player_id: 1, from_team_id: 1, to_team_id: 2, price: 70000, season: 0, game_day: 7 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Alpha', position: 'CM', level: 5, birth_season: -20 },
          { id: 2, name: 'Beta', position: 'ST', level: 6, birth_season: -22 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      page.update = vi.fn()

      page.onQueryChanged({ sort_dir: 'DESC', col: '4' })

      expect(page.trades[0].price).toBe(70000)
      expect(page.trades[2].price).toBe(30000)
    })

    it('onQueryChanged sorts by player name using sortFn', async () => {
      server.getTradeHistory.mockResolvedValue({
        trades: [
          { id: 1, player_id: 2, from_team_id: 1, to_team_id: 2, price: 50000, season: 0, game_day: 5 },
          { id: 2, player_id: 1, from_team_id: 2, to_team_id: 1, price: 30000, season: 0, game_day: 6 }
        ],
        teams: [
          { id: 1, name: 'Team A' },
          { id: 2, name: 'Team B' }
        ],
        players: [
          { id: 1, name: 'Alpha', position: 'CM', level: 5, birth_season: -20 },
          { id: 2, name: 'Zeta', position: 'ST', level: 6, birth_season: -22 }
        ]
      })

      const page = new TradeHistoryPage()
      await page.load()
      page.update = vi.fn()

      // Sort by player name ascending (col index 0)
      page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      expect(page.trades[0].player_id).toBe(1) // Alpha first
      expect(page.trades[1].player_id).toBe(2) // Zeta second
    })

    it('onQueryChanged does nothing without sort params', async () => {
      const page = new TradeHistoryPage()
      await page.load()
      page.update = vi.fn()

      page.onQueryChanged({})

      expect(page.update).not.toHaveBeenCalled()
    })
  })

  describe('renderTradeHistory (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderTradeHistory).toBe('function')
    })
  })
})
