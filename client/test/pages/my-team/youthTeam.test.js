import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getYouthTeam: vi.fn(),
    promoteYouthPlayer: vi.fn(),
    fireYouthPlayer: vi.fn(),
    setYouthTrainingMode: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
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
