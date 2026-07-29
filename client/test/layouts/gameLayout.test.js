import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLayout, hideNavigation } from '../../layouts/gameLayout.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getNextGameDate: vi.fn().mockResolvedValue({ date: new Date(Date.now() + 60000).toISOString() }),
    getMyBalance: vi.fn().mockResolvedValue({ balance: 100000 }),
    getVersion: vi.fn().mockResolvedValue({ version: '1.0.0' }),
    getCurrentGameday: vi.fn().mockResolvedValue({ gameday: 1 }),
    getMyTeam: vi.fn().mockResolvedValue({ user: { username: 'testuser' }, team: { id: 1 }, isAdmin: false }),
    getNewLogMessageCount: vi.fn().mockResolvedValue({ count: 0 })
  }
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn().mockReturnValue('event-id'),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn().mockReturnValue({ remove: vi.fn() })
}))

vi.mock('../../partials/search.js', () => ({
  showSearchOverlay: vi.fn()
}))

vi.mock('../../lib/websocket.js', () => ({
  disconnectWebSocket: vi.fn(),
  onServerEvent: vi.fn(),
  offServerEvent: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => {
    const translations = {
      'nav.home': 'Home',
      'nav.team': 'Team',
      'nav.league': 'League',
      'nav.club': 'Club',
      'nav.transfers': 'Transfers',
      'nav.settings': 'Settings',
      'nav.search': 'Search',
      'nav.logout': 'Logout',
      'nav.language': 'Language',
      'nav.run': 'Run',
      'nav.day': 'Gameday 1 Season 1',
      'footer.imprintPrivacy': 'Imprint & Privacy'
    }
    return translations[key] || key
  },
  getLocale: () => 'en',
  setLocale: vi.fn()
}))

vi.mock('../../partials/balance.js', () => ({
  Balance: class {
    toString () {
      return '<span>100,000 EUR</span>'
    }
  }
}))

vi.mock('../../partials/tutorialProgress.js', () => ({
  TutorialProgress: class {
    toString () {
      return '<div data-testid="tutorial-progress"></div>'
    }
  }
}))

describe('GameLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    server.getNextGameDate.mockResolvedValue({ date: new Date(Date.now() + 60000).toISOString() })
  })

  describe('GameLayout class', () => {
    it('loads next game date from server', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(server.getNextGameDate).toHaveBeenCalled()
    })

    it('template contains navbar with brand', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('FootballManager.IO')
      expect(layout.template).toContain('navbar')
    })

    it('template contains navigation items', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('Team')
      expect(layout.template).toContain('League')
      expect(layout.template).toContain('Club')
      expect(layout.template).toContain('Transfers')
    })

    it('template contains page container', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('id="page"')
    })

    it('renders the tutorial progress card inside the page container so it shows on every page', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('data-testid="tutorial-progress"')
    })

    it('template contains settings button', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('settings-button')
      expect(layout.template).toContain('Settings')
    })

    it('template contains desktop search button', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('id="search-button"')
      expect(layout.template).toContain('fa-search')
      expect(layout.template).toContain('aria-label="Search"')
    })

    it('search button click navigates to the search page', async () => {
      const { goTo } = await import('../../lib/router.js')
      const layout = new GameLayout()
      await layout.load()
      layout.events['#search-button'].click()
      expect(goTo).toHaveBeenCalledWith('dashboard?sub_page=search')
    })

    it('template contains balance', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('100,000 EUR')
    })

    it('template contains nav links with correct hrefs', async () => {
      const layout = new GameLayout()
      await layout.load()
      expect(layout.template).toContain('href="#my-team"')
      expect(layout.template).toContain('href="#results"')
      expect(layout.template).toContain('href="#club"')
      expect(layout.template).toContain('href="#trades"')
    })

    it('extends UIElement', () => {
      const layout = new GameLayout()
      expect(layout.isUIElement).toBe(true)
    })
  })

  describe('serverEvents', () => {
    it('has a BUY_OFFER_ACCEPTED handler', () => {
      const layout = new GameLayout()
      expect(layout.serverEvents).toHaveProperty('BUY_OFFER_ACCEPTED')
      expect(typeof layout.serverEvents.BUY_OFFER_ACCEPTED).toBe('function')
    })

    it('BUY_OFFER_ACCEPTED handler calls toast with success', () => {
      const layout = new GameLayout()
      layout.serverEvents.BUY_OFFER_ACCEPTED({
        playerName: 'Star Player',
        sellerTeamName: 'Selling FC',
        price: 50000
      })
      expect(toast).toHaveBeenCalledWith(
        expect.any(String),
        'success'
      )
    })
  })

  describe('hideNavigation utility', () => {
    it('is exported as a function', () => {
      expect(typeof hideNavigation).toBe('function')
    })
  })

})
