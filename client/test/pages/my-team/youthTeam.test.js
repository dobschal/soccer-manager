import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getYouthTeam: vi.fn(),
    promoteYouthPlayer: vi.fn(),
    fireYouthPlayer: vi.fn(),
    setYouthTrainingMode: vi.fn(),
    setYouthPlayerTrainingMode: vi.fn()
  },
  showServerError: vi.fn()
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
})
