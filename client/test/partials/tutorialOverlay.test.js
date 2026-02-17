import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies before importing
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getTutorialStatus: vi.fn(),
    completeTutorial: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { server } from '../../lib/gateway.js'

describe('tutorialOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Mock document.body.insertAdjacentHTML
    document.body.insertAdjacentHTML = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('showTutorialIfNeeded', () => {
    it('does not show tutorial if already completed', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: { dashboard: true }
      })

      await showTutorialIfNeeded('dashboard')
      vi.advanceTimersByTime(2000)

      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()
    })

    it('shows tutorial overlay after delay if not completed', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('dashboard')

      // Should not show immediately
      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()

      // After 1.5s delay, should show
      vi.advanceTimersByTime(1500)
      expect(document.body.insertAdjacentHTML).toHaveBeenCalled()
    })

    it('shows tutorial for uncompleted key even if others are completed', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: { dashboard: true, team: true }
      })

      await showTutorialIfNeeded('stadium')
      vi.advanceTimersByTime(1500)

      expect(document.body.insertAdjacentHTML).toHaveBeenCalled()
    })

    it('handles server error gracefully', async () => {
      server.getTutorialStatus.mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await showTutorialIfNeeded('dashboard')
      vi.advanceTimersByTime(1500)

      // Should log error but not throw
      expect(consoleSpy).toHaveBeenCalled()
      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('does not show overlay for unknown tutorial key', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('unknown_key')
      vi.advanceTimersByTime(1500)

      // The overlay should not contain any content for unknown key
      // The showTutorialOverlay function returns early if tutorial not found
      // So insertAdjacentHTML might be called but with empty content
      // Actually it checks if TUTORIALS[tutorialKey] exists and returns early if not
      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()
    })

    it('renders tutorial content with correct title', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('dashboard')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Welcome to SoccerManagerIO!')
    })

    it('renders tutorial content with list items', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('stadium')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Set ticket prices')
      expect(htmlContent).toContain('Expand stands')
    })

    it('renders checkbox for "do not show again"', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('team')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Do not show this again')
      expect(htmlContent).toContain('type="checkbox"')
    })

    it('renders "Got it!" button', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await showTutorialIfNeeded('finances')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Got it!')
    })
  })

  describe('tutorial content', () => {
    beforeEach(async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })
    })

    it('has content for results page', async () => {
      await showTutorialIfNeeded('results')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Game Results')
      expect(htmlContent).toContain('standings')
    })

    it('has content for team page', async () => {
      await showTutorialIfNeeded('team')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Your Team')
      expect(htmlContent).toContain('lineup')
    })

    it('has content for trades page', async () => {
      await showTutorialIfNeeded('trades')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Player Market')
      expect(htmlContent).toContain('transfer')
    })

    it('has content for dashboard page', async () => {
      await showTutorialIfNeeded('dashboard')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Welcome')
      expect(htmlContent).toContain('action cards')
    })

    it('has content for stadium page', async () => {
      await showTutorialIfNeeded('stadium')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Stadium Management')
      expect(htmlContent).toContain('ticket')
    })

    it('has content for finances page', async () => {
      await showTutorialIfNeeded('finances')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Finances')
      expect(htmlContent).toContain('sponsor')
    })

    it('has content for buildings page', async () => {
      await showTutorialIfNeeded('buildings')
      vi.advanceTimersByTime(1500)

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Buildings')
      expect(htmlContent).toContain('Training Area')
    })
  })
})
