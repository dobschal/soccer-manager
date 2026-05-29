import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyTeam: vi.fn(),
    getCurrentGameday: vi.fn(),
    updatePassStyle: vi.fn(),
    updatePlayStyle: vi.fn(),
    saveLineup: vi.fn().mockResolvedValue({ success: true, captainCleared: false }),
    saveBench: vi.fn().mockResolvedValue({ success: true })
  },
  showServerError: vi.fn()
}))

vi.mock('../../partials/lineup.js', () => ({
  lineUpData: { squadDataChanged: false },
  Lineup: class {
    constructor () {}
    toString () { return '<div class="lineup-mock"></div>' }
  }
}))

vi.mock('../../util/formation.js', () => ({
  Formation: { '4-4-2': '4-4-2', '4-3-3': '4-3-3' },
  getPositionsOfFormation: vi.fn(() => ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA', 'CA'])
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
      expect(html).toContain('data-subpage="ateam"')
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
    it('changes formation and auto-fills the lineup with suitable players', async () => {
      const team = testData.team({ formation: '4-4-2' })
      // Roster with one matching player for each slot in the mocked formation
      // ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA', 'CA']
      const players = [
        testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
        testData.player({ id: 2, position: 'LD', in_game_position: '' }),
        testData.player({ id: 3, position: 'CD', in_game_position: '' }),
        testData.player({ id: 4, position: 'CD', in_game_position: '' }),
        testData.player({ id: 5, position: 'RD', in_game_position: '' }),
        testData.player({ id: 6, position: 'LM', in_game_position: '' }),
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
        testData.player({ id: 8, position: 'CM', in_game_position: '' }),
        testData.player({ id: 9, position: 'RM', in_game_position: '' }),
        testData.player({ id: 10, position: 'CA', in_game_position: '', level: 80, freshness: 0.9 }),
        testData.player({ id: 11, position: 'CA', in_game_position: '', level: 40, freshness: 0.9 }),
        // Lower-level CA backup should NOT be picked when better ones are available
        testData.player({ id: 12, position: 'CA', in_game_position: '', level: 10, freshness: 0.9 })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created
      await page._subPageCache.ateam._changeFormation('4-3-3')

      expect(page.data.team.formation).toBe('4-3-3')
      const realPlayers = page.data.players.filter(p => !p.fake)
      // Each formation slot got filled (no fake placeholders) since enough players exist
      const lineup = realPlayers.filter(p => p.in_game_position).map(p => p.id).sort((a, b) => a - b)
      expect(lineup).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      // Highest-level CAs were preferred
      expect(realPlayers.find(p => p.id === 10).in_game_position).toBe('CA')
      expect(realPlayers.find(p => p.id === 11).in_game_position).toBe('CA')
      expect(realPlayers.find(p => p.id === 12).in_game_position).toBe('')
      // Lineup got persisted
      expect(server.saveLineup).toHaveBeenCalledTimes(1)
      const [savedPlayers, savedFormation] = server.saveLineup.mock.calls[0]
      expect(savedFormation).toBe('4-3-3')
      expect(savedPlayers).toEqual(realPlayers)
    })

    it('skips suspended and injured players and leaves an empty slot when no suitable player exists', async () => {
      const team = testData.team({ formation: '4-4-2' })
      const players = [
        testData.player({ id: 1, position: 'GK', is_suspended: true }),
        testData.player({ id: 2, position: 'LD' }),
        testData.player({ id: 3, position: 'CD' }),
        testData.player({ id: 4, position: 'CD', is_injured: true })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template
      await page._subPageCache.ateam._changeFormation('4-3-3')

      const real = page.data.players.filter(p => !p.fake)
      // Suspended GK and injured CD never get a lineup slot
      expect(real.find(p => p.id === 1).in_game_position).toBe('')
      expect(real.find(p => p.id === 4).in_game_position).toBe('')
      // GK position remains unfilled and is represented by a fake placeholder
      const fakes = page.data.players.filter(p => p.fake)
      expect(fakes.some(f => f.in_game_position === 'GK')).toBe(true)
      expect(fakes.some(f => f.in_game_position === 'CD')).toBe(true)
    })

    it('moves a player off the bench when they are auto-filled into the lineup', async () => {
      const team = testData.team({ formation: '4-4-2' })
      const players = [
        testData.player({ id: 1, position: 'GK', bench_position: 'BENCH_GK' })
      ]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template
      await page._subPageCache.ateam._changeFormation('4-3-3')

      const benchPlayer = page.data.players.find(p => p.id === 1)
      expect(benchPlayer.in_game_position).toBe('GK')
      expect(benchPlayer.bench_position).toBeNull()
      // saveBench reflects the cleared bench
      expect(server.saveBench).toHaveBeenCalledWith([])
    })
  })

  describe('tactic section', () => {
    it('renders the tactic header and selects below the bench', async () => {
      const team = testData.team()
      const players = [testData.player()]

      server.getMyTeam.mockResolvedValue({ team, players })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      void page.template // ensure ATeamPage is created

      const html = page._subPageCache.ateam.template
      const benchIdx = html.indexOf('myTeam.bench')
      const tacticIdx = html.indexOf('myTeam.tactic')
      expect(benchIdx).toBeGreaterThan(-1)
      expect(tacticIdx).toBeGreaterThan(benchIdx)
      expect(html).toContain('lineup-select')
      expect(html).toContain('pass-style-select')
      expect(html).toContain('play-style-select')
      expect(html).toContain('attack-mode-select')
      expect(html).toContain('captain-select')
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

  describe('PLAYER_SOLD server event', () => {
    it('exposes PLAYER_SOLD handler via serverEvents getter', () => {
      const page = new MyTeamPage()
      expect(typeof page.serverEvents.PLAYER_SOLD).toBe('function')
    })

    it('reloads and updates when PLAYER_SOLD fires', async () => {
      const team = testData.team()
      const initialPlayers = [
        testData.player({ id: 1, name: 'Kept Player' }),
        testData.player({ id: 2, name: 'Sold Player' })
      ]
      const updatedPlayers = [testData.player({ id: 1, name: 'Kept Player' })]

      server.getMyTeam
        .mockResolvedValueOnce({ team, players: initialPlayers })
        .mockResolvedValueOnce({ team, players: updatedPlayers })
      server.getCurrentGameday.mockResolvedValue({ season: 1 })

      const page = new MyTeamPage()
      await page.load()
      page._subPageCache = { ateam: { stale: true } }

      await page.serverEvents.PLAYER_SOLD.call(page)

      expect(server.getMyTeam).toHaveBeenCalledTimes(2)
      expect(page.data.players).toHaveLength(1)
      expect(page._subPageCache).toEqual({})
    })
  })
})
