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

vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))

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
const { toast } = await import('../../partials/toast.js')

function flushMicrotasks () {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Resolve the click handler that was registered for the element carrying the
 * given class, so the tests don't depend on generated id ordering.
 */
function handlerFor (className) {
  const selector = Object.keys(clickHandlers)
    .find(s => document.querySelector(s)?.classList.contains(className))
  expect(selector, `no click handler for .${className}`).toBeDefined()
  return clickHandlers[selector]
}

function clickOverlay (target) {
  const overlay = document.querySelector('.card-claim-overlay')
  handlerFor('card-claim-overlay')({ target: target ?? overlay })
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

    clickOverlay() // reveal → triggers claimActionCard
    clickOverlay() // dismiss → triggers animationend → resolves

    // animationend listener was attached to the overlay node; dispatch it.
    const overlay = document.querySelector('.card-claim-overlay')
    expect(overlay).not.toBeNull()
    overlay.dispatchEvent(new Event('animationend'))

    await promise

    expect(server.claimActionCard).toHaveBeenCalledWith(7)
  })

  it('reveals the card when clicking the overlay next to the card, not only on the card itself', async () => {
    const promise = showCardClaimOverlay([{ id: 3, action: 'BONUS_100K' }])
    await flushMicrotasks()

    const overlay = document.querySelector('.card-claim-overlay')
    // The hint sits beside the card — a click there must reveal too.
    clickOverlay(overlay.querySelector('.card-claim-hint'))

    expect(document.querySelector('.card-claim-flip-container').classList.contains('flipped')).toBe(true)
    expect(server.claimActionCard).toHaveBeenCalledWith(3)

    clickOverlay()
    overlay.dispatchEvent(new Event('animationend'))
    await promise
  })

  it('ignores overlay clicks that land on the skip button so it does not reveal and skip at once', async () => {
    const promise = showCardClaimOverlay([{ id: 11, action: 'BONUS_100K' }])
    await flushMicrotasks()

    clickOverlay(document.querySelector('.card-claim-skip-btn'))

    expect(document.querySelector('.card-claim-flip-container').classList.contains('flipped')).toBe(false)
    expect(server.claimActionCard).not.toHaveBeenCalled()

    handlerFor('card-claim-skip-btn')()
    await promise
    expect(server.claimActionCard).toHaveBeenCalledTimes(1)
  })

  it('does not re-claim the already revealed card when skipping — that failed server-side and showed a bogus error toast', async () => {
    const promise = showCardClaimOverlay([{ id: 1, action: 'BONUS_100K' }])
    await flushMicrotasks()

    clickOverlay() // reveal → claims card 1
    handlerFor('card-claim-skip-btn')() // skip on the last card

    await promise

    expect(server.claimActionCard).toHaveBeenCalledTimes(1)
    expect(server.claimActionCard).toHaveBeenCalledWith(1)
    expect(toast).not.toHaveBeenCalled()
  })

  it('claims only the still pending cards when skipping mid-stack', async () => {
    const promise = showCardClaimOverlay([
      { id: 1, action: 'BONUS_100K' },
      { id: 2, action: 'FRESHNESS_5' },
      { id: 3, action: 'SPY' }
    ])
    await flushMicrotasks()

    clickOverlay() // reveal card 1 → claims card 1
    handlerFor('card-claim-skip-btn')()

    await promise

    expect(server.claimActionCard.mock.calls.map(c => c[0]).sort()).toEqual([1, 2, 3])
  })

  it('skips the server claim when no cards were shown', async () => {
    await showCardClaimOverlay([])
    expect(server.claimActionCard).not.toHaveBeenCalled()
  })
})
