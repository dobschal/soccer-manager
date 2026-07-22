import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __test } from '../../lib/pullToRefresh.js'

const { onTouchStart, onTouchMove, onTouchEnd, getIndicator, reset } = __test

function touchEvent (touches, { cancelable = true } = {}) {
  const preventDefault = vi.fn()
  return {
    touches: touches.map(([x, y]) => ({ clientX: x, clientY: y })),
    cancelable,
    preventDefault
  }
}

function setupPage ({ scrollTop = 0 } = {}) {
  const page = document.createElement('div')
  page.id = 'page'
  Object.defineProperty(page, 'scrollTop', {
    value: scrollTop,
    writable: true,
    configurable: true
  })
  document.body.appendChild(page)
  return page
}

describe('pullToRefresh', () => {
  let reloadSpy

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        hash: '#dashboard',
        href: 'http://localhost/',
        reload: vi.fn()
      },
      writable: true
    })
    reloadSpy = window.location.reload
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0, writable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    reset()
  })

  it('does not commit when the page is scrolled (not at top)', () => {
    setupPage({ scrollTop: 50 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 250]]))
    onTouchEnd()

    expect(getIndicator()).toBe(null)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('does not commit when window is scrolled (default browser layout)', () => {
    setupPage({ scrollTop: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200, writable: true })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 250]]))
    onTouchEnd()

    expect(getIndicator()).toBe(null)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('does not commit on a tiny downward swipe (below the vertical lock threshold)', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 130]])) // dy=30, under VERTICAL_LOCK_PX=40

    expect(getIndicator()).toBe(null)
  })

  it('shows the indicator only after the user has clearly pulled down', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 180]])) // dy=80, past VERTICAL_LOCK_PX

    const indicator = getIndicator()
    expect(indicator).not.toBe(null)
    expect(indicator.classList.contains('active')).toBe(true)
    // damped = (80 - 40) * 0.5 = 20 → below ARM_THRESHOLD_PX (70)
    expect(indicator.style.transform).toBe('translateY(20px)')
    expect(indicator.classList.contains('armed')).toBe(false)
  })

  it('marks the indicator as armed once pulled past the threshold', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 320]])) // dy=220

    const indicator = getIndicator()
    // damped = (220 - 40) * 0.5 = 90 → above ARM_THRESHOLD_PX (70)
    expect(indicator.classList.contains('armed')).toBe(true)
  })

  it('calls preventDefault on touchmove once committed (so iOS WKWebView does not eat the gesture)', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    const move = touchEvent([[100, 180]])
    onTouchMove(move)
    expect(move.preventDefault).toHaveBeenCalled()
  })

  it('reloads the page when released past the arm threshold', () => {
    vi.useFakeTimers()
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 320]])) // dy=220, damped=90 → armed
    onTouchEnd()

    vi.advanceTimersByTime(100)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('snaps back without reloading when released below the arm threshold', () => {
    vi.useFakeTimers()
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 180]])) // dy=80, damped=20 → not armed
    onTouchEnd()

    const indicator = getIndicator()
    expect(indicator.style.transform).toBe('')
    expect(reloadSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(indicator.classList.contains('active')).toBe(false)
    expect(indicator.classList.contains('armed')).toBe(false)
    vi.useRealTimers()
  })

  it('cancels when horizontal motion dominates before committing (so it does not fight swipe-back)', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[100, 205]]))
    onTouchMove(touchEvent([[200, 350]]))
    onTouchEnd()

    expect(getIndicator()).toBe(null)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('does not trigger when the user swipes upward', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 400]]))
    onTouchMove(touchEvent([[100, 300]]))
    onTouchEnd()

    expect(getIndicator()).toBe(null)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('bails out entirely when a shared overlay (.overlay-backdrop) is open — the overlay owns swipe-down-to-close', () => {
    setupPage({ scrollTop: 0 })
    const overlay = document.createElement('div')
    overlay.className = 'overlay-backdrop'
    document.body.appendChild(overlay)

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 320]]))
    onTouchEnd()

    expect(getIndicator()).toBe(null)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('caps the visual pull at MAX_PULL_PX even with very long swipes', () => {
    setupPage({ scrollTop: 0 })

    onTouchStart(touchEvent([[100, 100]]))
    onTouchMove(touchEvent([[100, 2000]]))

    const indicator = getIndicator()
    // dy=1900, damped = 950 capped at MAX_PULL_PX (110)
    expect(indicator.style.transform).toBe('translateY(110px)')
  })
})
