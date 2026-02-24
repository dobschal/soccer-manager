import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    updatePassStyle: vi.fn(),
    updatePlayStyle: vi.fn(),
    updateEmblem: vi.fn(),
    updateTeamName: vi.fn(),
    getNameLibrary: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../partials/lineup.js', () => ({
  lineUpData: { squadDataChanged: false },
  renderLineup: vi.fn(() => '<div class="lineup-mock"></div>')
}))

vi.mock('../../util/formation.js', () => ({
  Formation: { '4-4-2': '4-4-2', '4-3-3': '4-3-3' },
  getPositionsOfFormation: vi.fn(() => ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA', 'CA'])
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

vi.mock('../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/playerModal.js', () => ({
  showPlayerModal: vi.fn()
}))

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn(),
  fire: vi.fn()
}))

import { server } from '../../lib/gateway.js'
import { MyTeamPage } from '../../pages/my-team.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { showPlayerModal } from '../../partials/playerModal.js'
import { on, off } from '../../lib/event.js'

describe('MyTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('MyTeamPage class', () => {
    it('loads team data from server', async () => {
      const team = testData.team({ formation: '4-4-2', pass_style: 'mixed', play_style: 'normal' })
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1, gameDay: 5 })

      const page = new MyTeamPage()
      await page.load()

      expect(page.data.team).toEqual(team)
      expect(page.data.players).toEqual(players)
      expect(page.season).toBe(1)
    })

    it('template contains navigation tabs', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()

      const html = page.template
      expect(html).toContain('nav-pills')
      expect(html).toContain('#my-team')
      expect(html).toContain('#my-team?sub_page=youth')
    })

    it('renders A Team page by default', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      page.subPage = undefined
      await page.load()

      const html = page.template
      expect(html).toContain('lineup-mock')
      expect(html).toContain('player-list-mock')
    })

    it('calculates team strength correctly', async () => {
      const team = testData.team()
      const players = [
        testData.player({ level: 5, in_game_position: 'CM' }),
        testData.player({ level: 3, in_game_position: 'GK' }),
        testData.player({ level: 4, in_game_position: '' }) // Not in lineup
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created

      const strength = page._subPageCache.ateam._calculateTeamStrength(players)
      expect(strength).toBe(8) // 5 + 3, excluding player not in lineup
    })

    it('shows tutorial on mount', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      page.onMounted()

      expect(showTutorialIfNeeded).toHaveBeenCalledWith('team', expect.any(Object))
    })

    it('handles query param for player modal', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      await page.onQueryChanged({ player_id: '5' })

      expect(showPlayerModal).toHaveBeenCalledWith(5)
    })

    it('switches to youth tab when sub_page is youth', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      await page.onQueryChanged({ sub_page: 'youth' })

      expect(page.subPage).toBe('youth')
    })
  })

  describe('formation change', () => {
    it('changes formation and resets player positions', async () => {
      const team = testData.team({ formation: '4-4-2' })
      const players = [
        testData.player({ id: 1, in_game_position: 'CM', fake: false })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created
      page._subPageCache.ateam._changeFormation('4-3-3')

      expect(page.data.team.formation).toBe('4-3-3')
      // Real players should have position cleared
      const realPlayer = page.data.players.find(p => p.id === 1)
      expect(realPlayer.in_game_position).toBe('')
    })
  })

  describe('header rendering', () => {
    it('calculates total salary', async () => {
      const team = testData.team()
      const players = [
        testData.player({ level: 5, fake: false }),
        testData.player({ level: 3, fake: false })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created

      const html = page._subPageCache.ateam._renderHeader()
      expect(html).toContain('myTeam.salaryTotal')
    })

    it('calculates average age', async () => {
      const team = testData.team()
      const players = [
        testData.player({ birth_season: 0, fake: false })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 5 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created

      const html = page._subPageCache.ateam._renderHeader()
      expect(html).toContain('myTeam.avgAge')
    })
  })

  describe('YOUTH_PLAYER_PROMOTED event', () => {
    it('registers event listener on mount', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })
      on.mockReturnValue(123)

      const page = new MyTeamPage()
      await page.load()
      page.onMounted()

      expect(on).toHaveBeenCalledWith('YOUTH_PLAYER_PROMOTED', expect.any(Function))
      expect(page._youthPlayerPromotedEventId).toBe(123)
    })

    it('unregisters event listener on destroy', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })
      on.mockReturnValue(456)

      const page = new MyTeamPage()
      await page.load()
      page.onMounted()
      page.onDestroy()

      expect(off).toHaveBeenCalledWith(456)
    })

    it('reloads and updates when YOUTH_PLAYER_PROMOTED event fires', async () => {
      const team = testData.team()
      const initialPlayers = [testData.player({ id: 1, name: 'Initial Player' })]
      const updatedPlayers = [
        testData.player({ id: 1, name: 'Initial Player' }),
        testData.player({ id: 2, name: 'Promoted Youth' })
      ]

      let eventCallback
      on.mockImplementation((eventName, callback) => {
        if (eventName === 'YOUTH_PLAYER_PROMOTED') {
          eventCallback = callback
        }
        return 789
      })

      server.getMyTeam
        .mockResolvedValueOnce({ team, players: initialPlayers })
        .mockResolvedValueOnce({ team, players: updatedPlayers })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      page.onMounted()

      expect(page.data.players).toHaveLength(1)

      // Simulate the event firing
      await eventCallback()

      expect(server.getMyTeam).toHaveBeenCalledTimes(2)
      expect(page.data.players).toHaveLength(2)
      expect(page.data.players[1].name).toBe('Promoted Youth')
    })
  })
})
