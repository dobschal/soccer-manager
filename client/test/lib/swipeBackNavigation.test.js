import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __test } from '../../lib/swipeBackNavigation.js'

const { onTouchStart, onTouchMove, onTouchEnd, initHistoryTracking, resetHistoryStack } = __test

function touchEvent (touches, { cancelable = true } = {}) {
  const preventDefault = vi.fn()
  return {
    touches: touches.map(([x, y]) => ({ clientX: x, clientY: y })),
    cancelable,
    preventDefault
  }
}

function setupPage () {
  const page = document.createElement('div')
  page.id = 'page'
  document.body.appendChild(page)
  return page
}

function pushHashEntry (hash) {
  window.location.hash = hash
  window.dispatchEvent(new Event('hashchange'))
}

describe('swipeBackNavigation', () => {
  let backSpy

  beforeEach(() => {
    resetHistoryStack()
    // jsdom's default location is non-writable in this project's setup,
    // so re-define hash with a controllable getter/setter.
    let _hash = '#dashboard'
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get hash () { return _hash },
        set hash (v) { _hash = v.startsWith('#') ? v : '#' + v },
        href: 'http://localhost/',
        reload: vi.fn()
      },
      writable: true
    })
    initHistoryTracking()
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    window.__swipeBackInProgress = false
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('ignores touches that start outside the left edge', () => {
    pushHashEntry('#team?id=1')
    const page = setupPage()

    onTouchStart(touchEvent([[120, 200]]))
    onTouchMove(touchEvent([[300, 200]]))
    onTouchEnd()

    expect(page.style.transform).toBe('')
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('accepts touches inside the widened (80px) left edge', () => {
    pushHashEntry('#team?id=1')
    const page = setupPage()

    onTouchStart(touchEvent([[70, 200]]))
    onTouchMove(touchEvent([[200, 200]]))

    // The container should follow the finger (committed), proving the start
    // point at 70px is treated as inside the edge zone.
    expect(page.style.transform).toBe('translateX(130px)')
    onTouchEnd()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('does not trigger history.back() when there is no intra-app history', () => {
    // Only one entry in our tracked stack (the initial hash).
    const page = setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()

    expect(page.style.transform).toBe('')
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('follows the finger while swiping from the left edge', () => {
    pushHashEntry('#team?id=1')
    const page = setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[55, 200]]))

    expect(page.style.transform).toBe('translateX(50px)')
    expect(page.style.transition).toBe('none')
  })

  it('calls history.back() when the swipe passes the commit threshold', () => {
    pushHashEntry('#team?id=1')
    setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()

    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('pins the outgoing wrapper absolutely and animates it off-screen when the swipe commits', () => {
    pushHashEntry('#team?id=1')
    const page = setupPage()
    const outgoing = document.createElement('div')
    outgoing.setAttribute('data-page', 'team?id=1')
    page.appendChild(outgoing)

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()

    expect(outgoing.style.position).toBe('absolute')
    expect(outgoing.style.zIndex).toBe('10')
    expect(outgoing.classList.contains('swipe-back-outgoing')).toBe(true)
    // Container transform is reset; the wrapper now owns the translation.
    expect(page.style.transform).toBe('')
    expect(window.__swipeBackInProgress).toBe(true)
  })

  it('does not slide the outgoing wrapper off-screen when __swipeBackInProgress is cleared (e.g. router same-key back nav like sub_page swap)', async () => {
    // Repro for the sub_page swipe-back bug: when history.back() lands on the
    // same cache key (e.g. #dashboard?sub_page=log → #dashboard), the router
    // does not swap wrappers, so the active wrapper must not be slid off-screen
    // or the page goes blank. The router signals this by clearing the flag.
    pushHashEntry('#dashboard?sub_page=log')
    const page = setupPage()
    const outgoing = document.createElement('div')
    outgoing.setAttribute('data-page', 'dashboard')
    page.appendChild(outgoing)

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()

    expect(window.__swipeBackInProgress).toBe(true)
    // Simulate the router clearing the flag from its hashchange handler
    // before the nested RAFs paint the slide-off transition.
    window.__swipeBackInProgress = false

    // Let the two nested RAFs fire. jsdom polyfills RAF via setTimeout(0).
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(outgoing.style.transform).not.toContain('100vw')
    expect(outgoing.style.opacity).not.toBe('0')
  })

  it('skips the outgoing-wrapper animation when no visible page child exists', () => {
    pushHashEntry('#team?id=1')
    setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    expect(() => onTouchEnd()).not.toThrow()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('snaps back without calling history.back() when the swipe is too short', () => {
    vi.useFakeTimers()
    pushHashEntry('#team?id=1')
    const page = setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[40, 200]]))
    onTouchEnd()

    expect(backSpy).not.toHaveBeenCalled()
    expect(page.style.transform).toBe('translateX(0)')
    expect(page.style.transition).toMatch(/transform/)

    vi.advanceTimersByTime(300)
    expect(page.style.transform).toBe('')
    expect(page.style.transition).toBe('')
    vi.useRealTimers()
  })

  it('cancels the gesture if the motion turns mostly vertical before committing', () => {
    pushHashEntry('#team?id=1')
    const page = setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[10, 240]]))
    onTouchMove(touchEvent([[100, 240]]))
    onTouchEnd()

    expect(page.style.transform).toBe('')
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('calls preventDefault on touchmove once the swipe is committed (so iOS WKWebView does not steal the gesture)', () => {
    pushHashEntry('#team?id=1')
    setupPage()

    onTouchStart(touchEvent([[5, 200]]))

    // Below the horizontal-lock threshold: not yet committed, no preventDefault.
    const smallMove = touchEvent([[10, 200]])
    onTouchMove(smallMove)
    expect(smallMove.preventDefault).not.toHaveBeenCalled()

    // Past the horizontal-lock threshold: committed, preventDefault fires.
    const bigMove = touchEvent([[50, 200]])
    onTouchMove(bigMove)
    expect(bigMove.preventDefault).toHaveBeenCalled()
  })

  it('does not throw when preventDefault is called on a non-cancelable touchmove', () => {
    pushHashEntry('#team?id=1')
    setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    expect(() => onTouchMove(touchEvent([[60, 200]], { cancelable: false }))).not.toThrow()
  })

  it('decrements the tracked stack when the user navigates back, so a second back-swipe is gated', () => {
    pushHashEntry('#team?id=1')
    setupPage()

    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()
    expect(backSpy).toHaveBeenCalledTimes(1)

    // Simulate the browser delivering the back-navigation hashchange.
    pushHashEntry('#dashboard')

    // Now we're at the initial entry — no more history to consume.
    onTouchStart(touchEvent([[5, 200]]))
    onTouchMove(touchEvent([[200, 200]]))
    onTouchEnd()
    expect(backSpy).toHaveBeenCalledTimes(1)
  })
})
