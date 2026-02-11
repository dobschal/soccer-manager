import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getTeam: vi.fn(),
    getStadiumByTeamId: vi.fn(),
    getTeamValue: vi.fn(),
    getMyTeam: vi.fn(),
    canPlayFriendlyToday: vi.fn(),
    playFriendlyMatch: vi.fn(),
    getTeamTransferHistory: vi.fn(),
    getTeamSeasonHistory: vi.fn()
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

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve('<div class="player-image-mock"></div>'))
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
import { setQueryParams } from '../../lib/router.js'

describe('TeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mocks for the new friendly match methods
    server.getMyTeam.mockResolvedValue({ team: testData.team({ id: 999 }) })
    server.canPlayFriendlyToday.mockResolvedValue({ canPlay: true })
    // Default mocks for transfer and season history
    server.getTeamTransferHistory.mockResolvedValue({ transfers: [] })
    server.getTeamSeasonHistory.mockResolvedValue({ seasons: [] })
  })

  describe('TeamPage class', () => {
    it('loads team data from server', async () => {
      const team = testData.team({ id: 5, name: 'Test Team' })
      const players = [testData.player({ level: 7 })]
      const user = testData.user({ username: 'testmanager' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 500000 })

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      expect(page.team).toEqual(team)
      expect(page.players).toEqual(players)
      expect(page.user).toEqual(user)
      expect(page._teamValue).toBe(500000)
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
      server.getTeamValue.mockResolvedValue({ value: 100000 })

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
      server.getTeamValue.mockResolvedValue({ value: 100000 })

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
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._stadiumSize).toBe(10000)
    })

    it('returns N/A for bot team username', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._username).toContain('N/A')
    })

    it('returns username for human team', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const user = testData.user({ username: 'manager123' })
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._username).toBe('manager123')
    })

    it('finds best player by level', async () => {
      const team = testData.team()
      const players = [
        testData.player({ id: 1, level: 5 }),
        testData.player({ id: 2, level: 10 }),
        testData.player({ id: 3, level: 7 })
      ]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._bestPlayer.id).toBe(2)
      expect(page._bestPlayer.level).toBe(10)
    })

    it('returns null for best player when no players', async () => {
      const team = testData.team()
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players: [], user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 0 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      expect(page._bestPlayer).toBeNull()
    })

    it('template contains team info', async () => {
      const team = testData.team({ name: 'Super FC' })
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

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
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 5
      await page.load()

      const events = page.events
      const mockEvent = { preventDefault: vi.fn() }
      events['.stadium-link'].click(mockEvent)

      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(showStadiumModal).toHaveBeenCalledWith(5)
    })

    it('handles best player link click', async () => {
      const team = testData.team()
      const players = [testData.player({ id: 42 })]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()

      const events = page.events
      const mockEvent = {
        currentTarget: { dataset: { playerId: '42' } }
      }
      events['.best-player-link'].click(mockEvent)

      expect(setQueryParams).toHaveBeenCalledWith({ player_id: '42' })
    })

    it('handles query change for player modal', async () => {
      const team = testData.team()
      const players = [testData.player()]
      const stadium = testData.stadium()

      server.getTeam.mockResolvedValue({ team, players, user: null })
      server.getStadiumByTeamId.mockResolvedValue(stadium)
      server.getTeamValue.mockResolvedValue({ value: 100000 })

      const page = new TeamPage()
      page.teamId = 1
      await page.load()
      await page.onQueryChanged({ player_id: '10', id: '1' })

      expect(showPlayerModal).toHaveBeenCalledWith(10)
    })
  })
})
