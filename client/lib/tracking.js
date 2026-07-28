import { server } from './gateway.js'

const CLIENT_ID_KEY = 'fm_client_id'
let _lastTrackedPage = null

/**
 * Get (or lazily create) a stable anonymous client id stored in localStorage.
 * Lets us correlate pre-login funnel steps (landing → register → login) that
 * have no authenticated user yet.
 * @returns {string}
 */
function getClientId () {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable (private mode / SSR) — tracking still works
    // server-side, just without a stable client id.
    return null
  }
}

/**
 * Report a page view to the server. Fire-and-forget: never blocks navigation
 * and swallows errors (tracking must never break the app). Consecutive views
 * of the same page are de-duplicated so query-param-only changes don't spam.
 * @param {string} page - Route/page key (e.g. 'dashboard')
 * @returns {void}
 */
export function trackPageView (page) {
  if (!page || page === _lastTrackedPage) return
  _lastTrackedPage = page
  try {
    void server.trackPageView(page, getClientId()).catch(() => {})
  } catch {
    // Ignore — tracking is best-effort.
  }
}
