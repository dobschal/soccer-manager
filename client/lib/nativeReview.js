import { sendLog } from './clientLogger.js'

/**
 * Native in-app review prompt (#371).
 *
 * Apple (SKStoreReviewController) and Google (In-App Review) both rate-limit
 * how often the prompt actually appears, but we additionally throttle on our
 * side so we only *ask* after a win and at most once every ~60 days. The prompt
 * only makes sense inside the native iOS/Android WebView.
 */

const REVIEW_LAST_PROMPT_KEY = 'native_review_last_prompt'
const MIN_DAYS_BETWEEN_PROMPTS = 60
const MS_PER_DAY = 24 * 60 * 60 * 1000

function isNativeApp () {
  return Boolean(window.__nativePlatform)
}

function lastPromptTs () {
  try {
    return Number(window.localStorage.getItem(REVIEW_LAST_PROMPT_KEY)) || 0
  } catch {
    return 0
  }
}

function rememberPrompt () {
  try {
    window.localStorage.setItem(REVIEW_LAST_PROMPT_KEY, String(Date.now()))
  } catch {
    // ignore storage failures
  }
}

/**
 * Ask the native layer to show the system review dialog, respecting our own
 * throttle. Safe to call on web (no-op there).
 * @returns {boolean} whether a request was sent to the native layer
 */
export function requestNativeReview () {
  if (!isNativeApp()) return false
  if (Date.now() - lastPromptTs() < MIN_DAYS_BETWEEN_PROMPTS * MS_PER_DAY) return false

  let sent = false
  try {
    const iosBridge = window.webkit?.messageHandlers?.fmioBridge
    if (iosBridge && typeof iosBridge.postMessage === 'function') {
      iosBridge.postMessage(JSON.stringify({ type: 'requestReview' }))
      sent = true
    } else if (window.AndroidBridge && typeof window.AndroidBridge.requestReview === 'function') {
      window.AndroidBridge.requestReview()
      sent = true
    }
  } catch (e) {
    sendLog(`[Review] Failed to request native review: ${e?.message ?? e}`, 'error')
    return false
  }

  if (sent) {
    rememberPrompt()
    sendLog('[Review] Requested native review prompt')
  }
  return sent
}

/**
 * Request a review prompt after a winning game (#371). Only fires for wins.
 * @param {boolean} didWin
 * @returns {boolean}
 */
export function maybeRequestReviewAfterWin (didWin) {
  if (!didWin) return false
  return requestNativeReview()
}
