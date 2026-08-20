import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getActionCards: vi.fn().mockResolvedValue({ actionCards: [] }) },
  showServerError: vi.fn()
}))
vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))
vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn(),
  getQueryParams: vi.fn().mockReturnValue({})
}))
vi.mock('../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../partials/cardClaimOverlay.js', () => ({
  showCardClaimOverlay: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../partials/spielTickerOverlay.js', () => ({
  maybeShowSpielTickerOverlay: vi.fn().mockResolvedValue(false),
  markSpielTickerSeen: vi.fn()
}))
vi.mock('../../partials/seasonReviewOverlay.js', () => ({
  showSeasonReviewOverlay: vi.fn().mockResolvedValue(undefined),
  isSeasonReviewDismissed: vi.fn().mockReturnValue(false),
  markSeasonReviewDismissed: vi.fn()
}))
vi.mock('../../partials/emailPromptDialog.js', () => ({
  maybeShowEmailPrompt: vi.fn().mockResolvedValue(undefined)
}))

import { DashboardPage } from '../../pages/dashboard.js'
import { markFreshRegistration } from '../../lib/freshRegistration.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { showCardClaimOverlay } from '../../partials/cardClaimOverlay.js'
import { maybeShowSpielTickerOverlay, markSpielTickerSeen } from '../../partials/spielTickerOverlay.js'
import { showSeasonReviewOverlay, markSeasonReviewDismissed } from '../../partials/seasonReviewOverlay.js'
import { maybeShowEmailPrompt } from '../../partials/emailPromptDialog.js'

/**
 * #564 — a brand-new manager may only see the tutorial on their first
 * dashboard, no matter how much overlay-worthy state is waiting for them.
 */
describe('dashboard overlays right after registration (#564)', () => {
  let page

  beforeEach(() => {
    vi.clearAllMocks()
    // The shared setup replaces localStorage with bare spies; the flag needs a
    // store that actually remembers what was written to it.
    const store = {}
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value) },
        removeItem: key => { delete store[key] },
        clear: () => { for (const key of Object.keys(store)) delete store[key] }
      }
    })

    page = new DashboardPage()
    page._isMounted = true
    page.season = 3
    page.gameDay = 12
    page.team = { id: 7 }
    page.user = { username: 'rookie' }
    // Everything that would normally raise an overlay is present.
    page._sliderGames = [{ id: 99, gameDay: 11, isPlayed: true }]
    page._cupGames = []
    page._pendingCards = [{ id: 1, action: 'TRAINING' }]
    page._seasonReview = { isSeasonEnd: true, season: 2 }
  })

  it('shows only the tutorial on the first dashboard after the wizard', async () => {
    markFreshRegistration()

    await page._showDashboardOverlays()

    expect(showTutorialIfNeeded).toHaveBeenCalledWith('dashboard', page, { delay: 0 })
    expect(maybeShowSpielTickerOverlay).not.toHaveBeenCalled()
    expect(showCardClaimOverlay).not.toHaveBeenCalled()
    expect(showSeasonReviewOverlay).not.toHaveBeenCalled()
    expect(maybeShowEmailPrompt).not.toHaveBeenCalled()
  })

  it('retires the ticker and the season review of the bot era', async () => {
    markFreshRegistration()

    await page._showDashboardOverlays()

    expect(markSpielTickerSeen).toHaveBeenCalledWith(3, 12, 99)
    expect(markSeasonReviewDismissed).toHaveBeenCalledWith(2)
  })

  it('keeps the pending cards so the claim overlay returns on the next visit', async () => {
    const cards = page._pendingCards
    markFreshRegistration()
    await page._showDashboardOverlays()
    expect(page._pendingCards).toBe(cards)

    await page._showDashboardOverlays()
    expect(showCardClaimOverlay).toHaveBeenCalledWith(cards)
  })

  it('behaves normally for a manager who did not just register', async () => {
    await page._showDashboardOverlays()

    expect(maybeShowEmailPrompt).toHaveBeenCalled()
    expect(showSeasonReviewOverlay).toHaveBeenCalled()
    expect(showTutorialIfNeeded).toHaveBeenCalled()
    expect(maybeShowSpielTickerOverlay).toHaveBeenCalled()
    expect(showCardClaimOverlay).toHaveBeenCalled()
    expect(markSpielTickerSeen).not.toHaveBeenCalled()
    expect(markSeasonReviewDismissed).not.toHaveBeenCalled()
  })
})
