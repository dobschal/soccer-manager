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

    it('template contains youth players table', async () => {
      const youthPlayers = [
        { id: 1, name: 'Test Youth', position: 'CM', age: 16, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      const row = page._renderYouthPlayerRow(youthPlayers[0])
      expect(row).toBeInstanceOf(Array)
      expect(row.join('')).toContain('Test Youth')
      expect(row.join('')).toContain('youthTeam.promote')
      expect(row.join('')).toContain('youthTeam.fire')
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

  describe('promote button disabled states', () => {
    it('disables promote button when player age < 16', async () => {
      const youthPlayers = [
        { id: 1, name: 'Young Player', position: 'CM', age: 15, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      const row = page._renderYouthPlayerRow(youthPlayers[0])
      const html = row.join('')
      expect(html).toContain('disabled')
      expect(html).toContain('youthTeam.playerTooYoung')
    })

    it('enables promote button when player age >= 16', async () => {
      const youthPlayers = [
        { id: 1, name: 'Ready Player', position: 'CM', age: 16, level: 15, moral: 0.8, fitness: 0.7 }
      ]

      server.getYouthTeam.mockResolvedValue({
        youthPlayers,
        trainingMode: 'rest',
        season: 1
      })

      const mockParent = { load: vi.fn(), update: vi.fn() }
      const page = new YouthTeamPage(mockParent)
      await page.load()

      const row = page._renderYouthPlayerRow(youthPlayers[0])
      const html = row.join('')
      // Button should not have disabled attribute
      expect(html).not.toMatch(/disabled.*youthTeam\.promote/)
    })
  })
})
