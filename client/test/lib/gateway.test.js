import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ getLocale: () => 'de' }))

import { server } from '../../lib/gateway.js'
import { getClientId } from '../../lib/clientId.js'

describe('gateway', () => {
  beforeEach(() => {
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
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ response: { ok: true } })
    })
  })

  /**
   * @returns {Record<string, string>} headers of the single fetch call made
   */
  function sentHeaders () {
    const [, options] = global.fetch.mock.calls[0]
    return options.headers
  }

  it('sends the anonymous client id so pre-login routes can attribute events', async () => {
    await server.createAccount('user', 'password123', 'a@b.de')

    // Seeded by the request itself, so reading it afterwards returns the same id.
    expect(sentHeaders()['X-Client-Id']).toBe(getClientId())
  })

  it('sends the client id on unauthenticated requests too', async () => {
    await server.getLandingStats()

    expect(sentHeaders()['X-Client-Id']).toBeTruthy()
    expect(sentHeaders().Authorization).toBeUndefined()
  })

  it('still sends the auth token when one is stored', async () => {
    window.localStorage.setItem('auth-token', 'jwt-123')

    await server.getTeam()

    expect(sentHeaders().Authorization).toBe('Bearer jwt-123')
    expect(sentHeaders()['X-Client-Id']).toBeTruthy()
  })

  it('still sends the request when localStorage is blocked (private mode)', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get () { throw new Error('blocked in private mode') }
    })

    await expect(server.getLandingStats()).resolves.toEqual({ ok: true })
    expect(sentHeaders()['X-Client-Id']).toBeUndefined()
    expect(sentHeaders().Authorization).toBeUndefined()
  })
})
