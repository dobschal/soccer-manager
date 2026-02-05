import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    getStanding: vi.fn()
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
    constructor() {}
    toString() { return '<div>Player List</div>' }
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
    toString() { return '<div>News</div>' }
  }
}))

vi.mock('../../partials/actionCards.js', () => ({
  ActionCards: class {
    cards = []
    async load() {
      this.cards = (await import('../../lib/gateway.js')).server.getActionCards().then(r => r.actionCards)
    }
    toString() { return '<div>Action Cards Component</div>' }
  }
}))

vi.mock('../../partials/logMessages.js', () => ({
  LogMessages: class {
    messages = []
    async load() {}
    toString() { return '<div>Log Messages Component</div>' }
  }
}))

import { DashboardPage, renderDashboardPage } from '../../pages/dashboard.js'
import { server } from '../../lib/gateway.js'

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    server.getActionCards.mockResolvedValue({ actionCards: [] })
    server.getMyTeam.mockResolvedValue({
      team: { id: 1, name: 'Test FC', level: 1, league: 1 },
      user: { username: 'testuser' }
    })
    server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
    server.getResults.mockResolvedValue({ results: [] })
    server.getLogMessages.mockResolvedValue([])
    server.getLogMessageCount.mockResolvedValue({ count: 0 })
    server.deleteLogMessage.mockResolvedValue({ success: true })
    server.getNextGame.mockResolvedValue({ game: null, nextGameDate: null, opponent: null })
    server.getTeamById.mockResolvedValue({ id: 1, name: 'Test FC' })
    server.getStanding.mockResolvedValue([
      { team: { id: 1, name: 'Test FC' }, points: 10 }
    ])
  })

  describe('DashboardPage class', () => {
    it('loads data from server', async () => {
      const page = new DashboardPage()
      await page.load()

      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getCurrentGameday).toHaveBeenCalled()
      expect(server.getResults).toHaveBeenCalled()
    })

    it('template contains team name after load', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Test FC')
    })

    it('template contains welcome message', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Hey <b>testuser</b>')
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

    it('initializes log messages component', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page._logMessages).toBeDefined()
    })

    it('initializes action cards component', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page._actionCards).toBeDefined()
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
})
