import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    login: vi.fn(),
    createAccount: vi.fn(),
    requestPasswordReset: vi.fn()
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}))

vi.mock('../../lib/websocket.js', () => ({
  connectWebSocket: vi.fn()
}))

vi.mock('../../lib/router.js', () => ({
  clearHasTeamCache: vi.fn(),
  goTo: vi.fn(),
  setQueryParams: vi.fn()
}))

const {
  LandingPage,
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectMobilePlatform
} = await import('../../pages/landing.js')

describe('LandingPage - app store links', () => {
  beforeEach(() => {
    window.localStorage.getItem.mockReturnValue(null)
  })

  it('renders App Store and Play Store badges with the correct store URLs', () => {
    const page = new LandingPage()
    const html = page.template
    expect(html).toContain(APP_STORE_URL)
    expect(html).toContain(PLAY_STORE_URL)
    expect(html).toContain('assets/landing-page/app-store-badge.svg')
    expect(html).toContain('assets/landing-page/google-play-badge.svg')
  })

  it('places the badges inside the hero content, before the first feature section', () => {
    const page = new LandingPage()
    const html = page.template
    const heroSubtitleIdx = html.indexOf('hero-subtitle')
    const badgesIdx = html.indexOf('app-badges')
    const heroEnd = html.indexOf('</section>')
    const firstFeatureIdx = html.indexOf('feature-section')
    expect(heroSubtitleIdx).toBeGreaterThan(-1)
    expect(badgesIdx).toBeGreaterThan(heroSubtitleIdx)
    expect(badgesIdx).toBeLessThan(heroEnd)
    expect(firstFeatureIdx).toBeGreaterThan(heroEnd)
  })

  it('exports the App Store URL pointing at the published iOS app id', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/de/app/footballmanager-io/id6759547142')
  })

  it('exports the Play Store URL pointing at the published Android app package', () => {
    expect(PLAY_STORE_URL).toBe('https://play.google.com/store/apps/details?id=io.soccermanager.app')
  })
})

describe('LandingPage - mobile app banner', () => {
  beforeEach(() => {
    window.localStorage.getItem.mockReturnValue(null)
  })

  it('detects iOS via user agent', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605')).toBe('ios')
    expect(detectMobilePlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios')
  })

  it('detects Android via user agent', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537')).toBe('android')
  })

  it('returns null for desktop user agents', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBeNull()
    expect(detectMobilePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBeNull()
  })

  it('renders the Android banner with the Play Store URL on Android UA', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537',
      configurable: true
    })
    const page = new LandingPage()
    const html = page.template
    expect(html).toContain('mobile-app-banner')
    expect(html).toContain('data-platform="android"')
    expect(html).toContain(PLAY_STORE_URL)
  })

  it('does not render the custom banner on iOS — Safari shows its native smart app banner via apple-itunes-app', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605',
      configurable: true
    })
    const page = new LandingPage()
    const html = page.template
    expect(html).not.toContain('mobile-app-banner')
  })

  it('does not render the mobile banner on a desktop UA', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true
    })
    const page = new LandingPage()
    const html = page.template
    expect(html).not.toContain('mobile-app-banner')
  })

  it('does not render the banner when the user has dismissed it previously', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537',
      configurable: true
    })
    window.localStorage.getItem.mockReturnValue('1')
    const page = new LandingPage()
    const html = page.template
    expect(html).not.toContain('mobile-app-banner')
  })
})
