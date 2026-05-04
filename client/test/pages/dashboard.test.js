import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage, renderDashboardPage } from '../../pages/dashboard.js'
import { server } from '../../lib/gateway.js'

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
    canPlayFriendlyToday: vi.fn(),
    getDashboardUrgencies: vi.fn(),
    getPendingActionCards: vi.fn(),
    getNewLogMessageCount: vi.fn(),
    getTutorialStatus: vi.fn(),
    markGameAsSeen: vi.fn()
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

vi.mock('../../partials/gameSlider.js', () => ({
  GameSlider: class {
    toString () { return '<div>Game Slider</div>' }
  }
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn().mockReturnValue('<svg>emblem</svg>')
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn().mockReturnValue('1. League')
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn(),
  getQueryParams: vi.fn().mockReturnValue({})
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../pages/dashboard/news.js', () => ({
  News: class {
    toString () {
      return '<div>News</div>'
    }
  }
}))

vi.mock('../../pages/dashboard/actionCards.js', () => ({
  ActionCards: class {
    async load () {
      this.cards = (await import('../../lib/gateway.js')).server.getActionCards().then(r => r.actionCards)
    }
    cards = []

    toString () {
      return '<div>Action Cards Component</div>'
    }
  }
}))

vi.mock('../../pages/dashboard/logMessages.js', () => ({
  LogMessages: class {
    async load () {
    }
    messages = []

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
    server.canPlayFriendlyToday.mockResolvedValue({
      canPlay: false
    })
    server.getDashboardUrgencies.mockResolvedValue({
      urgencies: []
    })
    server.getPendingActionCards.mockResolvedValue({
      pendingCards: []
    })
    server.getNewLogMessageCount.mockResolvedValue({
      count: 0
    })
    server.getTutorialStatus.mockResolvedValue({
      tutorialCompleted: {}
    })
    server.markGameAsSeen.mockResolvedValue({ success: true })
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

    it('loads standing data', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(server.getStanding).toHaveBeenCalled()
      expect(page.standing).toHaveLength(1)
      expect(page.standing[0].team.name).toBe('Test FC')
    })

    it('template contains action cards component on cards sub-page', async () => {
      const page = new DashboardPage()
      await page.load()
      page.subPage = 'cards'
      expect(page.template).toContain('Action Cards Component')
    })

    it('template contains log messages component on messages sub-page', async () => {
      const page = new DashboardPage()
      await page.load()
      page.subPage = 'messages'
      expect(page.template).toContain('Log Messages Component')
    })

    it('default template contains nav pills for tabs', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).toContain('nav-pills')
      expect(page.template).toContain('#dashboard?sub_page=cards')
      expect(page.template).toContain('#dashboard?sub_page=news')
      expect(page.template).toContain('#dashboard?sub_page=messages')
    })

    it('default sub-page does not contain action cards or log messages', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.template).not.toContain('Action Cards Component')
      expect(page.template).not.toContain('Log Messages Component')
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

  describe('urgency refresh on navigation back to start', () => {
    it('re-fetches urgencies when navigating back to start page so resolved urgencies disappear', async () => {
      // 1. Initial load with an urgency (e.g. INCOMPLETE_LINEUP)
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'INCOMPLETE_LINEUP', count: 7 }]
      })

      const page = new DashboardPage()
      await page.load()

      // Verify urgency is present in the initial render
      const initialHtml = page.template
      expect(initialHtml).toContain('fa-exclamation-circle')

      // 2. Navigate away to another sub-page (e.g. cards)
      await page.onQueryChanged({ sub_page: 'cards' })
      expect(page.subPage).toBe('cards')

      // 3. User fixes the issue (lineup is now complete) — server returns no urgencies
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: []
      })

      // 4. Navigate back to the start page
      await page.onQueryChanged({ sub_page: undefined })

      // 5. Verify urgencies were re-fetched
      expect(server.getDashboardUrgencies).toHaveBeenCalledTimes(2)

      // 6. Verify the start page no longer shows the urgency
      expect(page._urgencies).toEqual([])
      // Invalidate cached sub-page so template uses fresh data
      const html = page._subPageCache.start.toString()
      expect(html).toContain('fa-check-circle')
      expect(html).not.toContain('fa-exclamation-circle')
    })
  })

  describe('cup result seen tracking', () => {
    it('sets _cupResultAlreadySeen to false when the latest played cup game has seen=false', async () => {
      server.getMyCupGames.mockResolvedValue({
        totalRounds: 4,
        games: [
          { id: 100, played: 1, seen: false, gameDate: '2026-04-01', team1Id: 1, team2Id: 2 },
          { id: 101, played: 0, gameDate: '2026-05-01', team1Id: 1, team2Id: 3 }
        ]
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._cupResultAlreadySeen).toBe(false)
      expect(server.markGameAsSeen).toHaveBeenCalledWith(100)
    })

    it('sets _cupResultAlreadySeen to true when the latest played cup game has seen=true', async () => {
      server.getMyCupGames.mockResolvedValue({
        totalRounds: 4,
        games: [
          { id: 100, played: 1, seen: true, gameDate: '2026-04-01', team1Id: 1, team2Id: 2 },
          { id: 101, played: 0, gameDate: '2026-05-01', team1Id: 1, team2Id: 3 }
        ]
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._cupResultAlreadySeen).toBe(true)
      expect(server.markGameAsSeen).not.toHaveBeenCalledWith(100)
    })

    it('sets _cupResultAlreadySeen to false when there are no played cup games', async () => {
      server.getMyCupGames.mockResolvedValue({
        totalRounds: 4,
        games: [
          { id: 101, played: 0, gameDate: '2026-05-01', team1Id: 1, team2Id: 3 }
        ]
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._cupResultAlreadySeen).toBe(false)
    })
  })

  describe('league slider initial slide selection', () => {
    it('shows the last played game when seen=false on first visit', async () => {
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 50, gameDay: 4, seen: true, team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 },
          { id: 51, gameDay: 5, seen: false, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      // Index 1 in the merged array is the last played game (gameDay 5)
      expect(page._initialSlideIndex).toBe(1)
      expect(server.markGameAsSeen).toHaveBeenCalledWith(51)
    })

    it('shows the next upcoming game when the last played has seen=true', async () => {
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 50, gameDay: 4, seen: true, team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 },
          { id: 51, gameDay: 5, seen: true, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      // Index 2 in the merged array is the first upcoming game (gameDay 6)
      expect(page._initialSlideIndex).toBe(2)
      expect(server.markGameAsSeen).not.toHaveBeenCalledWith(51)
    })
  })

  describe('urgency checklist', () => {
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

    it('shows checkmarks for all items when no urgencies', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: []
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      expect(html).toContain('fa-check-circle')
      expect(html).not.toContain('fa-exclamation-circle')
    })

    it('shows exclamation mark with link for INCOMPLETE_LINEUP', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'INCOMPLETE_LINEUP', count: 7 }]
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      expect(html).toContain('fa-exclamation-circle')
      expect(html).toContain('#my-team')
      expect(html).toContain('7/11')
    })

    it('shows exclamation mark with link for YOUTH_LOW_STATS', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'YOUTH_LOW_STATS', count: 2 }]
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      expect(html).toContain('fa-exclamation-circle')
      expect(html).toContain('#my-team?sub_page=youth')
    })

    it('shows exclamation mark with link for INCOMING_OFFERS', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'INCOMING_OFFERS', count: 3 }]
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      expect(html).toContain('fa-exclamation-circle')
      expect(html).toContain('#trades?sub_page=incoming')
    })

    it('shows exclamation mark with link for NO_SPONSOR', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      expect(html).toContain('fa-exclamation-circle')
      expect(html).toContain('#club?sub_page=finances')
    })

    it('shows mix of checkmarks and exclamation marks', async () => {
      server.getDashboardUrgencies.mockResolvedValue({
        urgencies: [{ type: 'NO_SPONSOR' }]
      })

      const page = new DashboardPage()
      await page.load()

      const html = page.template
      // Should have both check marks (for other items) and exclamation (for NO_SPONSOR)
      expect(html).toContain('fa-check-circle')
      expect(html).toContain('fa-exclamation-circle')
    })
  })
})
