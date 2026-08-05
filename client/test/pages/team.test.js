import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getTeam: vi.fn(),
    getStadiumByTeamId: vi.fn(),
    getMyTeam: vi.fn(),
    canPlayFriendlyToday: vi.fn(),
    playFriendlyMatch: vi.fn(),
    getTeamTransferHistory: vi.fn(),
    getTeamSeasonHistory: vi.fn(),
    getCurrentGameday: vi.fn(),
    getTeamTimelineGames: vi.fn(),
    isFriend: vi.fn(),
    adminGetTeamActionCards: vi.fn(),
    adminSetTeamBalance: vi.fn(),
    addFriend: vi.fn(),
    removeFriend: vi.fn()
  }
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem-mock"></svg>')
}))

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class {
    constructor () {}
    toString () { return '<div class="player-list-mock"></div>' }
  }
}))

vi.mock('../../partials/table.js', () => ({
  Table: class {
    constructor () {}
    toString () { return '<div class="table-mock"></div>' }
  }
}))

vi.mock('../../partials/playerModal.js', () => ({
  showPlayerModal: vi.fn()
}))

vi.mock('../../partials/stadiumModal.js', () => ({
  showStadiumModal: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/gameModal.js', () => ({
  showGameModal: vi.fn()
}))

vi.mock('../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn((level, league) => `${level + 1}. League ${league}`),
  formatCupRound: vi.fn((round) => `Round ${round}`)
}))

vi.mock('../../lib/router.js', () => ({
  setQueryParams: vi.fn(),
  goTo: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params) => params ? `${key} ${JSON.stringify(params)}` : key)
}))

import { server } from '../../lib/gateway.js'
import { TeamPage } from '../../pages/team.js'
import { showStadiumModal } from '../../partials/stadiumModal.js'
import { showPlayerModal } from '../../partials/playerModal.js'

