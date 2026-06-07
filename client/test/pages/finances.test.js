import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getSponsor: vi.fn(),
    getSponsorOffers: vi.fn(),
    getFinanceLog: vi.fn(),
    getFinanceLogBounds: vi.fn(),
    getSponsorNames: vi.fn(),
    chooseSponsor: vi.fn(),
    getMyBalance: vi.fn(),
    getEstimatedTvMoney: vi.fn()
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

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/balance.js', () => ({
  Balance: class {
    toString() { return '<span>100,000 EUR</span>' }
  }
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../partials/balanceChart.js', () => ({
  BalanceChart: class {
    toString() { return '<canvas></canvas>' }
  }
}))

vi.mock('../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

import { FinancesPage } from '../../pages/club/finances.js'
import { server } from '../../lib/gateway.js'

describe('FinancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getSponsor.mockResolvedValue({ sponsor: null })
    server.getSponsorOffers.mockResolvedValue({
      sponsors: [
        { id: 1, name: 'Sponsor A', value: 5000, duration: 10 },
        { id: 2, name: 'Sponsor B', value: 10000, duration: 20 }
      ]
    })
    server.getFinanceLog.mockResolvedValue({ log: [] })
    server.getFinanceLogBounds.mockResolvedValue({
      minSeason: 0,
      minGameDay: 0,
      maxSeason: 0,
      maxGameDay: 5,
      gameDayLabels: []
    })
    server.getSponsorNames.mockResolvedValue({
      sponsorNames: ['Sponsor A', 'Sponsor B', 'Sponsor C']
    })
    server.getEstimatedTvMoney.mockResolvedValue({
      base: 100000,
      level: 1,
      rank: 5,
      totalTeams: 18,
      estimatedValue: 1400000
    })
  })

  describe('FinancesPage class', () => {
    it('loads data from server', async () => {
      const page = new FinancesPage()
      await page.load()

      expect(server.getSponsor).toHaveBeenCalled()
      expect(server.getSponsorOffers).toHaveBeenCalled()
      expect(server.getFinanceLog).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Finances')
    })

    it('template contains choose sponsor section when no current sponsor', async () => {
      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Choose Sponsor')
    })

    it('template contains transactions section', async () => {
      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Transactions')
    })

    it('renders sponsor offers', async () => {
      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Sponsor A')
      expect(page.template).toContain('Sponsor B')
    })

    it('renders finance log entries', async () => {
      server.getFinanceLog.mockResolvedValue({
        log: [
          { id: 1, value: 5000, balance: 105000, reason: 'Ticket sales', game_day: 1, season: 0 }
        ]
      })

      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Ticket sales')
    })

    // Internal game_day counts cup days too, so the displayed match_day for
    // league match day 34 might be game_day 42. The divider row label must
    // use match_day from the server, not game_day + 1.
    it('uses match_day for the league-day divider, not game_day + 1', async () => {
      server.getFinanceLog.mockResolvedValue({
        log: [
          { id: 1, value: 5000, balance: 105000, reason: 'Ticket sales', game_day: 42, season: 4, match_day: 34, match_day_kind: 'league' }
        ]
      })

      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Game Day: 34')
      expect(page.template).not.toContain('Game Day: 43')
    })

    it('renders cup-round divider for cup-only days', async () => {
      server.getFinanceLog.mockResolvedValue({
        log: [
          { id: 1, value: 5000, balance: 105000, reason: 'Cup prize', game_day: 20, season: 4, match_day: 3, match_day_kind: 'cup' }
        ]
      })

      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Cup Round: 3')
      expect(page.template).not.toContain('Game Day: 21')
    })

    it('uses match_day labels in the filter dropdown', async () => {
      server.getFinanceLogBounds.mockResolvedValue({
        minSeason: 0,
        minGameDay: 5,
        maxSeason: 0,
        maxGameDay: 5,
        gameDayLabels: [
          { season: 0, game_day: 5, match_day: 4, kind: 'league' }
        ]
      })

      const page = new FinancesPage()
      await page.load()
      expect(page.template).toContain('Game Day 4')
      expect(page.template).not.toContain('Day 6')
    })

    it('renders TV money section with estimate from the server', async () => {
      const page = new FinancesPage()
      await page.load()
      expect(server.getEstimatedTvMoney).toHaveBeenCalled()
      expect(page.template).toContain('tv-money-card')
      expect(page.template).toContain('1,400,000 EUR')
    })

    it('extends UIElement', () => {
      const page = new FinancesPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('FinancesPage export', () => {
    it('is a UIElement class', () => {
      expect(FinancesPage.isUIElement).toBe(true)
    })
  })
})
