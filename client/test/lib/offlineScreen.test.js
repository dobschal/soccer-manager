import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getVersion: vi.fn()
  }
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}))

import { server } from '../../lib/gateway.js'
import { isApiReachable, showOfflineScreen } from '../../lib/offlineScreen.js'

describe('isApiReachable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when server.getVersion resolves', async () => {
    server.getVersion.mockResolvedValue({ version: '1.0.0' })
    expect(await isApiReachable()).toBe(true)
  })

  it('returns false when server.getVersion rejects (network error)', async () => {
    server.getVersion.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await isApiReachable()).toBe(false)
  })
})

describe('showOfflineScreen', () => {
  let reloadSpy

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    reloadSpy = vi.fn()
    Object.defineProperty(window.location, 'reload', {
      value: reloadSpy,
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the offline screen with logo, title, text and retry button', () => {
    showOfflineScreen()
    expect(document.querySelector('.offline-screen')).toBeTruthy()
    expect(document.querySelector('.offline-screen-logo')).toBeTruthy()
    expect(document.querySelector('.offline-screen-title')?.textContent).toBe('offline.title')
    expect(document.querySelector('.offline-screen-text')?.textContent).toBe('offline.text')
    const btn = document.getElementById('offline-retry-btn')
    expect(btn).toBeTruthy()
    expect(btn.textContent.trim()).toBe('offline.retry')
  })

  it('reloads the page when retry succeeds', async () => {
    server.getVersion.mockResolvedValue({ version: '1.0.0' })
    showOfflineScreen()
    document.getElementById('offline-retry-btn').click()
    // Wait one microtask tick for the async handler to settle.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('re-enables the button and does not reload when retry fails', async () => {
    server.getVersion.mockRejectedValue(new TypeError('Failed to fetch'))
    showOfflineScreen()
    const btn = document.getElementById('offline-retry-btn')
    btn.click()
    expect(btn.disabled).toBe(true)
    expect(document.getElementById('offline-retry-label').textContent).toBe('offline.retrying')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(btn.disabled).toBe(false)
    expect(document.getElementById('offline-retry-label').textContent).toBe('offline.retry')
  })

  it('ignores rapid double-clicks while a retry is in flight', async () => {
    let resolveVersion
    server.getVersion.mockReturnValue(new Promise(resolve => {
      resolveVersion = resolve
    }))
    showOfflineScreen()
    const btn = document.getElementById('offline-retry-btn')
    btn.click()
    btn.click() // second click while disabled should be a no-op
    expect(server.getVersion).toHaveBeenCalledTimes(1)
    resolveVersion({ version: '1.0.0' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
