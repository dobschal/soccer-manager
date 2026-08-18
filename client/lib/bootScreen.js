/**
 * The boot screen is the bouncing ball that `index.html` paints before any JS
 * runs. It used to be removed as soon as the router started resolving the first
 * page, which made the cold start look like three separate steps:
 *
 *   1. ball on the native background
 *   2. top bar + tab bar pop in around an empty white `#page`
 *   3. a *second* bouncing ball inside that white page while the first page
 *      fetched its data
 *   4. the actual dashboard
 *
 * Instead the ball now stays as a full-screen opaque cover until the router
 * reports the first page as rendered, so steps 2 and 3 happen behind it and the
 * app appears in one go.
 *
 * Two details make this work:
 * - `_renderLayout` assigns `document.body.innerHTML`, which detaches the boot
 *   screen. `restoreBootScreen()` re-appends the very same node afterwards.
 * - `hideBootScreen()` is idempotent and armed with a timeout, so a page that
 *   never finishes loading cannot leave the user staring at the ball forever.
 */

export const BOOT_SCREEN_ID = 'initial-loading-ball'

/** Matches the opacity transition of `.boot-screen` in base.css. */
export const BOOT_SCREEN_FADE_MS = 250

/** Safety net: never cover the app longer than this, even if no page renders. */
export const BOOT_SCREEN_MAX_MS = 15000

/** @type {HTMLElement|null} */
let _node = null
let _hidden = false
/** @type {ReturnType<typeof setTimeout>|null} */
let _timer = null

/**
 * Remember the boot screen node (it survives `document.body.innerHTML = ...`
 * only because we hold on to it here) and arm the safety timeout.
 *
 * @returns {void}
 */
export function captureBootScreen () {
  if (_hidden) return
  _node = _node ?? document.getElementById(BOOT_SCREEN_ID)
  if (!_node) return
  if (_timer) clearTimeout(_timer)
  _timer = setTimeout(hideBootScreen, BOOT_SCREEN_MAX_MS)
}

/**
 * Re-attach the boot screen after the layout replaced the whole body. No-op
 * once the boot screen has been hidden, so later layout swaps (e.g. login →
 * dashboard) don't bring the ball back.
 *
 * @returns {void}
 */
export function restoreBootScreen () {
  if (_hidden || !_node) return
  if (!document.body.contains(_node)) {
    document.body.appendChild(_node)
  }
}

/**
 * Fade out and remove the boot screen. Safe to call repeatedly.
 *
 * @returns {void}
 */
export function hideBootScreen () {
  if (_hidden) return
  _hidden = true
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
  const node = _node ?? document.getElementById(BOOT_SCREEN_ID)
  _node = null
  if (!node) return
  node.classList.add('boot-screen--hidden')
  setTimeout(() => node.remove(), BOOT_SCREEN_FADE_MS)
}

/**
 * @returns {boolean} true once `hideBootScreen()` has run
 */
export function isBootScreenHidden () {
  return _hidden
}

/**
 * Test-only: forget the captured node so each test starts from scratch.
 *
 * @returns {void}
 */
export function _resetBootScreenState () {
  if (_timer) clearTimeout(_timer)
  _timer = null
  _node = null
  _hidden = false
}
