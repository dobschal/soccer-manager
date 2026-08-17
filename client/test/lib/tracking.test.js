import { describe, it, expect, vi, beforeEach } from 'vitest'

const trackPageViewSpy = vi.fn().mockResolvedValue({ success: true })
const trackFunnelEventSpy = vi.fn().mockResolvedValue({ success: true })

vi.mock('../../lib/gateway.js', () => ({
  server: {
    trackPageView: (...args) => trackPageViewSpy(...args),
    trackFunnelEvent: (...args) => trackFunnelEventSpy(...args)
  }
}))

import { trackPageView, trackFunnelEvent } from '../../lib/tracking.js'
import { getClientId } from '../../lib/clientId.js'

describe('tracking', () => {
  beforeEach(() => {
    // The shared setup stubs localStorage with no-op mocks, but the client id is
    // only stable if it actually persists — swap in an in-memory store.
    const store = new Map()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: key => store.delete(key),
        clear: () => store.clear()
      }
    })
    vi.clearAllMocks()
  })

  describe('trackPageView', () => {
    it('reports the page together with the stable client id', () => {
      trackPageView('dashboard')

      expect(trackPageViewSpy).toHaveBeenCalledWith('dashboard', getClientId())
    })

    it('de-duplicates consecutive views of the same page', () => {
      trackPageView('my-team')
      trackPageView('my-team')

      expect(trackPageViewSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores an empty page', () => {
      trackPageView('')

      expect(trackPageViewSpy).not.toHaveBeenCalled()
    })
  })

  describe('trackFunnelEvent', () => {
    it('reports the event, reason and client id', () => {
      trackFunnelEvent('register-abort', 'email-invalid')

      expect(trackFunnelEventSpy).toHaveBeenCalledWith(
        'register-abort', 'email-invalid', getClientId()
      )
    })

    it('sends null when no reason is given', () => {
      trackFunnelEvent('register-abort')

      expect(trackFunnelEventSpy).toHaveBeenCalledWith('register-abort', null, getClientId())
    })

    it('does NOT de-duplicate repeated events — a second attempt is real data', () => {
      trackFunnelEvent('register-abort', 'email-invalid')
      trackFunnelEvent('register-abort', 'email-invalid')

      expect(trackFunnelEventSpy).toHaveBeenCalledTimes(2)
    })

    it('ignores an empty event', () => {
      trackFunnelEvent('')

      expect(trackFunnelEventSpy).not.toHaveBeenCalled()
    })

    it('swallows a rejected request so tracking can never break the form', async () => {
      trackFunnelEventSpy.mockRejectedValueOnce(new Error('offline'))

      expect(() => trackFunnelEvent('register-abort', 'email-invalid')).not.toThrow()
      await Promise.resolve()
    })
  })

  describe('getClientId', () => {
    it('returns a stable id across calls and persists it', () => {
      const first = getClientId()
      const second = getClientId()

      expect(first).toBeTruthy()
      expect(second).toBe(first)
      expect(localStorage.getItem('fm_client_id')).toBe(first)
    })
  })
})
