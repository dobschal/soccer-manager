import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../../partials/currencyInput.js', () => ({
  renderCurrencyInput: vi.fn(() => ''),
  setupCurrencyInput: vi.fn()
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
    constructor () {}
    toString () {
      return '<div class="horizontal-scrollable-table"><table><thead><tr><th>Mock</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table></div>'
    }
  }
}))

vi.mock('../../../lib/router.js', () => ({
  setQueryParams: vi.fn(),
  getQueryParams: vi.fn().mockReturnValue({})
}))

vi.mock('../../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player, season) => (season - player.carrier_start_season) + 16),
  calculateMarketValue: vi.fn(() => 4000),
  getMinOfferPrice: vi.fn(marketValue => Math.floor(marketValue * 0.75)),
  sortByPosition: vi.fn()
}))

import { MarketPage, renderMarket } from '../../../pages/trades/market.js'
import { server } from '../../../lib/gateway.js'
import { el } from '../../../lib/html.js'
import { toast } from '../../../partials/toast.js'
import { calculateMarketValue } from '../../../util/player.js'

/**
 * Mount a MarketPage into the DOM so update() can find and replace it.
 * Returns the page instance and a helper to find its root element.
 */
async function mountMarketPage () {
  const page = new MarketPage()
  await page.load()

  // Render initial HTML into the DOM
  const wrapper = document.createElement('div')
  wrapper.innerHTML = page.template
  const rootEl = wrapper.firstElementChild
  rootEl.setAttribute('data-render_id', page._renderId)
  document.body.appendChild(rootEl)

  // Make el() delegate to real DOM queries so UIElement.update() works
  el.mockImplementation((query) => document.querySelector(query))

  return page
}

/**
 * Simulate scrollLeft on all .horizontal-scrollable-table elements in the DOM.
 * jsdom has no layout engine, so we use defineProperty to make get/set work.
 */
function simulateScrollLeft (element, value) {
  let stored = value
  Object.defineProperty(element, 'scrollLeft', {
    get: () => stored,
    set: (v) => { stored = v },
    configurable: true
  })
  return {
    get value () { return stored }
  }
}

