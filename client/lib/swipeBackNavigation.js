import { el } from './html.js'

const EDGE_THRESHOLD_PX = 80
const COMMIT_THRESHOLD_PX = 80
const HORIZONTAL_LOCK_PX = 8
const VERTICAL_CANCEL_PX = 10
const SNAP_BACK_MS = 200
const SLIDE_OUT_MS = 240

let _touchStartX = 0
let _touchStartY = 0
let _touchCurrentX = 0
let _isTracking = false
let _isCommitted = false
let _containerEl = null

const _historyStack = []
let _historyInitialised = false

function _log (...args) {
  if (typeof window !== 'undefined' && window.__SWIPE_DEBUG) {
    console.log('[swipe-back]', ...args)
  }
}

/**
 * Track the user's intra-app navigation so we can tell whether `history.back()`
 * would stay inside the app. Browser `history.length` includes entries from
 * before the page loaded (referrer, prior tab navigation), so it isn't a
 * reliable proxy.
 * @returns {void}
 */
function _initHistoryTracking () {
  if (_historyInitialised) return
  _historyInitialised = true
  _historyStack.push(window.location.hash || '')
  window.addEventListener('hashchange', () => {
    const current = window.location.hash || ''
    const prev = _historyStack[_historyStack.length - 2]
    if (prev !== undefined && prev === current) {
      // User went back — pop the top entry.
      _historyStack.pop()
    } else if (_historyStack[_historyStack.length - 1] !== current) {
      _historyStack.push(current)
    }
  })
}

/**
 * @returns {boolean}
 */
function _canGoBack () {
  return _historyStack.length > 1
}

/**
 * @param {TouchEvent} e
 * @returns {void}
 */
function _onTouchStart (e) {
  if (e.touches.length !== 1) return
  const t = e.touches[0]
  if (t.clientX > EDGE_THRESHOLD_PX) return
  if (!_canGoBack()) return

  _touchStartX = t.clientX
  _touchStartY = t.clientY
  _touchCurrentX = _touchStartX
  _isTracking = true
  _isCommitted = false
  _containerEl = el('#page')
  _log('touchstart at', t.clientX, t.clientY, 'container?', !!_containerEl)
}

/**
 * @param {TouchEvent} e
 * @returns {void}
 */
function _onTouchMove (e) {
  if (!_isTracking || !_containerEl) return
  const t = e.touches[0]
  _touchCurrentX = t.clientX
  const dx = _touchCurrentX - _touchStartX
  const dy = t.clientY - _touchStartY

  // Vertical scroll detected before we committed to a horizontal swipe.
  if (!_isCommitted && Math.abs(dy) > VERTICAL_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
    _log('cancel — vertical motion dominant', { dx, dy })
    _reset()
    return
  }

  if (dx <= 0) {
    if (_isCommitted) {
      _containerEl.style.transform = 'translateX(0)'
    }
    return
  }

  // Once we've moved horizontally enough, commit. From here on, block iOS'
  // own scroll/back recognizer so the WebView doesn't eat subsequent
  // touchmoves. Calling preventDefault is only allowed because we registered
  // the listener with passive: false.
  if (!_isCommitted && dx > HORIZONTAL_LOCK_PX) {
    _isCommitted = true
    _containerEl.style.willChange = 'transform'
    _containerEl.style.transition = 'none'
    _log('committed at dx', dx)
  }

  if (!_isCommitted) return

  if (typeof e.cancelable === 'boolean' ? e.cancelable : true) {
    try { e.preventDefault() } catch { /* passive listener — ignore */ }
  }
  _containerEl.style.transform = `translateX(${dx}px)`
}

/**
 * @returns {void}
 */
