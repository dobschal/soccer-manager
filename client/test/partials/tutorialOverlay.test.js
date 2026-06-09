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
    // Fire-and-forget helper: kick off the call, advance fake timers past
    // the 1.5s delay, flush microtasks, then return. We never `await` the
    // returned promise because it resolves only on overlay close (which never
    // fires in unit tests — the close button is mocked).
    async function triggerTutorial (key) {
      showTutorialIfNeeded(key)
      await vi.advanceTimersByTimeAsync(1500)
    }

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

      showTutorialIfNeeded('dashboard')

      // Should not show immediately — flush only the getTutorialStatus microtask
      await Promise.resolve()
      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()

      // After 1.5s delay, should show
      await vi.advanceTimersByTimeAsync(1500)
      expect(document.body.insertAdjacentHTML).toHaveBeenCalled()
    })

    it('shows tutorial for uncompleted key even if others are completed', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: { dashboard: true, team: true }
      })

      await triggerTutorial('stadium')

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

      await triggerTutorial('unknown_key')

      // The showTutorialOverlay function returns early if tutorial not found
      expect(document.body.insertAdjacentHTML).not.toHaveBeenCalled()
    })

    it('renders tutorial content with correct title', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await triggerTutorial('dashboard')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Welcome to FootballManager.IO!')
    })

    it('renders tutorial content with list items', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await triggerTutorial('stadium')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Set ticket prices')
      expect(htmlContent).toContain('Expand stands')
    })

    it('renders checkbox for "do not show again"', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await triggerTutorial('team')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Do not show this again')
      expect(htmlContent).toContain('type="checkbox"')
    })

    it('renders "Got it!" button', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      await triggerTutorial('finances')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Got it!')
    })

    it('shows the overlay immediately when delay is 0', async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })

      const promise = showTutorialIfNeeded('dashboard', null, { delay: 0 })
      // Flush the getTutorialStatus microtask + the post-delay code path.
      // No timer to advance because delay is 0.
      await Promise.resolve()
      await Promise.resolve()
      expect(document.body.insertAdjacentHTML).toHaveBeenCalled()
      // Avoid an unhandled promise warning (the promise never resolves in
      // the test because the close button is mocked).
      void promise
    })
  })

  describe('tutorial content', () => {
    async function triggerTutorial (key) {
      showTutorialIfNeeded(key)
      await vi.advanceTimersByTimeAsync(1500)
    }

    beforeEach(async () => {
      server.getTutorialStatus.mockResolvedValue({
        tutorialCompleted: {}
      })
    })

    it('has content for results page', async () => {
      await triggerTutorial('results')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Game Results')
      expect(htmlContent).toContain('standings')
    })

    it('has content for team page', async () => {
      await triggerTutorial('team')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Your Team')
      expect(htmlContent).toContain('lineup')
    })

    it('has content for trades page', async () => {
      await triggerTutorial('trades')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Player Market')
      expect(htmlContent).toContain('transfer')
    })

    it('has content for dashboard page', async () => {
      await triggerTutorial('dashboard')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Welcome')
      expect(htmlContent).toContain('action cards')
    })

    it('has content for stadium page', async () => {
      await triggerTutorial('stadium')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Stadium Management')
      expect(htmlContent).toContain('ticket')
    })

    it('has content for finances page', async () => {
      await triggerTutorial('finances')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Finances')
      expect(htmlContent).toContain('sponsor')
    })

    it('has content for buildings page', async () => {
      await triggerTutorial('buildings')

      const htmlContent = document.body.insertAdjacentHTML.mock.calls[0][1]
      expect(htmlContent).toContain('Buildings')
      expect(htmlContent).toContain('Training Area')
    })
  })
})
