import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { animateTabBar, initTabBarAnimations } from '../../lib/tabBarAnimation.js'
import { fire } from '../../lib/event.js'

function makeNav ({ scrollWidth, clientWidth, parent = document.body } = {}) {
  const nav = document.createElement('nav')
  nav.className = 'nav nav-pills'
  parent.appendChild(nav)

  // jsdom does not lay out content, so fake the dimensions getBoundingClientRect uses.
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
    width: clientWidth,
    height: 40,
    top: 0,
    left: 0,
    right: clientWidth,
    bottom: 40
  })
  Object.defineProperty(nav, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(nav, 'clientWidth', { value: clientWidth, configurable: true })

  nav.scrollTo = vi.fn()
  return nav
}

describe('animateTabBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('applies the slide-in CSS class so the @keyframes animation runs', () => {
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })
    animateTabBar(nav)
    expect(nav.classList.contains('tab-bar-enter')).toBe(true)
  })

  it('peek-scrolls to the right edge then back when the tabs overflow horizontally', () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    animateTabBar(nav)
    // Slide-in: peek does not start yet.
    expect(nav.scrollTo).not.toHaveBeenCalled()

    // After the slide-in window, peek to the right edge.
    vi.advanceTimersByTime(1000)
    expect(nav.scrollTo).toHaveBeenCalledWith({ left: 500, behavior: 'smooth' })

    // After the peek hold, scroll back to the start.
    vi.advanceTimersByTime(500)
    expect(nav.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    expect(nav.scrollTo).toHaveBeenCalledTimes(2)
  })

  it('does not peek-scroll when the tabs already fit without overflow', () => {
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })

    animateTabBar(nav)
    vi.advanceTimersByTime(2000)

    expect(nav.scrollTo).not.toHaveBeenCalled()
  })

  it('skips the peek-scroll when the nav has been removed from the DOM mid-animation', () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    animateTabBar(nav)
    nav.remove()
    vi.advanceTimersByTime(2000)

    expect(nav.scrollTo).not.toHaveBeenCalled()
  })

  it('restarts the entrance animation on subsequent calls (class is re-added)', () => {
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })

    animateTabBar(nav)
    expect(nav.classList.contains('tab-bar-enter')).toBe(true)

    // Second call removes the class, forces reflow, then re-adds it.
    animateTabBar(nav)
    expect(nav.classList.contains('tab-bar-enter')).toBe(true)
  })
})

describe('initTabBarAnimations', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    initTabBarAnimations()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('animates a tab bar already in the DOM when page-changed fires (cached or sync render)', () => {
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })

    fire('page-changed')

    expect(nav.classList.contains('tab-bar-enter')).toBe(true)
  })

  it('animates a tab bar inserted AFTER page-changed fires (async render or update() race)', async () => {
    fire('page-changed')

    // Simulate a page like my-team that re-renders shortly after page-changed:
    // its onQueryChanged → load() → update() inserts the nav a tick later.
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })

    // MutationObserver delivers via microtask in jsdom.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(nav.classList.contains('tab-bar-enter')).toBe(true)
  })

  it('animates a tab bar inserted nested inside a wrapper after page-changed', async () => {
    fire('page-changed')

    const wrapper = document.createElement('div')
    const nav = document.createElement('nav')
    nav.className = 'nav nav-pills'
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      width: 300, height: 40, top: 0, left: 0, right: 300, bottom: 40
    })
    wrapper.appendChild(nav)
    // Append the wrapper containing the nav — observer sees the wrapper insertion.
    document.body.appendChild(wrapper)

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(nav.classList.contains('tab-bar-enter')).toBe(true)
  })
})