function _onTouchEnd () {
  if (!_isTracking) return
  const dx = _touchCurrentX - _touchStartX
  const container = _containerEl
  const committed = _isCommitted

  _reset()

  if (!container) return

  if (committed && dx > COMMIT_THRESHOLD_PX) {
    _log('commit → history.back()', { dx })
    // Move the visible-page translation from #page onto the outgoing wrapper
    // itself so we can animate it off-screen independently while the router
    // fades in the new page in place. Without this hand-off the whole
    // container would slide back on history.back() and the new page would
    // fly in from the left.
    const outgoing = Array.from(container.children).find(c => c.style.display !== 'none')
    container.style.transition = ''
    container.style.transform = ''
    container.style.willChange = ''

    if (outgoing) {
      // Pin the outgoing wrapper absolutely so the incoming one can occupy
      // the same flex slot without being pushed below it.
      outgoing.style.position = 'absolute'
      outgoing.style.top = '0'
      outgoing.style.left = '0'
      outgoing.style.right = '0'
      outgoing.style.zIndex = '10'
      outgoing.style.transition = 'none'
      outgoing.style.transform = `translateX(${dx}px)`
      outgoing.style.opacity = '1'
      outgoing.classList.add('swipe-back-outgoing')

      // Two RAFs so the starting transform/opacity actually paint before the
      // transition kicks in (single RAF coalesces with the style write).
      // The flag check inside lets the router cancel the slide-off when the
      // back-navigation lands on the same cache key (e.g. sub_page swap) —
      // in that case the wrapper is not replaced, so sliding it off would
      // leave the page blank.
      requestAnimationFrame(() => {
        if (!window.__swipeBackInProgress) return
        requestAnimationFrame(() => {
          if (!window.__swipeBackInProgress) return
          outgoing.style.transition = `transform ${SLIDE_OUT_MS}ms ease-out, opacity ${SLIDE_OUT_MS}ms ease-out`
          outgoing.style.transform = 'translateX(100vw)'
          outgoing.style.opacity = '0'
        })
      })
    }

    window.__swipeBackInProgress = true
    window.history.back()
    // Safety: if the router never consumes the flag (e.g. history.back is a
    // no-op for some reason), clear it so future navigations don't inherit
    // the fade-in branch.
    setTimeout(() => { window.__swipeBackInProgress = false }, 500)
    return
  }

  if (committed) {
    _log('snap back', { dx })
    container.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`
    container.style.transform = 'translateX(0)'
    setTimeout(() => {
      container.style.transition = ''
      container.style.transform = ''
      container.style.willChange = ''
    }, SNAP_BACK_MS + 20)
  }
}

/**
 * @returns {void}
 */
function _reset () {
  _isTracking = false
  _isCommitted = false
  _containerEl = null
}

/**
 * Enable edge-swipe back navigation on touch devices. Swiping right from the
 * left edge of the viewport calls `history.back()`, mirroring the native iOS
 * and Android back gesture. The gesture only triggers when there is intra-app
 * navigation to return to.
 *
 * To debug from Safari Web Inspector (iOS Simulator), set
 * `window.__SWIPE_DEBUG = true` and watch the console.
 *
 * @returns {void}
 */
export function initSwipeBackNavigation () {
  _initHistoryTracking()

  // touchmove must be non-passive so we can preventDefault once the swipe is
  // committed — otherwise iOS WKWebView keeps the gesture for its own scroll
  // recognizer and JS stops receiving touchmoves mid-swipe.
  //
  // We don't gate on `ontouchstart in window` anymore: registering touch
  // listeners on a non-touch device is harmless, and the gate masked iOS
  // WebView edge cases where the property check returned false.
  document.addEventListener('touchstart', _onTouchStart, { passive: true })
  document.addEventListener('touchmove', _onTouchMove, { passive: false })
  document.addEventListener('touchend', _onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', _onTouchEnd, { passive: true })

  console.log('[swipe-back] listeners attached (v2 — passive:false on touchmove)')
}

// Test-only exports.
export const __test = {
  onTouchStart: _onTouchStart,
  onTouchMove: _onTouchMove,
  onTouchEnd: _onTouchEnd,
  initHistoryTracking: _initHistoryTracking,
  resetHistoryStack: () => {
    _historyStack.length = 0
    _historyInitialised = false
  }
}
