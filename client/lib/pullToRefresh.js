import { el } from './html.js'

const ARM_THRESHOLD_PX = 70
const MAX_PULL_PX = 110
const DAMPING = 0.5
const VERTICAL_LOCK_PX = 40
const HORIZONTAL_CANCEL_PX = 12
const SNAP_BACK_MS = 200

let _touchStartX = 0
let _touchStartY = 0
let _touchCurrentY = 0
let _isTracking = false
let _isCommitted = false
let _indicatorEl = null

function _log (...args) {
  if (typeof window !== 'undefined' && window.__SWIPE_DEBUG) {
    console.log('[pull-to-refresh]', ...args)
  }
}

/**
 * In the native-app layout, #page is the scrollable container (overflow-y:
 * scroll). In the default browser layout, the window scrolls. Treat the
 * page as "at top" only when both scroll positions are zero.
 * @returns {boolean}
 */
function _isAtTop () {
  const page = el('#page')
  const pageScroll = page ? page.scrollTop : 0
  const windowScroll = window.scrollY || window.pageYOffset || 0
  return pageScroll <= 0 && windowScroll <= 0
}

/**
 * True while the shared showOverlay modal is on top. Pull-to-refresh must
 * step aside then — otherwise swiping down inside the overlay reloads the
 * whole page. The overlay handles its own swipe-to-close.
 * @returns {boolean}
 */
function _isOverlayOpen () {
  return !!document.querySelector('.overlay-backdrop')
}

/**
 * Create (or reuse) the loading-ball indicator and append it to <body>. The
 * router wipes body.innerHTML on layout changes, so we lazily re-create the
 * element each time a gesture commits — cheaper than wiring into router
 * lifecycle events.
 * @returns {HTMLElement}
 */
function _ensureIndicator () {
  if (_indicatorEl && document.body.contains(_indicatorEl)) return _indicatorEl
  _indicatorEl = document.createElement('div')
  _indicatorEl.className = 'pull-to-refresh-indicator'
  _indicatorEl.setAttribute('aria-hidden', 'true')
  _indicatorEl.innerHTML = `
    <div class="ui-element-loading-ball-wrapper">
      <div class="ui-element-loading-ball"><img src="assets/ball.svg" alt=""/></div>
      <div class="ui-element-loading-shadow"></div>
    </div>
  `
  document.body.appendChild(_indicatorEl)
  return _indicatorEl
}

/**
 * @param {TouchEvent} e
 * @returns {void}
 */
function _onTouchStart (e) {
  if (e.touches.length !== 1) return
  if (_isOverlayOpen()) return
  if (!_isAtTop()) return
  const t = e.touches[0]
  _touchStartX = t.clientX
  _touchStartY = t.clientY
  _touchCurrentY = _touchStartY
  _isTracking = true
  _isCommitted = false
  _log('touchstart at', t.clientX, t.clientY)
}

/**
 * @param {TouchEvent} e
 * @returns {void}
 */
function _onTouchMove (e) {
  if (!_isTracking) return
  const t = e.touches[0]
  _touchCurrentY = t.clientY
  const dy = _touchCurrentY - _touchStartY
  const dx = t.clientX - _touchStartX

  // Upward motion → not a pull-to-refresh.
  if (dy <= 0) {
    if (_isCommitted) _resetVisual()
    return
  }

  // Horizontal motion dominates → user is probably swiping back (or scrolling
  // horizontally). Bail out so we don't fight the other gesture.
  if (!_isCommitted && Math.abs(dx) > HORIZONTAL_CANCEL_PX && Math.abs(dx) > dy) {
    _log('cancel — horizontal motion dominant', { dx, dy })
    _reset()
    return
  }

  // Lost the "at top" condition mid-gesture (e.g. scroll inertia from a
  // previous flick), or an overlay opened on top of us. Abort.
  if (!_isAtTop() || _isOverlayOpen()) {
    _reset()
    return
  }

  if (!_isCommitted) {
    // Wait until the motion is clearly a downward pull before claiming the
    // gesture. Without this, a left-edge horizontal swipe with the tiniest
    // bit of finger drift would steal the touch from swipe-back.
    if (dy < VERTICAL_LOCK_PX) return
    if (dy <= Math.abs(dx)) {
      _reset()
      return
    }
    _isCommitted = true
    _ensureIndicator()
    _indicatorEl.classList.add('active')
    _log('committed')
  }

  // Block iOS' elastic bounce / scroll once we own the gesture.
  if (typeof e.cancelable === 'boolean' ? e.cancelable : true) {
    try { e.preventDefault() } catch { /* passive listener — ignore */ }
  }

  // Start the visible pull from 0 after crossing the lock threshold, so the
  // indicator doesn't snap in 20px deep — it slides out from above as the
  // user keeps pulling.
  const damped = Math.min((dy - VERTICAL_LOCK_PX) * DAMPING, MAX_PULL_PX)
  _indicatorEl.style.transition = 'none'
  _indicatorEl.style.transform = `translateY(${damped}px)`
  _indicatorEl.classList.toggle('armed', damped >= ARM_THRESHOLD_PX)
}

/**
 * @returns {void}
 */
function _onTouchEnd () {
  if (!_isTracking) return
  const dy = _touchCurrentY - _touchStartY
  const committed = _isCommitted
  const indicator = _indicatorEl
  _reset()

  if (!committed || !indicator) return

  const damped = Math.min((dy - VERTICAL_LOCK_PX) * DAMPING, MAX_PULL_PX)
  if (damped >= ARM_THRESHOLD_PX) {
    _log('release → reload', { dy })
    indicator.classList.add('refreshing')
    indicator.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`
    indicator.style.transform = `translateY(${ARM_THRESHOLD_PX}px)`
    // Reload after a brief frame so the user sees the "armed" state snap
    // into place before the WebView blanks for the reload.
    setTimeout(() => window.location.reload(), 80)
    return
  }

  _log('snap back', { dy })
  indicator.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`
  indicator.style.transform = ''
  setTimeout(() => {
    indicator.classList.remove('active', 'armed')
    indicator.style.transition = ''
  }, SNAP_BACK_MS + 20)
}

function _resetVisual () {
  if (!_indicatorEl) return
  _indicatorEl.style.transform = ''
  _indicatorEl.classList.remove('active', 'armed')
}

function _reset () {
  _isTracking = false
  _isCommitted = false
}

/**
 * Enable native-feeling pull-to-refresh: when the page is scrolled to the
 * top, swiping further down reveals a bouncing-ball indicator. Releasing
 * past the arm threshold reloads the webapp, landing on the same page.
 *
 * To debug from Safari Web Inspector, set `window.__SWIPE_DEBUG = true`.
 *
 * @returns {void}
 */
export function initPullToRefresh () {
  // touchmove must be non-passive so we can preventDefault once committed —
  // same reason as swipeBackNavigation: iOS WKWebView otherwise keeps the
  // gesture for its own elastic-bounce / scroll recognizer.
  document.addEventListener('touchstart', _onTouchStart, { passive: true })
  document.addEventListener('touchmove', _onTouchMove, { passive: false })
  document.addEventListener('touchend', _onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', _onTouchEnd, { passive: true })

  console.log('[pull-to-refresh] listeners attached')
}

// Test-only exports.
export const __test = {
  onTouchStart: _onTouchStart,
  onTouchMove: _onTouchMove,
  onTouchEnd: _onTouchEnd,
  getIndicator: () => _indicatorEl,
  reset: () => {
    _isTracking = false
    _isCommitted = false
    if (_indicatorEl) _indicatorEl.remove()
    _indicatorEl = null
  }
}
