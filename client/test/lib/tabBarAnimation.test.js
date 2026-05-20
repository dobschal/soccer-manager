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

  return nav
}

describe('animateTabBar', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('snaps the scroll to the right edge immediately when the tabs overflow', () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    animateTabBar(nav)

    // Synchronously snapped to the right edge — no smooth scroll, no delay.
    expect(nav.scrollLeft).toBe(500)
  })

  it('animates the scroll back to the start via requestAnimationFrame', async () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    // Drive rAF manually so we can simulate the easing landing at 0.
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation(cb => { cb(performance.now() + 5000); return 1 })

    animateTabBar(nav)

    // animateTabBar pauses briefly between the snap and the back-scroll;
    // wait for that pause to elapse before asserting the final position.
    await new Promise(resolve => setTimeout(resolve, 600))

    expect(nav.scrollLeft).toBe(0)

    rafSpy.mockRestore()
  })

  it('does nothing when the tabs already fit without overflow', () => {
    const nav = makeNav({ scrollWidth: 300, clientWidth: 300 })

    animateTabBar(nav)

    expect(nav.scrollLeft).toBe(0)
  })

  it('does nothing when the nav has been removed from the DOM', () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })
    nav.remove()

    animateTabBar(nav)

    expect(nav.scrollLeft).toBe(0)
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

  it('snaps an overflowing tab bar to the right edge when page-changed fires', () => {
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    fire('page-changed')

    expect(nav.scrollLeft).toBe(500)
  })

  it('animates a tab bar inserted AFTER page-changed fires (async render or update() race)', async () => {
    fire('page-changed')

    // Simulate a page like my-team that re-renders shortly after page-changed:
    // its onQueryChanged → load() → update() inserts the nav a tick later.
    const nav = makeNav({ scrollWidth: 800, clientWidth: 300 })

    // MutationObserver delivers via microtask in jsdom.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(nav.scrollLeft).toBe(500)
  })

  it('animates a tab bar inserted nested inside a wrapper after page-changed', async () => {
    fire('page-changed')

    const wrapper = document.createElement('div')
    const nav = document.createElement('nav')
    nav.className = 'nav nav-pills'
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      width: 300, height: 40, top: 0, left: 0, right: 300, bottom: 40
    })
    Object.defineProperty(nav, 'scrollWidth', { value: 800, configurable: true })
    Object.defineProperty(nav, 'clientWidth', { value: 300, configurable: true })
    wrapper.appendChild(nav)
    // Append the wrapper containing the nav — observer sees the wrapper insertion.
    document.body.appendChild(wrapper)

    await new Promise(resolve => setTimeout(resolve, 0))

    expect(nav.scrollLeft).toBe(500)
  })

  it('animates a cached nav once its wrapper becomes visible after the slide transition', async () => {
    // Simulates a cached page revisit: the nav exists already, but the router
    // keeps the wrapper display:none for the first ~310ms of the slide. Our
    // retry timers must still catch it once it becomes visible.
    const nav = document.createElement('nav')
    nav.className = 'nav nav-pills'
    let visible = false
    vi.spyOn(nav, 'getBoundingClientRect').mockImplementation(() => ({
      width: visible ? 300 : 0,
      height: visible ? 40 : 0,
      top: 0,
      left: 0,
      right: visible ? 300 : 0,
      bottom: visible ? 40 : 0
    }))
    Object.defineProperty(nav, 'scrollWidth', { value: 800, configurable: true })
    Object.defineProperty(nav, 'clientWidth', { value: 300, configurable: true })
    document.body.appendChild(nav)

    // Suppress the rAF-driven back-scroll so we can assert the snap value
    // without the easing moving scrollLeft before we read it.
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1)

    fire('page-changed')
    // At this instant the wrapper is "display:none" — nav has zero box.
    expect(nav.scrollLeft).toBe(0)

    // Wrapper becomes visible after the slide finishes; a retry tick fires.
    visible = true
    await new Promise(resolve => setTimeout(resolve, 400))

    expect(nav.scrollLeft).toBe(500)
    rafSpy.mockRestore()
  })
})
