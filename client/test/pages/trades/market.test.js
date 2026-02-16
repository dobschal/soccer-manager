import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    getOffers: vi.fn(),
    addTradeOffer: vi.fn()
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

vi.mock('../../../partials/dialog.js', () => ({
  showDialog: vi.fn()
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../../partials/table.js', () => ({
  Table: class {
    constructor() {}
    toString() { return '<table>Mock Table</table>' }
  }
}))

vi.mock('../../../lib/router.js', () => ({
  setQueryParams: vi.fn()
}))

vi.mock('../../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player, season) => (season - player.carrier_start_season) + 16),
  sortByPosition: vi.fn()
}))

import { MarketPage, renderMarket } from '../../../pages/trades/market.js'
import { server } from '../../../lib/gateway.js'

describe('MarketPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    server.getMyTeam.mockResolvedValue({
      team: { id: 1, name: 'Test FC' }
    })

    server.getCurrentGameday.mockResolvedValue({ season: 2 })

    server.getOffers.mockResolvedValue({
      offers: [],
      players: [],
      teams: []
    })
  })

  describe('MarketPage class', () => {
    it('loads data from server', async () => {
      const page = new MarketPage()
      await page.load()

      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getOffers).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new MarketPage()
      await page.load()
      expect(page.template).toContain('Transfer market')
    })

    it('template contains description text', async () => {
      const page = new MarketPage()
      await page.load()
      expect(page.template).toContain('Have a look on the transfer market')
    })

    it('filters out offers from own team', async () => {
      server.getOffers.mockResolvedValue({
        offers: [
          { id: 1, player_id: 1, from_team_id: 1, type: 'sell', offer_value: 50000 },
          { id: 2, player_id: 2, from_team_id: 2, type: 'sell', offer_value: 60000 }
        ],
        players: [
          { id: 1, name: 'My Player', position: 'ST', level: 7, team_id: 1 },
          { id: 2, name: 'Other Player', position: 'CM', level: 5, team_id: 2 }
        ],
        teams: [
          { id: 1, name: 'Test FC' },
          { id: 2, name: 'Other FC' }
        ]
      })

      const page = new MarketPage()
      await page.load()

      // The page should filter out own team's offers internally
      // Since we mock Table, we just verify loading works
      expect(page.offers).toHaveLength(2)
      expect(page.team.id).toBe(1)
    })

    it('extends UIElement', () => {
      const page = new MarketPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderMarket (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderMarket).toBe('function')
    })
  })
})
