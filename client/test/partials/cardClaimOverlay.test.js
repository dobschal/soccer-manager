import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    claimActionCard: vi.fn(() => Promise.resolve())
  }
}))

vi.mock('../../lib/actionCardSvg.js', () => ({
  preloadActionCardSvgs: vi.fn(() => Promise.resolve()),
  renderActionCardSvg: vi.fn(() => '<svg></svg>')
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}))

vi.mock('../../lib/html.js', () => {
  let idCounter = 0
  return { generateId: vi.fn(() => `claim-id-${idCounter++}`) }
})

const clickHandlers = {}
vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn((selector, handler) => {
    clickHandlers[selector] = handler
  })
}))

const { showCardClaimOverlay } = await import('../../partials/cardClaimOverlay.js')
const { server } = await import('../../lib/gateway.js')

function flushMicrotasks () {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('showCardClaimOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(clickHandlers).forEach(k => delete clickHandlers[k])
    document.body.innerHTML = ''
  })

  it('claims the card server-side once the user reveals and dismisses it — the server-side claim emits ACTION_CARDS_CHANGED so the dashboard view refetches', async () => {
    const promise = showCardClaimOverlay([{ id: 7, action: 'BONUS_100K' }])
    await flushMicrotasks()

    // Find the click handler registered for the flip container and trigger
    // reveal, then dismiss (second click on the same handler).
    const flipSelector = Object.keys(clickHandlers).find(s => s.includes('claim-id') && !s.includes(/* skip */ 'skip'))
    expect(flipSelector).toBeDefined()
    const flipHandler = clickHandlers[flipSelector]

    flipHandler() // reveal → triggers claimActionCard
    flipHandler() // dismiss → triggers animationend → resolves

    // animationend listener was attached to the overlay node; dispatch it.
    const overlay = document.querySelector('.card-claim-overlay')
    expect(overlay).not.toBeNull()
    overlay.dispatchEvent(new Event('animationend'))

    await promise

    expect(server.claimActionCard).toHaveBeenCalledWith(7)
  })

  it('skips the server claim when no cards were shown', async () => {
    await showCardClaimOverlay([])
    expect(server.claimActionCard).not.toHaveBeenCalled()
  })
})
