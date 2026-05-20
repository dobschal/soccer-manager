import { on } from './event.js'
import { delay } from './delay.js'

const SCROLL_BACK_MS = 1000
const OVERFLOW_THRESHOLD_PX = 16
const PAGE_CHANGE_WINDOW_MS = 1500
// The router slides cached page wrappers in over ~620ms, during which the
// wrapper is `display: none` and the nav inside it has a zero-sized box. We
// re-check at these offsets so we still catch the nav once it becomes visible.
const VISIBILITY_RETRY_DELAYS_MS = [0, 350, 700, 1100]
const NAV_SELECTOR = '.nav.nav-pills'

let _pageChangeWindowEnd = 0
let _animatedNavs = new WeakSet()

/**
 * Whether a node is actually visible (connected and has a non-zero box).
 * @param {Element} node
 * @returns {boolean}
 */
function isVisible (node) {
  if (!node.isConnected) return false
  const rect = node.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * Cubic ease-in so the back-scroll starts slow and accelerates into the start.
 * @param {number} t in [0,1]
 */
function easeInCubic (t) {
  return t * t * t
}

/**
 * Manual rAF-based scroll so the animation also runs reliably in iOS WKWebView,
 * where `scrollTo({ behavior: 'smooth' })` is unreliable.
 * @param {HTMLElement} nav
 * @param {number} from
 * @param {number} to
 * @param {number} duration
 */
function animateScroll (nav, from, to, duration) {
  if (typeof requestAnimationFrame === 'undefined') {
    nav.scrollLeft = to
    return
  }
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now())

  function step (now) {
    if (!isVisible(nav)) return
    const elapsed = now - start
    const progress = Math.min(elapsed / duration, 1)
    nav.scrollLeft = from + (to - from) * easeInCubic(progress)
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

/**
 * Run the entrance animation for a single tab bar:
 *   1. Snap-scroll instantly to the right edge so the hidden tabs are revealed.
 *   2. Slowly scroll back to the start so the user sees the first tabs land.
 * @param {HTMLElement} nav
 */
export async function animateTabBar (nav) {
  if (!isVisible(nav)) return
  const maxScroll = nav.scrollWidth - nav.clientWidth
  if (maxScroll < OVERFLOW_THRESHOLD_PX) return

  // Snap to the right edge with no animation so the bar appears already scrolled.
  nav.scrollLeft = maxScroll

  await delay(300)

  // Then slowly scroll back to the start.
  animateScroll(nav, maxScroll, 0, SCROLL_BACK_MS)
}

/**
 * Whether we are currently inside the short post-`page-changed` window during
 * which DOM-inserted tab bars should still be animated. The window covers
 * pages like `my-team` that re-render themselves asynchronously after
 * navigation (their `onQueryChanged` runs `load()` + `update()` so the nav
 * present at `page-changed` time is replaced moments later).
 * @returns {boolean}
 */
function isWithinPageChangeWindow () {
  return Date.now() < _pageChangeWindowEnd
}

/**
 * Animate the nav unless we already animated it for this page-change. The
 * dedupe avoids re-snapping the same nav when both the retry timers and the
 * MutationObserver path see the same element.
 * @param {HTMLElement} nav
 */
function animateOnce (nav) {
  if (_animatedNavs.has(nav)) return
  if (!isVisible(nav)) return
  _animatedNavs.add(nav)
  animateTabBar(nav)
}

/**
 * @param {Node} node
 */
function animateMatchingNavs (node) {
  if (!(node instanceof Element)) return
  const navs = node.matches?.(NAV_SELECTOR)
    ? [node]
    : Array.from(node.querySelectorAll?.(NAV_SELECTOR) || [])
  navs.forEach(animateOnce)
}

/**
 * Animate every tab bar currently visible in the DOM. Handles cached page
 * revisits where the nav element is already present (no insertion happens) as
 * well as fast sync renders where the nav exists by the time `page-changed`
 * fires.
 */
function animateCurrentlyVisibleNavs () {
  Array.from(document.querySelectorAll(NAV_SELECTOR)).forEach(animateOnce)
}

let _observer = null

function startObserving () {
  if (_observer || typeof MutationObserver === 'undefined') return
  _observer = new MutationObserver(mutations => {
    if (!isWithinPageChangeWindow()) return
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(animateMatchingNavs)
    }
  })
  _observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

/**
 * Register the global page-changed listener and DOM observer. Animates the
 * tab bar every time the user opens a tabbed page, including:
 *   - Fresh page renders
 *   - Cached page revisits (display toggle, no DOM insertion)
 *   - Pages like `my-team` that fully re-render themselves shortly after
 *     `page-changed` fires via their own `onQueryChanged` → `update()` flow
 */
export function initTabBarAnimations () {
  startObserving()
  on('page-changed', () => {
    _pageChangeWindowEnd = Date.now() + PAGE_CHANGE_WINDOW_MS
    // Reset the dedupe set so cached pages re-animate on every revisit. The
    // retry schedule catches the nav once its wrapper finishes sliding in.
    _animatedNavs = new WeakSet()
    VISIBILITY_RETRY_DELAYS_MS.forEach(delay => {
      if (delay === 0) {
        animateCurrentlyVisibleNavs()
      } else {
        setTimeout(animateCurrentlyVisibleNavs, delay)
      }
    })
  })
}
