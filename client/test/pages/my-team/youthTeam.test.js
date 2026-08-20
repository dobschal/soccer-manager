import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getYouthTeam: vi.fn(),
    promoteYouthPlayer: vi.fn(),
    fireYouthPlayer: vi.fn(),
    setYouthTrainingMode: vi.fn(),
    setYouthPlayerTrainingMode: vi.fn(),
    getStadium: vi.fn()
  },
  showServerError: vi.fn()
}))

// The squad photo's backdrop comes out of the 3D scene; booting Three.js has
// nothing to do with what these tests check.
vi.mock('../../../partials/stadiumCanvas.js', () => ({
  StadiumCanvas: class {
    constructor (stadium, team, canvasId, options) {
      this.stadium = stadium
      this.team = team
      this.canvasId = canvasId
      this.options = options
    }
    onMounted () {}
    onDestroy () {}
    whenReady () { return Promise.resolve(false) }
    captureBuilding () { return null }
    toString () { return '<canvas id="youth-academy-still-canvas"></canvas>' }
  }
}))

vi.mock('../../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn(),
  onChange: vi.fn()
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn(),
  fire: vi.fn()
}))

import { server } from '../../../lib/gateway.js'
import { YouthTeamPage } from '../../../pages/my-team/youthTeam.js'
import { onClick } from '../../../lib/htmlEventHandlers.js'
import { toast } from '../../../partials/toast.js'
import { fire } from '../../../lib/event.js'
import { SERVER_EVENTS } from '../../../lib/serverEvents.js'
import { cachedBuildingStill, forgetBuildingStills, rememberBuildingStill } from '../../../lib/buildingStill.js'
import { BUILDING_BACKDROP_VIEWS } from '../../../partials/clubBuildingsScene.js'

