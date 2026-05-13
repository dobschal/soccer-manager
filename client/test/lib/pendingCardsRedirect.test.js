import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getPendingActionCards: vi.fn()
  }
}))

import { server } from '../../lib/gateway.js'
import { redirectIfPendingActionCards } from '../../lib/pendingCardsRedirect.js'

function setHash (hash) {
  // Bypass jsdom's hashchange semantics — only the .hash getter matters here.
  Object.defineProperty(window.location, 'hash', {
    value: hash,
    writable: true,
    configurable: true
  })
}

describe('redirectIfPendingActionCards', () => {
  let reloadSpy
  let originalLocalStorage

  beforeEach(() => {
    vi.clearAllMocks()
    setHash('')

    // Stub window.location.reload to observe it without actually reloading jsdom.
    reloadSpy = vi.fn()
    Object.defineProperty(window.location, 'reload', {
      value: reloadSpy,
      writable: true,
      configurable: true
    })

    // localStorage stub with auth-token present by default.
    originalLocalStorage = window.localStorage
    const store = { 'auth-token': 'token' }
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v) },
        removeItem: (k) => { delete store[k] }
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true
    })
  })

  it('does nothing and returns false when the user is not authenticated', async () => {
    window.localStorage.removeItem('auth-token')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(false)
    expect(server.getPendingActionCards).not.toHaveBeenCalled()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('returns false and does not reload when there are no pending cards', async () => {
    server.getPendingActionCards.mockResolvedValue({ pendingCards: [] })
    setHash('#team?id=85')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(false)
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#team?id=85')
  })

  it('redirects to dashboard and reloads when pending cards exist on a non-dashboard page', async () => {
    server.getPendingActionCards.mockResolvedValue({ pendingCards: [{ id: 1 }] })
    setHash('#team?id=85')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(true)
    expect(window.location.hash).toBe('#dashboard')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('reloads in place when pending cards exist and the user is already on the dashboard', async () => {
    server.getPendingActionCards.mockResolvedValue({ pendingCards: [{ id: 1 }] })
    setHash('#dashboard')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(true)
    expect(window.location.hash).toBe('#dashboard')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('treats an empty hash as the dashboard route', async () => {
    server.getPendingActionCards.mockResolvedValue({ pendingCards: [{ id: 1 }] })
    setHash('')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(true)
    expect(window.location.hash).toBe('')
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('returns false and does not reload if the server call fails', async () => {
    server.getPendingActionCards.mockRejectedValue(new Error('network'))
    setHash('#team?id=85')
    const result = await redirectIfPendingActionCards()
    expect(result).toBe(false)
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
