import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getTutorialStatus: vi.fn() }
}))
vi.mock('../../lib/router.js', () => ({ goTo: vi.fn() }))
vi.mock('../../partials/tutorialOverlay.js', () => ({ showTutorialOverlay: vi.fn() }))

import { TutorialProgress } from '../../partials/tutorialProgress.js'
import { goTo } from '../../lib/router.js'
import { showTutorialOverlay } from '../../partials/tutorialOverlay.js'

describe('TutorialProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = '#dashboard'
  })

  it('renders a button (not a link) to re-open the next tutorial', () => {
    const progress = new TutorialProgress()
    progress._tutorialCompleted = {}
    const html = progress.template
    expect(html).toContain('tutorial-progress-next')
    expect(html).toContain('data-tutorial-key="dashboard"')
    expect(html).toContain('<button')
    expect(html).not.toContain('<a href')
  })

  it('re-opens the overlay without navigating when already on the target page', () => {
    const progress = new TutorialProgress()
    progress._tutorialCompleted = {}
    const event = {
      currentTarget: { dataset: { tutorialKey: 'dashboard', tutorialRoute: '#dashboard' } }
    }
    progress._onNextTutorialClick(event)
    expect(showTutorialOverlay).toHaveBeenCalledWith('dashboard')
    expect(goTo).not.toHaveBeenCalled()
  })

  it('navigates to the target page and then opens the overlay when on a different page', () => {
    const progress = new TutorialProgress()
    progress._tutorialCompleted = { dashboard: true }
    const event = {
      currentTarget: { dataset: { tutorialKey: 'team', tutorialRoute: '#my-team' } }
    }
    progress._onNextTutorialClick(event)
    expect(goTo).toHaveBeenCalledWith('my-team')
    expect(showTutorialOverlay).toHaveBeenCalledWith('team')
  })

  it('hides the card when all tutorials are completed', () => {
    const progress = new TutorialProgress()
    progress._tutorialCompleted = {
      dashboard: true, team: true, youth: true, results: true,
      trades: true, stadium: true, finances: true, buildings: true
    }
    expect(progress.template).toBe('<div></div>')
  })

  it('marks the next-tutorial button selector optional so mounting the empty card does not throw', () => {
    // When all tutorials are completed the template renders no button, so the
    // event selector must be optional to avoid "Cannot apply event listener".
    const progress = new TutorialProgress()
    expect(Object.keys(progress.events)).toContain('(optional) .tutorial-progress-next')
  })
})