describe('TeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mocks for the new friendly match methods
    server.getMyTeam.mockResolvedValue({ team: testData.team({ id: 999 }) })
    server.canPlayFriendlyToday.mockResolvedValue({ canPlay: true })
    // Default mocks for transfer and season history
    server.getTeamTransferHistory.mockResolvedValue({ transfers: [] })
    server.getTeamSeasonHistory.mockResolvedValue({ seasons: [] })
    server.getCurrentGameday.mockResolvedValue({ season: 0 })
    server.getTeamTimelineGames.mockResolvedValue({ games: [] })
    server.isFriend.mockResolvedValue({ isFriend: false })
  })

  describe('TeamPage class', () => {
    it('loads team data from server', async () => {
      const team = testData.team({ id: 5, name: 'Test Team' })
      const players = [testData.player({ level: 7 })]
      const user = testData.user({ username: 'testmanager' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      expect(page.team).toEqual(team)
      expect(page.players).toEqual(players)
      expect(page.user).toEqual(user)
    })

    it('throws error when no team id', async () => {
      const page = new TeamPage()
      page.teamId = undefined

      await expect(page.load()).rejects.toThrow('No team id present...')
    })

    it('calculates team strength from lineup players', async () => {
      const team = testData.team()
      const players = [
        testData.player({ level: 5, in_game_position: 'CM' }),
        testData.player({ level: 3, in_game_position: 'GK' }),
        testData.player({ level: 10, in_game_position: '' }) // Not in lineup
      ]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._teamStrength).toBe(8) // 5 + 3
    })

    it('calculates team freshness average', async () => {
      const team = testData.team()
      const players = [
        testData.player({ freshness: 0.8, in_game_position: 'CM' }),
        testData.player({ freshness: 0.6, in_game_position: 'GK' })
      ]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._teamFreshness).toBeCloseTo(0.7)
    })

    it('calculates stadium size', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium({
        north_stand_size: 1000,
        south_stand_size: 2000,
        east_stand_size: 3000,
        west_stand_size: 4000
      })

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._stadiumSize).toBe(10000)
    })

    it('hides the admin balance row for regular users', async () => {
      const team = testData.team({ id: 5 })
      server.getTeam.mockResolvedValue({ team, players: [testData.player()], user: null, isAdmin: false })
      server.getStadiumByTeamId.mockResolvedValue(testData.stadium())

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      expect(page._isAdmin).toBe(false)
      expect(page._renderBalanceRow()).toBe('')
      expect(page._renderAdminActionCards()).toBe('')
    })

    it('renders the editable balance row and the action card panel for admins', async () => {
      const team = testData.team({ id: 5, balance: 250000 })
      server.getTeam.mockResolvedValue({ team, players: [testData.player()], user: null, isAdmin: true })
      server.getStadiumByTeamId.mockResolvedValue(testData.stadium())

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      expect(page._isAdmin).toBe(true)
      const row = page._renderBalanceRow()
      expect(row).toContain('team.adminBalance')
      expect(row).toContain('value="250000"')
      expect(row).toContain('admin-balance-save')
      expect(page._adminCards.teamId).toBe(5)
    })

    it('writes the edited balance back to the server', async () => {
      const team = testData.team({ id: 5, balance: 250000 })
      server.getTeam.mockResolvedValue({ team, players: [testData.player()], user: null, isAdmin: true })
      server.getStadiumByTeamId.mockResolvedValue(testData.stadium())
      server.adminSetTeamBalance.mockResolvedValue({ success: true, balance: 999 })

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      const input = document.createElement('input')
      input.className = 'admin-balance-input'
      input.value = '999'
      vi.spyOn(document, 'querySelector').mockImplementation((selector) => (
        selector.includes('admin-balance-input') ? input : null
      ))

      await page._handleBalanceSave()

      expect(server.adminSetTeamBalance).toHaveBeenCalledWith(5, 999)
      expect(page.team.balance).toBe(999)
      vi.restoreAllMocks()
    })

    it('renders coach card with N/A for bot team', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('N/A')
      expect(html).toContain('avatar-placeholder.svg')
    })

    it('renders coach card with username and avatar for human team', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const user = testData.user({ username: 'manager123', avatar: 'foo.jpg' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('manager123')
      expect(html).toContain('/uploads/avatars/foo.jpg')
    })

    it('prefixes avatar URL with native server URL when running in native app', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const user = testData.user({ username: 'manager123', avatar: 'foo.jpg' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      window.__NATIVE_SERVER_URL = 'https://footballmanager.io'
      try {
        const page = new TeamPage()
        page.teamId = 1
        await page.load()

        const html = page._renderCoachCard()
        expect(html).toContain('src="https://footballmanager.io/uploads/avatars/foo.jpg"')
      } finally {
        delete window.__NATIVE_SERVER_URL
      }
    })

    it('renders coach since from coach_since (takeover date), not created_at', async () => {
      const team = testData.team({
        created_at: '2024-01-15T10:00:00Z',
        coach_since: '2025-06-20T10:00:00Z'
      })
      const players = [testData.player()]
      const user = testData.user({ username: 'manager123' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('20.06.2025')
      expect(html).not.toContain('15.01.2024')
    })

    it('shows dash when coach_since is missing (bot team)', async () => {
      const team = testData.team({ created_at: '2024-01-15T10:00:00Z' })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('myTeam.coachSince: -')
      expect(html).not.toContain('15.01.2024')
    })

    it('renders the coach info centered without a table', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const user = testData.user({ id: 55, username: 'manager123' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).not.toContain('team-info-table')
      expect(html).not.toContain('<table')
      expect(html).toContain('coach-info text-center')
    })

    it('links the coach card to the manager profile for a human team', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const user = testData.user({ id: 55, username: 'manager123' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('href="#user?id=55"')
      expect(html).toContain('coach-card-link')
    })

    it('does not make the coach card a link for a bot team (no user)', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).not.toContain('coach-card-link')
      expect(html).not.toContain('#user?id=')
    })

    it('falls back to user.created_at when coach_since is missing but user exists', async () => {
      const team = testData.team({ created_at: '2024-01-15T10:00:00Z', coach_since: null })
      const players = [testData.player()]
      const user = testData.user({ username: 'manager123', created_at: '2025-03-08T10:00:00Z' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page._renderCoachCard()
      expect(html).toContain('08.03.2025')
      expect(html).not.toContain('15.01.2024')
    })

    it('template contains team info', async () => {
      const team = testData.team({ name: 'Super FC' })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const html = page.template
      expect(html).toContain('Super FC')
      expect(html).toContain('emblem-mock')
      expect(html).toContain('player-list-mock')
    })
  })

  describe('event handlers', () => {
    it('handles stadium link click', async () => {
      const team = testData.team({ id: 5 })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      const events = page.events
      const mockEvent = { preventDefault: vi.fn() }
      events['.stadium-link'].click(mockEvent)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(showStadiumModal).toHaveBeenCalledWith(5)
    })

    it('handles query change for player modal', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)

      const page = new TeamPage()
      page.teamId = 1
      await page.load()
      await page.onQueryChanged({ player_id: '10', id: '1' })

      expect(showPlayerModal).toHaveBeenCalledWith(10)
    })

    it('refreshes when own team is updated elsewhere (e.g. emblem change in club page)', async () => {
      const team = testData.team({ id: 7 })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getMyTeam.mockResolvedValue({ team: testData.team({ id: 7 }) })

      const page = new TeamPage()
      page.teamId = 7
      await page.load()
      page.update = vi.fn()
      page.onMounted()

      window.dispatchEvent(new CustomEvent('my-team-updated'))

      expect(page.update).toHaveBeenCalledWith(true)

      page.onDestroy()
    })

    it('ignores my-team-updated for foreign teams', async () => {
      const team = testData.team({ id: 7 })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getMyTeam.mockResolvedValue({ team: testData.team({ id: 999 }) })

      const page = new TeamPage()
      page.teamId = 7
      await page.load()
      page.update = vi.fn()
      page.onMounted()

      window.dispatchEvent(new CustomEvent('my-team-updated'))

      expect(page.update).not.toHaveBeenCalled()

      page.onDestroy()
    })
  })
})
