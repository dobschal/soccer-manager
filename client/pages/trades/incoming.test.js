import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getOffers: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn()
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

vi.mock('../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../lib/router.js', () => ({
  setQueryParams: vi.fn()
}))

import { IncomingOffersPage, renderIncomingOffers } from './incoming.js'
import { server } from '../../lib/gateway.js'

describe('IncomingOffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    server.getMyTeam.mockResolvedValue({
      team: { id: 1, name: 'Test FC' }
    })

    server.getOffers.mockResolvedValue({
      offers: [],
      players: [],
      teams: []
    })
  })

  describe('IncomingOffersPage class', () => {
    it('loads data from server', async () => {
      const page = new IncomingOffersPage()
      await page.load()

      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getOffers).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new IncomingOffersPage()
      await page.load()
      expect(page.template).toContain('Incoming Offers')
    })

    it('template contains table headers', async () => {
      const page = new IncomingOffersPage()
      await page.load()
      expect(page.template).toContain('Name')
      expect(page.template).toContain('Team')
      expect(page.template).toContain('Position')
      expect(page.template).toContain('Level')
      expect(page.template).toContain('Price')
    })

    it('template shows empty state when no offers', async () => {
      const page = new IncomingOffersPage()
      await page.load()
      expect(page.template).toContain('No incoming buy offers')
    })

    it('template shows incoming buy offers for my players', async () => {
      server.getOffers.mockResolvedValue({
        offers: [
          { id: 1, player_id: 1, from_team_id: 2, type: 'buy', offer_value: 50000 }
        ],
        players: [
          { id: 1, name: 'My Player', position: 'CM', level: 5, team_id: 1 }
        ],
        teams: [
          { id: 1, name: 'Test FC' },
          { id: 2, name: 'Buyer FC' }
        ]
      })

      const page = new IncomingOffersPage()
      await page.load()
      expect(page.template).toContain('My Player')
      expect(page.template).toContain('Buyer FC')
      expect(page.template).toContain('CM')
      expect(page.template).toContain('50,000 EUR')
    })

    it('filters out sell offers', async () => {
      server.getOffers.mockResolvedValue({
        offers: [
          { id: 1, player_id: 1, from_team_id: 2, type: 'sell', offer_value: 50000 }
        ],
        players: [
          { id: 1, name: 'Other Player', position: 'CM', level: 5, team_id: 2 }
        ],
        teams: [
          { id: 1, name: 'Test FC' },
          { id: 2, name: 'Seller FC' }
        ]
      })

      const page = new IncomingOffersPage()
      await page.load()
      expect(page.template).not.toContain('Other Player')
    })

    it('extends UIElement', () => {
      const page = new IncomingOffersPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderIncomingOffers (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderIncomingOffers).toBe('function')
    })
  })
})