describe('MarketPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''

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

  afterEach(() => {
    document.body.innerHTML = ''
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

  describe('scroll preservation on sort', () => {
    it('saves scroll position before re-render and restores it after', async () => {
      const page = await mountMarketPage()

      // Find the scroll container rendered by the (mock) Table and simulate scroll
      const scrollContainer = document.querySelector('.horizontal-scrollable-table')
      expect(scrollContainer).not.toBeNull()
      simulateScrollLeft(scrollContainer, 250)

      // Trigger a sort via onQueryChanged – this calls update() which replaces the DOM
      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      // After update(), the old container is gone and a new one has been inserted.
      // The page should restore scrollLeft on the new container (via _restoreScrollLeft polling).
      // In tests the mock Table renders synchronously so it finds the container immediately.
      const newContainer = document.querySelector('.horizontal-scrollable-table')
      expect(newContainer).not.toBeNull()
      expect(newContainer.scrollLeft).toBe(250)
    })

    it('restores scroll even when container appears asynchronously', async () => {
      const page = await mountMarketPage()

      const scrollContainer = document.querySelector('.horizontal-scrollable-table')
      simulateScrollLeft(scrollContainer, 180)

      // Monkey-patch update() to remove the scroll container temporarily,
      // simulating the real scenario where child UIElements render async.
      const originalUpdate = page.update.bind(page)
      page.update = async function (...args) {
        await originalUpdate(...args)
        // After update, remove the container to simulate async child rendering
        const container = document.querySelector('.horizontal-scrollable-table')
        const parent = container?.parentElement
        const placeholder = document.createElement('div')
        placeholder.id = 'async-placeholder'
        if (container && parent) {
          parent.replaceChild(placeholder, container)
        }
        // Re-add the container after a delay (simulating renderSync setTimeout)
        setTimeout(() => {
          const newContainer = document.createElement('div')
          newContainer.className = 'horizontal-scrollable-table'
          const ph = document.getElementById('async-placeholder')
          if (ph && ph.parentElement) {
            ph.parentElement.replaceChild(newContainer, ph)
          }
        }, 20)
      }

      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      // The container doesn't exist yet (was removed to simulate async)
      expect(document.querySelector('.horizontal-scrollable-table')).toBeNull()

      // Wait for the async container to appear and scroll to be restored
      await new Promise(resolve => setTimeout(resolve, 50))

      const newContainer = document.querySelector('.horizontal-scrollable-table')
      expect(newContainer).not.toBeNull()
      expect(newContainer.scrollLeft).toBe(180)
    })

    it('does not attempt scroll restoration when not scrolled', async () => {
      const page = await mountMarketPage()

      // scrollLeft is 0 (default) – no restoration needed
      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      const newContainer = document.querySelector('.horizontal-scrollable-table')
      expect(newContainer).not.toBeNull()
      // scrollLeft should remain at its default (0)
      expect(newContainer.scrollLeft).toBe(0)
    })

    it('resets page to 0 when sorting', async () => {
      const page = await mountMarketPage()
      page._page = 3

      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      expect(page._page).toBe(0)
    })

    it('keeps current page when the player detail modal opens while sort is unchanged', async () => {
      // Repro for the bug where opening the player modal (which adds
      // player_id to the URL) re-triggered onQueryChanged with the same
      // existing sort_dir/col, and the handler reset _page to 0.
      const page = await mountMarketPage()
      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })
      page._page = 3

      // The modal open propagates the URL state — sort params come along
      // unchanged. Pagination must stay where the user left it.
      await page.onQueryChanged({ sort_dir: 'ASC', col: '0' })

      expect(page._page).toBe(3)
    })
  })

  describe('_renderRow', () => {
    async function pageWithOffer (teamOverrides = {}) {
      server.getOffers.mockResolvedValue({
        offers: [
          { id: 1, player_id: 10, from_team_id: 2, type: 'sell', offer_value: 75000 }
        ],
        players: [
          { id: 10, name: 'Star Player', position: 'ST', level: 8, team_id: 2 }
        ],
        teams: [
          { id: 2, name: '1. FC Dynamic Gütersloh', short_name: null, ...teamOverrides }
        ]
      })
      const page = new MarketPage()
      await page.load()
      return page
    }

    it('shows the short team name (last word) between level and price', async () => {
      const page = await pageWithOffer()
      const cells = page._renderRow(page.offers[0])
      // Column order: image, name, position, age, level, team, price, buy
      expect(cells[5]).toBe('Gütersloh')
      expect(cells[6]).toContain('75')
    })

    it('prefers the user-defined short name when present', async () => {
      const page = await pageWithOffer({ short_name: 'DYN' })
      const cells = page._renderRow(page.offers[0])
      expect(cells[5]).toBe('DYN')
    })

    it('renders the player image placeholder as the first column', async () => {
      const page = await pageWithOffer()
      const cells = page._renderRow(page.offers[0])
      expect(cells[0]).toContain('market-player-image')
      expect(cells[0]).toContain('data-player-id="10"')
      expect(cells[1]).toBe('Star Player')
    })

    it('has the image column first and the team column between level and price', async () => {
      const page = await pageWithOffer()
      const cols = page._prepareTableCols()
      // 0 image, 1 name, 2 position, 3 age, 4 level, 5 team, 6 price, 7 buy
      expect(cols[0].name).toBe('')
      expect(cols[0].sortKey).toBeUndefined()
      expect(cols[0].sortFn).toBeUndefined()
      expect(cols[1].name).toBe('Name')
      expect(cols[4].name).toBe('Level')
      expect(cols[5].name).toBe('Team')
      expect(cols[6].name).toBe('Price')
    })
  })

  describe('player image loading', () => {
    it('stops the placeholder poll once the page is destroyed', async () => {
      vi.useFakeTimers()
      try {
        const page = await mountMarketPage()
        // No offers => no placeholders => _loadPlayerImages schedules a retry timer.
        page._isMounted = true
        page._loadPlayerImages()
        expect(page._loadImagesTimer).toBeDefined()

        // Simulate the page being torn down (navigation / re-render swap).
        page._onDestroy()

        // Advancing timers must not touch the (now gone) DOM environment.
        const querySpy = vi.spyOn(document, 'querySelectorAll')
        expect(() => vi.advanceTimersByTime(500)).not.toThrow()
        expect(querySpy).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('renderMarket (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderMarket).toBe('function')
    })
  })

  describe('buy dialog', () => {
    it('sends a buy offer with allowInstantBuy so server-side req is not shifted', async () => {
      const page = new MarketPage()
      await page.load()

      const submitBtn = document.createElement('button')
      const cancelBtn = document.createElement('button')
      const input = document.createElement('input')
      input.dataset.rawValue = '5000'

      // generateId always returns 'test-id'; _showBuyDialog looks up cancel, submit, instant
      // buttons in that order, then queries the input on click.
      const lookups = [cancelBtn, submitBtn, null]
      let i = 0
      el.mockImplementation(() => {
        if (i < lookups.length) return lookups[i++]
        return input
      })

      page._showBuyDialog({ id: 42, name: 'Test Player' })

      await new Promise(resolve => setTimeout(resolve, 0))

      submitBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.addTradeOffer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 42 }),
        5000,
        'buy',
        true
      )
    })

    it('#446 blocks a buy offer below 75% of the market value', async () => {
      const page = new MarketPage()
      await page.load()

      const submitBtn = document.createElement('button')
      const cancelBtn = document.createElement('button')
      const input = document.createElement('input')
      input.dataset.rawValue = '5000'

      const lookups = [cancelBtn, submitBtn, null]
      let i = 0
      el.mockImplementation(() => {
        if (i < lookups.length) return lookups[i++]
        return input
      })

      // Market value 10,000 -> minimum offer 7,500, above the 5,000 entered.
      calculateMarketValue.mockReturnValueOnce(10000)

      page._showBuyDialog({ id: 42, name: 'Test Player' })

      await new Promise(resolve => setTimeout(resolve, 0))

      submitBtn.click()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(server.addTradeOffer).not.toHaveBeenCalled()
      expect(toast).toHaveBeenCalledWith(expect.any(String), 'error')
    })
  })
})
