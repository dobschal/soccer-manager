import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BOOT_SCREEN_FADE_MS,
  BOOT_SCREEN_ID,
  BOOT_SCREEN_MAX_MS,
  _resetBootScreenState,
  captureBootScreen,
  hideBootScreen,
  isBootScreenHidden,
  restoreBootScreen
} from '../../lib/bootScreen.js'

function renderBootScreen () {
  document.body.innerHTML = `<div id="${BOOT_SCREEN_ID}" class="boot-screen"></div>`
}

function bootScreenEl () {
  return document.getElementById(BOOT_SCREEN_ID)
}

describe('bootScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetBootScreenState()
    renderBootScreen()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('survives a full body replacement (layout render)', () => {
    captureBootScreen()
    document.body.innerHTML = '<div class="native-app-layout"><div id="page"></div></div>'
    expect(bootScreenEl()).toBeNull()

    restoreBootScreen()

    expect(bootScreenEl()).not.toBeNull()
    expect(document.querySelector('#page')).not.toBeNull()
  })

  it('fades out and removes the node when hidden', () => {
    captureBootScreen()
    hideBootScreen()

    expect(bootScreenEl().classList.contains('boot-screen--hidden')).toBe(true)
    vi.advanceTimersByTime(BOOT_SCREEN_FADE_MS)
    expect(bootScreenEl()).toBeNull()
    expect(isBootScreenHidden()).toBe(true)
  })

  it('does not come back on later layout swaps', () => {
    captureBootScreen()
    hideBootScreen()
    vi.advanceTimersByTime(BOOT_SCREEN_FADE_MS)

    document.body.innerHTML = '<div id="page"></div>'
    restoreBootScreen()

    expect(bootScreenEl()).toBeNull()
  })

  it('hides itself after the safety timeout even if no page renders', () => {
    captureBootScreen()

    vi.advanceTimersByTime(BOOT_SCREEN_MAX_MS + BOOT_SCREEN_FADE_MS)

    expect(bootScreenEl()).toBeNull()
    expect(isBootScreenHidden()).toBe(true)
  })

  it('is idempotent — a second hide call is a no-op', () => {
    captureBootScreen()
    hideBootScreen()
    vi.advanceTimersByTime(BOOT_SCREEN_FADE_MS)

    expect(() => hideBootScreen()).not.toThrow()
    expect(bootScreenEl()).toBeNull()
  })

  it('tolerates a missing boot screen node (e.g. cached old index.html)', () => {
    document.body.innerHTML = ''

    expect(() => {
      captureBootScreen()
      restoreBootScreen()
      hideBootScreen()
    }).not.toThrow()
  })
})
