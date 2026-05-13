import { on } from './event.js'

const ENTER_CLASS = 'tab-bar-enter'
const SLIDE_IN_MS = 1000
const PEEK_HOLD_MS = 500
const OVERFLOW_THRESHOLD_PX = 16
const PAGE_CHANGE_WINDOW_MS = 1500
const NAV_SELECTOR = '.nav.nav-pills'

let _pageChangeWindowEnd = 0

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
 * Run the entrance animation for a single tab bar:
 *   1. Slide it in from the left via the CSS @keyframes animation.
 *   2. If there is horizontal overflow, briefly scroll right to peek at the
 *      hidden tabs, then scroll back to the start.
 * @param {HTMLElement} nav
 */
export function animateTabBar (nav) {
  // Restart the CSS animation by toggling the class.
  nav.classList.remove(ENTER_CLASS)
  // Force reflow so the re-added class restarts the animation.
  void nav.offsetWidth
  nav.classList.add(ENTER_CLASS)

  // After the slide-in finishes, do the peek-scroll if the bar overflows.
  setTimeout(() => {
    if (!isVisible(nav)) return
    const maxScroll = nav.scrollWidth - nav.clientWidth
    if (maxScroll < OVERFLOW_THRESHOLD_PX) return
    nav.scrollTo({ left: maxScroll, behavior: 'smooth' })
    setTimeout(() => {
      if (!isVisible(nav)) return
      nav.scrollTo({ left: 0, behavior: 'smooth' })
    }, PEEK_HOLD_MS)
  }, SLIDE_IN_MS)
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
 * @param {Node} node
 */
function animateMatchingNavs (node) {
  if (!(node instanceof Element)) return
  const navs = node.matches?.(NAV_SELECTOR)
    ? [node]
    : Array.from(node.querySelectorAll?.(NAV_SELECTOR) || [])
  navs.filter(isVisible).forEach(animateTabBar)
}

/**
 * Animate every tab bar currently visible in the DOM. Handles cached page
 * revisits where the nav element is already present (no insertion happens) as
 * well as fast sync renders where the nav exists by the time `page-changed`
 * fires.
 */
function animateCurrentlyVisibleNavs () {
  Array.from(document.querySelectorAll(NAV_SELECTOR))
    .filter(isVisible)
    .forEach(animateTabBar)
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
  _observer.observe(document.body, { childList: true, subtree: true })
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
    animateCurrentlyVisibleNavs()
  })
}
