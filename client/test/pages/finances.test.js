import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getSponsor: vi.fn(),
    getSponsorOffers: vi.fn(),
    getFinanceLog: vi.fn(),
    getSponsorNames: vi.fn(),
    chooseSponsor: vi.fn(),
    getMyBalance: vi.fn()
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

import { FinancesPage, renderFinancesPage } from '../../pages/finances.js'
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
    server.getSponsorNames.mockResolvedValue({
      sponsorNames: ['Sponsor A', 'Sponsor B', 'Sponsor C']
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

    it('extends UIElement', () => {
      const page = new FinancesPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderFinancesPage (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderFinancesPage).toBe('function')
    })
  })
})
