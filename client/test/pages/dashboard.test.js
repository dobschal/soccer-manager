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
    getFriendsLastGameDayGames: vi.fn(),
    getDashboardUrgencies: vi.fn(),
    getPendingActionCards: vi.fn(),
    getNewLogMessageCount: vi.fn(),
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

vi.mock('../../pages/forum.js', () => ({
  ForumPage: class {
    async load () {}
    toString () {
      return '<div>Forum Component</div>'
    }
  }
}))

vi.mock('../../partials/searchPanel.js', () => ({
  SearchPanel: class {
    async load () {}
    async applyQueryParams () {}
    toString () {
      return '<div>Search Panel Component</div>'
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
    server.getFriendsLastGameDayGames.mockResolvedValue({
      games: []
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
      expect(page.template).toContain('#dashboard?sub_page=forum')
      expect(page.template).toContain('#dashboard?sub_page=search')
      expect(page.template).toContain('#dashboard?sub_page=messages')
    })

    it('orders Messages tab after Forum and Search', async () => {
      const page = new DashboardPage()
      await page.load()
      const html = page.template
      const forumIdx = html.indexOf('#dashboard?sub_page=forum')
      const searchIdx = html.indexOf('#dashboard?sub_page=search')
      const messagesIdx = html.indexOf('#dashboard?sub_page=messages')
      expect(forumIdx).toBeGreaterThan(0)
      expect(searchIdx).toBeGreaterThan(forumIdx)
      expect(messagesIdx).toBeGreaterThan(searchIdx)
    })

    it('template renders forum sub-page when sub_page=forum', async () => {
      const page = new DashboardPage()
      await page.load()
      page.subPage = 'forum'
      expect(page.template).toContain('Forum Component')
    })

    it('template renders search sub-page when sub_page=search', async () => {
      const page = new DashboardPage()
      await page.load()
      page.subPage = 'search'
      expect(page.template).toContain('Search Panel Component')
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

    it('renders community feature-request card linking to forum category 3', async () => {
      const page = new DashboardPage()
      await page.load()
      const html = page.template
      expect(html).toContain('Community-Driven')
      expect(html).toContain('#dashboard?sub_page=forum&category=3')
    })

    it('renders the invite-a-friend card with a referral CTA', async () => {
      const page = new DashboardPage()
      await page.load()
      const html = page.template
      expect(html).toContain('Invite friends, earn rewards')
      expect(html).toContain('Invite friends')
    })
  })

  describe('renderDashboardPage (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderDashboardPage).toBe('function')
    })
  })

  describe('initial onQueryChanged after first render', () => {
    it('does not re-refresh start page data on the first onQueryChanged (would cause flicker)', async () => {
      const page = new DashboardPage()
      await page.load()

      // After load, the router fires query-changed once. subPage is null and
      // params.sub_page is undefined, so without the guard the else-if branch
      // would re-fetch and re-render the start sub-page, causing a visible
      // fade-in flicker on first page open.
      const callsAfterLoad = server.getDashboardUrgencies.mock.calls.length
      await page.onQueryChanged({})

      expect(server.getDashboardUrgencies).toHaveBeenCalledTimes(callsAfterLoad)
    })

    it('does refresh start page data on a later onQueryChanged when returning to start', async () => {
      const page = new DashboardPage()
      await page.load()
      const callsAfterLoad = server.getDashboardUrgencies.mock.calls.length

      // First onQueryChanged after render: skipped (initial)
      await page.onQueryChanged({})
      expect(server.getDashboardUrgencies).toHaveBeenCalledTimes(callsAfterLoad)

      // Subsequent onQueryChanged with no sub_page: simulates returning from
      // another page. This should refresh.
      await page.onQueryChanged({})
      expect(server.getDashboardUrgencies).toHaveBeenCalledTimes(callsAfterLoad + 1)
    })

    it('refreshes team (name + emblem) when returning to start so an edit on another page is reflected', async () => {
      const page = new DashboardPage()
      await page.load()
      expect(page.team.name).toBe('Test FC')

      // User navigates to club info, renames the team, and returns to dashboard.
      server.getMyTeam.mockResolvedValue({
        team: { id: 1, name: 'Renamed FC', level: 1, league: 1, emblem: 'new-emblem' },
        user: { username: 'testuser' }
      })

      // First onQueryChanged is the post-load no-op
      await page.onQueryChanged({})
      // Second onQueryChanged simulates returning from another page
      await page.onQueryChanged({})

      expect(page.team.name).toBe('Renamed FC')
      expect(page.team.emblem).toBe('new-emblem')
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

  describe('league slider initial slide selection', () => {
    it('defaults to the last played game on the first visit of a game day', async () => {
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 50, gameDay: 4, team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 },
          { id: 51, gameDay: 5, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      // Index 1 in the merged array is the last played game (gameDay 5).
      expect(page._initialSlideIndex).toBe(1)
    })

    it('marks the game day as seen on the first visit so subsequent visits can switch to upcoming', async () => {
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 51, gameDay: 5, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      expect(localStorage.setItem).toHaveBeenCalledWith('dashboardSliderSeen_0_5', '1')
    })

    it('switches to the next upcoming game when the dashboard is opened a second time on the same game day', async () => {
      // Simulate that the seen marker for the current game day is already set.
      localStorage.getItem.mockImplementation(key => key === 'dashboardSliderSeen_0_5' ? '1' : null)

      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 50, gameDay: 4, team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 },
          { id: 51, gameDay: 5, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      // Index 2 in the merged array is the first upcoming game (gameDay 6).
      expect(page._initialSlideIndex).toBe(2)
    })

    it('still defaults to the last played game on a new game day even if a previous one was seen', async () => {
      // The marker from a previous game day should not affect the current one.
      localStorage.getItem.mockImplementation(key => key === 'dashboardSliderSeen_0_4' ? '1' : null)

      server.getCurrentGameday.mockResolvedValue({ season: 0, gameDay: 5 })
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [
          { id: 50, gameDay: 4, team1Id: 1, team2Id: 2, goalsTeam1: 1, goalsTeam2: 0 },
          { id: 51, gameDay: 5, team1Id: 1, team2Id: 3, goalsTeam1: 2, goalsTeam2: 1 }
        ],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._initialSlideIndex).toBe(1)
    })

    it('falls back to the first upcoming game when there is no played game', async () => {
      server.getGamesForSlider.mockResolvedValue({
        pastGames: [],
        upcomingGames: [
          { id: 52, gameDay: 6, gameDate: '2026-05-05', team1Id: 1, team2Id: 4 }
        ],
        nextGameDate: null
      })

      const page = new DashboardPage()
      await page.load()

      expect(page._initialSlideIndex).toBe(0)
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
