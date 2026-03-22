import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getOffers: vi.fn(),
    acceptOffer: vi.fn(),
    declineOffer: vi.fn()
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

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

vi.mock('../../../lib/router.js', () => ({
  setQueryParams: vi.fn()
}))

vi.mock('../../../partials/table.js', async () => {
  const { UIElement } = await import('../../../lib/UIElement.js')
  return {
    Table: class extends UIElement {
      constructor (config) {
        super(config)
      }
      get template () {
        const headers = this.cols.map(c => `<th>${c.name}</th>`).join('')
        const rows = (this.data || []).map((item, i) => {
          const cells = this.renderRow(item, i)
          const attrs = typeof this.rowAttrs === 'function' ? ' ' + this.rowAttrs(item, i) : ''
          return `<tr${attrs}>${Array.isArray(cells) ? cells.map(c => `<td>${c}</td>`).join('') : cells}</tr>`
        }).join('')
        return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`
      }
      toString () { return this.template }
    }
  }
})

import { IncomingOffersPage } from '../../../pages/trades/incoming.js'
import { server } from '../../../lib/gateway.js'
import { toast } from '../../../partials/toast.js'
import { el } from '../../../lib/html.js'

const OFFER_DATA = {
  offers: [
    { id: 10, player_id: 1, from_team_id: 2, type: 'buy', offer_value: 50000 },
    { id: 11, player_id: 3, from_team_id: 4, type: 'buy', offer_value: 80000 }
  ],
  players: [
    { id: 1, name: 'Star Player', position: 'ST', level: 20, team_id: 1 },
    { id: 3, name: 'Midfielder', position: 'CM', level: 15, team_id: 1 }
  ],
  teams: [
    { id: 1, name: 'Test FC' },
    { id: 2, name: 'Buyer FC' },
    { id: 4, name: 'Rich Club' }
  ]
}

/**
 * Mount an IncomingOffersPage into the DOM with click handler attached.
 */
async function mountPage (offerData = OFFER_DATA) {
  server.getMyTeam.mockResolvedValue({ team: { id: 1, name: 'Test FC' } })
  server.getOffers.mockResolvedValue(offerData)

  const page = new IncomingOffersPage()
  await page.load()

  const wrapper = document.createElement('div')
  wrapper.innerHTML = page.template
  const rootEl = wrapper.firstElementChild
  rootEl.setAttribute('data-render_id', page._renderId)
  document.body.appendChild(rootEl)

  el.mockImplementation((query) => document.querySelector(query))
  page._attachClickHandler()

  return page
}

describe('IncomingOffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''

    server.getMyTeam.mockResolvedValue({
      team: { id: 1, name: 'Test FC' }
    })

    server.getOffers.mockResolvedValue({
      offers: [],
      players: [],
      teams: []
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
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

  describe('accept offer', () => {
    it('calls server.acceptOffer with the correct offer when accept button is clicked', async () => {
      server.acceptOffer.mockResolvedValue({})
      await mountPage()

      const acceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      expect(acceptBtn).not.toBeNull()

      await acceptBtn.click()
      // Allow async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.acceptOffer).toHaveBeenCalledWith(OFFER_DATA.offers[0])
    })

    it('shows success toast after accepting an offer', async () => {
      server.acceptOffer.mockResolvedValue({})
      await mountPage()

      const acceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      await acceptBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Buyer FC')
      )
    })

    it('reloads data from server after accepting', async () => {
      server.acceptOffer.mockResolvedValue({})
      const page = await mountPage()

      // After accept, the server should be called again to reload
      server.getMyTeam.mockClear()
      server.getOffers.mockClear()
      server.getOffers.mockResolvedValue({
        offers: [OFFER_DATA.offers[1]],
        players: [OFFER_DATA.players[1]],
        teams: OFFER_DATA.teams
      })

      const acceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      await acceptBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getOffers).toHaveBeenCalled()
      // After reload, accepted offer should be gone from page data
      expect(page.offers).toHaveLength(1)
      expect(page.offers[0].id).toBe(11)
    })

    it('shows error toast when accept fails', async () => {
      server.acceptOffer.mockRejectedValue(new Error('Transfer failed'))
      await mountPage()

      const acceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      await acceptBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(toast).toHaveBeenCalledWith('Transfer failed', 'error')
    })
  })

  describe('decline offer', () => {
    it('calls server.declineOffer with the correct offer when decline button is clicked', async () => {
      server.declineOffer.mockResolvedValue({})
      await mountPage()

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      expect(declineBtn).not.toBeNull()

      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.declineOffer).toHaveBeenCalledWith(OFFER_DATA.offers[0])
    })

    it('shows success toast after declining an offer', async () => {
      server.declineOffer.mockResolvedValue({})
      await mountPage()

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Buyer FC')
      )
    })

    it('removes the row from DOM without full reload after declining', async () => {
      server.declineOffer.mockResolvedValue({})
      const page = await mountPage()

      server.getMyTeam.mockClear()
      server.getOffers.mockClear()

      // Two rows initially
      expect(document.querySelectorAll('[data-offer]')).toHaveLength(2)

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      // No server reload — row is removed locally
      expect(server.getMyTeam).not.toHaveBeenCalled()
      expect(server.getOffers).not.toHaveBeenCalled()

      // Only one row remains in the DOM
      expect(document.querySelectorAll('[data-offer]')).toHaveLength(1)

      // Local data is updated
      expect(page.offers).toHaveLength(1)
      expect(page.offers[0].id).toBe(11)
    })

    it('re-indexes data-offer attributes after removing a row', async () => {
      server.declineOffer.mockResolvedValue({})
      await mountPage()

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Remaining row should have data-offer="0" (re-indexed)
      const remainingRow = document.querySelector('[data-offer="0"]')
      expect(remainingRow).not.toBeNull()
      expect(remainingRow.textContent).toContain('Midfielder')
    })

    it('shows empty state when last offer is declined', async () => {
      server.declineOffer.mockResolvedValue({})
      const singleOffer = {
        offers: [OFFER_DATA.offers[0]],
        players: [OFFER_DATA.players[0]],
        teams: OFFER_DATA.teams
      }
      await mountPage(singleOffer)

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(document.querySelectorAll('[data-offer]')).toHaveLength(0)
      // Empty state message should be visible (hidden class removed)
      const emptyCol = document.querySelector('.col')
      expect(emptyCol.classList.contains('hidden')).toBe(false)
    })

    it('shows error toast when decline fails', async () => {
      server.declineOffer.mockRejectedValue(new Error('Server error'))
      await mountPage()

      const declineBtn = document.querySelector('[data-offer="0"] .btn-danger')
      await declineBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(toast).toHaveBeenCalledWith('Server error', 'error')
    })
  })

  describe('accept/decline second offer after first', () => {
    it('can accept the second offer after the first was accepted', async () => {
      server.acceptOffer.mockResolvedValue({})
      const page = await mountPage()

      // Accept first offer
      server.getOffers.mockResolvedValue({
        offers: [OFFER_DATA.offers[1]],
        players: [OFFER_DATA.players[1]],
        teams: OFFER_DATA.teams
      })

      const firstAcceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      await firstAcceptBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.acceptOffer).toHaveBeenCalledWith(OFFER_DATA.offers[0])

      // After update, re-attach handler (simulating onUpdate)
      page._attachClickHandler()

      // Now accept the remaining offer (now at index 0)
      server.acceptOffer.mockClear()
      const secondAcceptBtn = document.querySelector('[data-offer="0"] .btn-primary')
      expect(secondAcceptBtn).not.toBeNull()

      await secondAcceptBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.acceptOffer).toHaveBeenCalledWith(OFFER_DATA.offers[1])
    })
  })

})
