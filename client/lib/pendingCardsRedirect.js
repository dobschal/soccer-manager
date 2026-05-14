import { server } from './gateway.js'

/**
 * Detect whether the user has unclaimed action cards from a new game day
 * and, if so, navigate to the dashboard (and optionally reload) so the
 * card-claim overlay is shown. Pending cards are the authoritative signal
 * that a new game day was calculated since the user last opened the
 * dashboard — they're created during game-day calculation and cleared on
 * the next tick.
 *
 * Using pending cards (server state) instead of comparing in-memory
 * game-day counters means we still detect the change even when iOS
 * recycles the WebView's JavaScript context while the app was suspended.
 *
 * @param {{ reload?: boolean }} [options]
 * @param {boolean} [options.reload=true] When false, only navigate via hash
 *   and skip `window.location.reload()`. Cold-start callers must pass
 *   `reload: false` — at that point the page hasn't rendered yet, so
 *   reloading would just re-run this check and trigger an infinite reload
 *   loop until the next game-day tick clears the pending cards.
 * @returns {Promise<boolean>} true if a redirect (and possibly reload) was triggered
 */
export async function redirectIfPendingActionCards ({ reload = true } = {}) {
  if (!window.localStorage.getItem('auth-token')) return false
  let response
  try {
    response = await server.getPendingActionCards()
  } catch {
    return false
  }
  if (!response?.pendingCards?.length) return false

  const currentPath = (window.location.hash || '').substring(1).split('?')[0]
  const onDashboard = currentPath === 'dashboard' || currentPath === ''
  if (!onDashboard) {
    window.location.hash = '#dashboard'
  }
  if (reload) {
    window.location.reload()
  }
  return true
}
