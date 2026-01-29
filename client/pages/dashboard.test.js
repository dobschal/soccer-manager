import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing
vi.mock('../lib/gateway.js', () => ({
  server: {
    getActionCards: vi.fn(),
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    getResults: vi.fn(),
    getLogMessages_V2: vi.fn(),
    useActionCard: vi.fn(),
    mergeCards: vi.fn()
  }
}))

vi.mock('../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../partials/overlay.js', () => ({
  showOverlay: vi.fn().mockReturnValue({ remove: vi.fn() })
}))

vi.mock('../partials/playerList.js', () => ({
  PlayerList: class {
    constructor() {}
    toString() { return '<div>Player List</div>' }
  }
}))

vi.mock('../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../lib/date.js', () => ({
  formatDate: vi.fn().mockReturnValue('Today 12:00')
}))

vi.mock('../partials/news.js', () => ({
  News: class {
    toString() { return '<div>News</div>' }
  }
}))

import { DashboardPage, renderDashboardPage } from './dashboard.js'
import { server } from '../lib/gateway.js'

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
    server.getLogMessages_V2.mockResolvedValue([])
  })

  describe('DashboardPage class', () => {
    it('has correct initial state', () => {
      const page = new DashboardPage()
      expect(page.actionCards).toEqual([])
      expect(page.messages).toEqual([])
    })

    it('loads data from server', async () => {
      const page = new DashboardPage()
      await page.load()

      expect(server.getActionCards).toHaveBeenCalled()
      expect(server.getMyTeam).toHaveBeenCalled()
      expect(server.getCurrentGameday).toHaveBeenCalled()
      expect(server.getResults).toHaveBeenCalled()
      expect(server.getLogMessages_V2).toHaveBeenCalled()
    })

    it('template contains team name after load', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Test FC')
    })

    it('template contains welcome message', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Welcome testuser')
    })

    it('template contains action cards section', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Action Cards')
    })

    it('template shows empty state when no action cards', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('No action cards available')
    })

    it('template contains messages section', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Messages')
    })

    it('renders action cards when available', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'LEVEL_UP_PLAYER_9' }]
      })

      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('Player Level Up')
      expect(page.template).toContain('Use now')
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
