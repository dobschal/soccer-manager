const CLIENT_ID_KEY = 'fm_client_id'

/**
 * Get (or lazily create) a stable anonymous client id stored in localStorage.
 * Lets us correlate pre-login funnel steps (landing → registration attempt →
 * account created) that have no authenticated user yet.
 *
 * Lives in its own module because both the tracking calls and the gateway need
 * it — the gateway sends it as `X-Client-Id` on every request so server-side
 * funnel events (registration/login outcomes) can be attributed to the same
 * anonymous visitor without threading the id through every route signature.
 * @returns {string|null} null when localStorage is unavailable (private mode)
 */
export function getClientId () {
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
