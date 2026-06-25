import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock everything EXCEPT i18n, so we exercise the real translation wiring and
// prove the landing page renders in the selected locale (#landing-i18n).
vi.mock('../../lib/gateway.js', () => ({
  server: { login: vi.fn(), createAccount: vi.fn(), requestPasswordReset: vi.fn() }
}))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../lib/websocket.js', () => ({ connectWebSocket: vi.fn() }))
vi.mock('../../lib/router.js', () => ({ clearHasTeamCache: vi.fn(), goTo: vi.fn(), setQueryParams: vi.fn() }))
vi.mock('../../lib/deviceUuid.js', () => ({ getDeviceUuid: () => 'test-uuid' }))

const { LandingPage } = await import('../../pages/landing.js')
const { setLocale } = await import('../../i18n/index.js')

describe('LandingPage i18n', () => {
  beforeEach(() => {
    window.localStorage.clear?.()
  })

  it('renders in English when the locale is en', () => {
    setLocale('en')
    const html = new LandingPage().template
    expect(html).toContain('Free to Play')
    expect(html).toContain('Create Account')
    expect(html).toContain('Manage your own fantasy football club')
    // and not the German equivalents
    expect(html).not.toContain('Kostenlos spielen')
    expect(html).not.toContain('Verwalte deinen eigenen')
  })

  it('renders in German when the locale is de', () => {
    setLocale('de')
    const html = new LandingPage().template
    expect(html).toContain('Kostenlos spielen')
    expect(html).toContain('Konto erstellen')
    expect(html).toContain('Verwalte deinen eigenen Fantasy-Fußballclub')
    expect(html).not.toContain('Free to Play')
  })
})
