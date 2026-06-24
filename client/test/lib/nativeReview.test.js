import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/clientLogger.js', () => ({ sendLog: vi.fn() }))

import { maybeRequestReviewAfterWin, requestNativeReview } from '../../lib/nativeReview.js'

describe('nativeReview (#371)', () => {
  let store
  let postMessage

  beforeEach(() => {
    store = {}
    postMessage = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v }
    })
    delete window.__nativePlatform
    delete window.webkit
    delete window.AndroidBridge
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does nothing on web (no native platform)', () => {
    expect(requestNativeReview()).toBe(false)
  })

  it('does not prompt when the game was lost', () => {
    window.__nativePlatform = 'ios'
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    expect(maybeRequestReviewAfterWin(false)).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('posts a requestReview message to the iOS bridge after a win', () => {
    window.__nativePlatform = 'ios'
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    expect(maybeRequestReviewAfterWin(true)).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'requestReview' }))
  })

  it('throttles repeated prompts within the 60-day window', () => {
    window.__nativePlatform = 'ios'
    window.webkit = { messageHandlers: { fmioBridge: { postMessage } } }
    expect(maybeRequestReviewAfterWin(true)).toBe(true)
    expect(maybeRequestReviewAfterWin(true)).toBe(false)
    expect(postMessage).toHaveBeenCalledTimes(1)
  })

  it('uses the Android bridge when present', () => {
    window.__nativePlatform = 'android'
    const requestReview = vi.fn()
    window.AndroidBridge = { requestReview }
    expect(maybeRequestReviewAfterWin(true)).toBe(true)
    expect(requestReview).toHaveBeenCalled()
  })
})
