import { server } from './gateway.js'
import { getClientId } from './clientId.js'

let _lastTrackedPage = null

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

/**
 * Report a funnel event (registration/login step) to the server. Unlike page
 * views these are NOT de-duplicated: a second registration attempt is a real,
 * separate data point.
 *
 * Only for steps the server cannot see itself — an attempt rejected by
 * client-side validation never reaches a route, so it has to be reported from
 * here. Everything that hits `createAccount` / `login` is recorded server-side.
 * @param {string} event - Event key (e.g. 'register-abort')
 * @param {string} [detail] - Optional reason (e.g. 'email-invalid')
 * @returns {void}
 */
export function trackFunnelEvent (event, detail) {
  if (!event) return
  try {
    void server.trackFunnelEvent(event, detail ?? null, getClientId()).catch(() => {})
  } catch {
    // Ignore — tracking is best-effort.
  }
}