describe('YouthTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('YouthTeamPage class', () => {
    it('loads youth team data from server', async () => {
      const youthPlayers = [
        { id: 1, name: 'Youth Player 1', age: 16, level: 15 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      expect(page.youthPlayers).toEqual(youthPlayers)
      expect(page.trainingMode).toBe('rest')
    })
  })

  describe('#448 next game day countdown (UTC based)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('counts down to the next 12:00 UTC boundary regardless of local timezone', () => {
      // 08:00 UTC -> next game day is 12:00 UTC -> 04:00:00 remaining
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T08:00:00Z'))
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      expect(page._getTimeUntilNextGameDay()).toBe('04:00:00')
    })

    it('counts down to the next 00:00 UTC boundary in the afternoon', () => {
      // 18:30 UTC -> next game day is 00:00 UTC next day -> 05:30:00 remaining
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T18:30:00Z'))
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      expect(page._getTimeUntilNextGameDay()).toBe('05:30:00')
    })
  })

  describe('#youth change training mode from the list', () => {
    function makePage (youthPlayers, slotsByMode) {
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      page.youthPlayers = youthPlayers
      page.slotsByMode = slotsByMode
      page.load = vi.fn()
      page.update = vi.fn()
      return page
    }

    it('assigns the player to a mode that still has a free slot', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [{ id: 1, training_mode: 'rest' }]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      expect(server.setYouthPlayerTrainingMode).toHaveBeenCalledTimes(1)
      expect(server.setYouthPlayerTrainingMode).toHaveBeenCalledWith(1, 'training')
    })

    it('frees the last slot first when the target mode is full', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [
        { id: 1, training_mode: 'rest' },
        { id: 2, training_mode: 'training' },
        { id: 3, training_mode: 'training' }
      ]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      // last occupant (id 3) freed, then the player assigned
      expect(server.setYouthPlayerTrainingMode).toHaveBeenNthCalledWith(1, 3, null)
      expect(server.setYouthPlayerTrainingMode).toHaveBeenNthCalledWith(2, 1, 'training')
    })

    it('#517 shows a warning toast when a full mode kicks another player out', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [
        { id: 1, name: 'Newcomer', training_mode: 'rest' },
        { id: 2, name: 'Alpha', training_mode: 'training' },
        { id: 3, name: 'Bravo', training_mode: 'training' }
      ]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      expect(toast).toHaveBeenCalledWith('youthTeam.modeFullPlayerReplaced', 'warning')
    })

    it('#517 shows a plain success toast when the mode still has a free slot', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [
        { id: 1, name: 'Newcomer', training_mode: 'rest' },
        { id: 2, name: 'Alpha', training_mode: 'training' }
      ]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      expect(toast).toHaveBeenCalledWith('youthTeam.trainingModeUpdated', 'success')
    })

    it('unassigns the player when choosing the empty option', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [{ id: 1, training_mode: 'training' }]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], '')

      expect(server.setYouthPlayerTrainingMode).toHaveBeenCalledWith(1, null)
    })

    it('does nothing when the mode is unchanged', async () => {
      const players = [{ id: 1, training_mode: 'training' }]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      expect(server.setYouthPlayerTrainingMode).not.toHaveBeenCalled()
    })

    it('leaves the caller responsible for reloading (server event drives updates)', async () => {
      server.setYouthPlayerTrainingMode.mockResolvedValue({ success: true })
      const players = [{ id: 1, training_mode: 'rest' }]
      const page = makePage(players, { training: 2, friendly_match: 2, rest: 4 })

      await page._handlePlayerModeChange(players[0], 'training')

      // The page no longer refetches the whole team after a mode change —
      // server events (YOUTH_PLAYER_TRAINING_MODE_CHANGED) drive the surgical
      // update of the affected row and the mode-selector section.
      expect(page.load).not.toHaveBeenCalled()
      expect(page.update).not.toHaveBeenCalled()
    })
  })

  describe('YOUTH_PLAYER_TRAINING_MODE_CHANGED server event', () => {
    it('registers a handler for the event', async () => {
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      const handlers = page.serverEvents
      expect(handlers[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]).toBeTypeOf('function')
    })

    it('mutates the affected player\'s training_mode in place and does not full-page rerender', async () => {
      const players = [
        { id: 1, name: 'A', training_mode: 'rest' },
        { id: 2, name: 'B', training_mode: 'training' }
      ]
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      page.youthPlayers = players
      page.load = vi.fn()
      page.update = vi.fn()
      page._refreshModeSelector = vi.fn()

      const handler = page.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]
      handler({ youthPlayerId: 1, previousMode: 'rest', newMode: 'training' })

      expect(players[0].training_mode).toBe('training')
      expect(players[1].training_mode).toBe('training') // unchanged
      expect(page._refreshModeSelector).toHaveBeenCalledTimes(1)
      // Crucially: no full-page re-render.
      expect(page.update).not.toHaveBeenCalled()
      expect(page.load).not.toHaveBeenCalled()
    })

    it('ignores events for players not on this team', async () => {
      const players = [{ id: 1, name: 'A', training_mode: 'rest' }]
      const page = new YouthTeamPage({ load: vi.fn(), update: vi.fn() })
      page.youthPlayers = players
      page._refreshModeSelector = vi.fn()

      const handler = page.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]
      handler({ youthPlayerId: 999, previousMode: 'rest', newMode: 'training' })

      expect(players[0].training_mode).toBe('rest')
      expect(page._refreshModeSelector).not.toHaveBeenCalled()
    })
  })

  describe('promote youth player', () => {
    it('fires YOUTH_PLAYER_PROMOTED event after successful promotion', async () => {
      const youthPlayers = [
        { id: 1, name: 'Promoted Player', position: 'CM', age: 16, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })
      server.promoteYouthPlayer.mockResolvedValue({ success: true })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      page.load = vi.fn()
      page.update = vi.fn()
      await page.load()

      // Get the onClick callback for the promote confirmation
      let promoteCallback
      onClick.mockImplementation((id, callback) => {
        promoteCallback = callback
      })

      // Trigger _showPromoteConfirm to register the callback
      page._showPromoteConfirm(youthPlayers[0])

      // Execute the promote callback
      await promoteCallback()

      expect(server.promoteYouthPlayer).toHaveBeenCalledWith(1)
      expect(fire).toHaveBeenCalledWith('YOUTH_PLAYER_PROMOTED')
      expect(toast).toHaveBeenCalledWith('youthTeam.promoted', 'success')
    })

    it('does not fire event if promotion fails', async () => {
      const youthPlayers = [
        { id: 1, name: 'Failed Player', position: 'CM', age: 16, level: 5, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })
      server.promoteYouthPlayer.mockRejectedValue(new Error('Level too low'))

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      page.load = vi.fn()
      page.update = vi.fn()
      await page.load()

      let promoteCallback
      onClick.mockImplementation((id, callback) => {
        promoteCallback = callback
      })

      page._showPromoteConfirm(youthPlayers[0])
      await promoteCallback()

      expect(fire).not.toHaveBeenCalled()
    })
  })

  describe('retirement warning visibility', () => {
    it('shows retirement warning when a player is 18 years old', async () => {
      const youthPlayers = [
        { id: 1, name: 'Veteran Youth', position: 'CM', age: 18, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      expect(page.template).toContain('youthTeam.retirementWarning')
    })

    it('hides retirement warning when no player is 18 years old', async () => {
      const youthPlayers = [
        { id: 1, name: 'Young Player', position: 'CM', age: 16, level: 15, moral: 0.8, fitness: 0.7 },
        { id: 2, name: 'Older Player', position: 'CM', age: 19, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      expect(page.template).not.toContain('youthTeam.retirementWarning')
    })

    it('hides retirement warning when youth team is empty', async () => {
      server.getYouthTeam.mockResolvedValue({
        youthPlayers: [],
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      expect(page.template).not.toContain('youthTeam.retirementWarning')
    })
  })

  describe('squad photo (#563)', () => {
    function makePage (youthPlayers, { academyLevel = 1, team = { id: 4, name: 'Test FC' } } = {}) {
      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        academyLevel,
        season: 6
      })
      server.getStadium.mockResolvedValue({ stadium: { id: 1 } })
      return new YouthTeamPage({ load: vi.fn(), update: vi.fn(), data: { team } })
    }

    const players = count => Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Youth ${i + 1}`,
      position: 'CM',
      age: 16,
      level: 15,
      moral: 0.8,
      fitness: 0.7
    }))

    beforeEach(() => {
      forgetBuildingStills()
    })

    it('renders a portrait placeholder and a name per youth player', async () => {
      const page = makePage(players(4))
      await page.load()
      const html = page.template

      for (let id = 1; id <= 4; id++) {
        expect(html).toContain(`data-youth-portrait="${id}"`)
        expect(html).toContain(`Youth ${id}`)
      }
    })

    it('puts the photo above the player list and the mode cards below it', async () => {
      const page = makePage(players(3))
      await page.load()
      const html = page.template

      // The player list renders as a nested UIElement, so its spot in the
      // template is the `<template>` placeholder.
      const listAt = html.indexOf('<template')
      expect(listAt).toBeGreaterThan(-1)
      expect(html.indexOf('youth-squad-photo')).toBeLessThan(listAt)
      expect(listAt).toBeLessThan(html.indexOf('youth-mode-card'))
    })

    it('lines the squad up in at most two rows, the front one wider', async () => {
      const page = makePage(players(1))
      await page.load()
      const split = n => {
        const { back, front } = page._splitIntoPhotoRows(players(n))
        return [back.length, front.length]
      }

      expect(split(1)).toEqual([0, 1])
      expect(split(2)).toEqual([0, 2])
      expect(split(3)).toEqual([1, 2])
      expect(split(4)).toEqual([1, 3])
      expect(split(5)).toEqual([2, 3])
      expect(split(6)).toEqual([2, 4])
      expect(split(11)).toEqual([5, 6])
    })

    it('keeps every player in exactly one row', async () => {
      const page = makePage(players(9))
      await page.load()
      const { back, front } = page._splitIntoPhotoRows(players(9))
      expect([...front, ...back].map(p => p.id).sort((a, b) => a - b))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('nudges the back row over when centring would align the two rows', async () => {
      // 3 + 1: a centred single player would stand right above the middle one.
      const four = makePage(players(4))
      await four.load()
      expect(four.template).toContain('youth-squad-row--offset')

      // 2 + 1 and 3 + 2 already stagger by themselves.
      const three = makePage(players(3))
      await three.load()
      expect(three.template).not.toContain('youth-squad-row--offset')

      const five = makePage(players(5))
      await five.load()
      expect(five.template).not.toContain('youth-squad-row--offset')
    })

    it('renders a single row without a back row at all', async () => {
      const page = makePage(players(2))
      await page.load()
      const html = page.template
      expect(html).toContain('youth-squad-row--front')
      expect(html).not.toContain('youth-squad-row--back')
    })

    it('wraps the rows in a scroller so a big squad scrolls sideways', async () => {
      const page = makePage(players(12))
      await page.load()
      expect(page.template).toContain('youth-squad-scroller')
    })

    it('leaves the backdrop to the stylesheet until a still exists', async () => {
      // A painted stand-in would flash and then be swapped out — the frame stays
      // plain until the 3D still is there.
      const page = makePage(players(2), { academyLevel: 3 })
      await page.load()
      const html = page.template
      expect(html).not.toContain('youth-academy-level')
      expect(html).not.toContain('background-image')
    })

    it('shows the surname and the first initial only', async () => {
      const page = makePage([{ ...players(1)[0], name: 'Luciano Maria Mendes' }])
      await page.load()
      const photo = page._renderSquadPhoto()
      expect(photo).toContain('L. Mendes')
      // Only the photo is abbreviated — the roster below it keeps full names.
      expect(photo).not.toContain('Luciano Maria Mendes')
      expect(page._renderModeSelectorContent()).toContain('Luciano Maria Mendes')
    })

    it('names the club and the season under the photo', async () => {
      const page = makePage(players(2))
      await page.load()
      expect(page.template).toContain('Test FC · youthTeam.squadPhotoCaption')
    })

    it('renders no photo at all for an empty youth team', async () => {
      const page = makePage([])
      await page.load()
      expect(page.template).not.toContain('youth-squad-photo')
    })

    it('reuses a cached academy still instead of booting a second scene', async () => {
      rememberBuildingStill('youth_academy', 2, 'data:image/jpeg;base64,cached')

      const page = makePage(players(3), { academyLevel: 2 })
      await page.load()

      expect(page._academyStill).toBe('data:image/jpeg;base64,cached')
      expect(page._academyCanvas).toBeNull()
      expect(server.getStadium).not.toHaveBeenCalled()
      expect(page.template).not.toContain('youth-academy-still')
      // Straight into the markup, so a cached backdrop needs no grey first frame.
      expect(page.template).toContain("background-image: url('data:image/jpeg;base64,cached')")
    })

    it('puts up an off-screen canvas when no still exists yet', async () => {
      const page = makePage(players(3), { academyLevel: 2 })
      await page.load()

      expect(page._academyCanvas).not.toBeNull()
      expect(page._academyCanvas.options.buildings).toEqual([{ type: 'youth_academy', level: 2 }])
      expect(page.template).toContain('youth-academy-still')
    })

    it('takes no still for an empty youth team', async () => {
      const page = makePage([])
      await page.load()
      expect(page._academyCanvas).toBeNull()
      expect(server.getStadium).not.toHaveBeenCalled()
    })

    it('keeps the painted fallback when the stadium cannot be loaded', async () => {
      const page = makePage(players(3))
      server.getStadium.mockRejectedValue(new Error('offline'))
      await page.load()
      expect(page._academyCanvas).toBeNull()
      expect(page.template).toContain('youth-squad-photo')
      expect(page.template).not.toContain('background-image')
    })

    it('caches the captured still and gives the WebGL context back', async () => {
      const page = makePage(players(3), { academyLevel: 2 })
      await page.load()
      const canvas = {
        onMounted: vi.fn(),
        whenReady: vi.fn().mockResolvedValue(true),
        captureBuilding: vi.fn(() => 'data:image/jpeg;base64,fresh'),
        onDestroy: vi.fn()
      }
      page._academyCanvas = canvas

      await page._captureAcademyBackdrop()

      expect(canvas.captureBuilding).toHaveBeenCalledWith('youth_academy', expect.objectContaining({
        level: 2, width: 1920, height: 800
      }))
      // The backdrop framing, not the buildings page's aerial portrait.
      const [, options] = canvas.captureBuilding.mock.calls[0]
      expect(options.view).toEqual(BUILDING_BACKDROP_VIEWS.youth_academy)
      expect(cachedBuildingStill('youth_academy', 2)).toBe('data:image/jpeg;base64,fresh')
      expect(page._academyStill).toBe('data:image/jpeg;base64,fresh')
      expect(canvas.onDestroy).toHaveBeenCalled()
      expect(page._academyCanvas).toBeNull()
    })

    it('gives the context back even when the scene never comes up', async () => {
      const page = makePage(players(3), { academyLevel: 2 })
      await page.load()
      const canvas = {
        onMounted: vi.fn(),
        whenReady: vi.fn().mockResolvedValue(false),
        captureBuilding: vi.fn(),
        onDestroy: vi.fn()
      }
      page._academyCanvas = canvas

      await page._captureAcademyBackdrop()

      expect(canvas.captureBuilding).not.toHaveBeenCalled()
      expect(cachedBuildingStill('youth_academy', 2)).toBeNull()
      expect(canvas.onDestroy).toHaveBeenCalled()
    })
  })
})
