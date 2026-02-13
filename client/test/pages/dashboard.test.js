import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage, renderDashboardPage } from '../../pages/dashboard.js'
import { server } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'

// Mock all dependencies before importing
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getActionCards: vi.fn(),
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    getResults: vi.fn(),
    getLogMessages: vi.fn(),
    getLogMessageCount: vi.fn(),
    deleteLogMessage: vi.fn(),
    getNextGame: vi.fn(),
    getTeamById: vi.fn(),
    useActionCard: vi.fn(),
    mergeCards: vi.fn(),
    getStanding: vi.fn(),
    getGamesForSlider: vi.fn(),
    getFriendlyGames: vi.fn(),
    getMyCupGames: vi.fn(),
    getFinanceLog: vi.fn(),
    getDashboardUrgencies: vi.fn(),
    getTutorialStatus: vi.fn()
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

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn().mockReturnValue({ remove: vi.fn() })
}))

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class {
    constructor () {
    }

    toString () {
      return '<div>Player List</div>'
    }
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/date.js', () => ({
  formatDate: vi.fn().mockReturnValue('Today 12:00')
}))

vi.mock('../../partials/news.js', () => ({
  News: class {
    toString () {
      return '<div>News</div>'
    }
  }
}))

vi.mock('../../partials/actionCards.js', () => ({
  ActionCards: class {
    cards = []

    async load () {
      this.cards = (await import('../../lib/gateway.js')).server.getActionCards().then(r => r.actionCards)
    }

    toString () {
      return '<div>Action Cards Component</div>'
    }
  }
}))

vi.mock('../../partials/logMessages.js', () => ({
  LogMessages: class {
    messages = []

    async load () {
    }

    toString () {
      return '<div>Log Messages Component</div>'
    }
  }
}))

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    server.getActionCards.mockResolvedValue({ actionCards: [] })
    server.getMyTeam.mockResolvedValue({
      team: {
        id: 1,
        name: 'Test FC',
        level: 1,
        league: 1
      },
      user: { username: 'testuser' }
    })
    server.getCurrentGameday.mockResolvedValue({
      season: 0,
      gameDay: 5
    })
    server.getResults.mockResolvedValue({ results: [] })
    server.getLogMessages.mockResolvedValue([])
    server.getLogMessageCount.mockResolvedValue({ count: 0 })
    server.deleteLogMessage.mockResolvedValue({ success: true })
    server.getNextGame.mockResolvedValue({
      game: null,
      nextGameDate: null,
      opponent: null
    })
    server.getTeamById.mockResolvedValue({
      id: 1,
      name: 'Test FC'
    })
    server.getStanding.mockResolvedValue([
      {
        team: {
          id: 1,
          name: 'Test FC'
        },
        points: 10
      }
    ])
    server.getGamesForSlider.mockResolvedValue({
      pastGames: [],
      upcomingGames: [],
      nextGameDate: null
    })
    server.getFriendlyGames.mockResolvedValue({
      games: []
    })
    server.getMyCupGames.mockResolvedValue({
      games: []
    })
    server.getFinanceLog.mockResolvedValue({
      log: []
    })
    server.getDashboardUrgencies.mockResolvedValue({
      urgencies: []
    })
    server.getTutorialStatus.mockResolvedValue({
      tutorialCompleted: { dashboard: true }
    })
  })

  describe('DashboardPage class', () => {
    it('loads data from server', async () => {
      const page = new DashboardPage()
      await page.load()

      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getCurrentGameday).toHaveBeenCalled()
      expect(server.getGamesForSlider).toHaveBeenCalled()
    })

    it('template contains team name after load', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Test FC')
    })

    it('template contains standing section', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('table')
      expect(page.template).toContain('#results')
    })

    it('template contains action cards component', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Action Cards Component')
    })

    it('template contains log messages component', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Log Messages Component')
    })

    it('extends UIElement', () => {
      const page = new DashboardPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderDashboardPage (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderDashboardPage).toBe('function')
    })
  })

  describe('urgency overlay', () => {
    beforeEach(() => {
      // Mock large screen
      window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    })

    it('calls getDashboardUrgencies during load', async () => {
      const page = new DashboardPage()
      await page.load()

      expect(server.getDashboardUrgencies).toHaveBeenCalled()
    })

    it('stores urgencies from server response', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._urgencies).toEqual([{ type: 'NO_SPONSOR' }])
    })

    it('shows overlay when urgencies exist and not yet shown this gameday', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      expect(showOverlay).toHaveBeenCalled()
      const [title, , content] = showOverlay.mock.calls[0]
      expect(title).toBe('Action Required')
      expect(content).toContain('#finances')
    })

    it('does NOT show overlay when already shown this gameday', async () => {
      // localStorage is mocked in setup.js - configure getItem to return 'true' for urgency key
      window.localStorage.getItem.mockImplementation((key) =>
        key === 'urgencyOverlayShown_0_5' ? 'true' : null
      )

      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      expect(showOverlay).not.toHaveBeenCalled()
    })

    it('does NOT show overlay when no urgencies', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: []
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      expect(showOverlay).not.toHaveBeenCalled()
    })

    it('does NOT show overlay on small screens', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false })

      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      expect(showOverlay).not.toHaveBeenCalled()
    })

    it('renders correct link for INCOMPLETE_LINEUP', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'INCOMPLETE_LINEUP', count: 7 }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      const content = showOverlay.mock.calls[0][2]
      expect(content).toContain('#my-team')
      expect(content).toContain('Go to My Team')
    })

    it('renders correct link for YOUTH_LOW_STATS', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'YOUTH_LOW_STATS', count: 2 }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      const content = showOverlay.mock.calls[0][2]
      expect(content).toContain('#my-team?tab=youth')
      expect(content).toContain('Go to Youth Team')
    })

    it('renders correct link for INCOMING_OFFERS', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'INCOMING_OFFERS', count: 3 }]
      })

      const page = new DashboardPage()
      await page.load()

      vi.useFakeTimers()
      page.onMounted()
      vi.runAllTimers()
      vi.useRealTimers()

      const content = showOverlay.mock.calls[0][2]
      expect(content).toContain('#trades?tab=incoming')
      expect(content).toContain('Go to Incoming Offers')
    })
  })
})
