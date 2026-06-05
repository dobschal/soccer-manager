const STORAGE_KEY = 'device-uuid'

/**
 * Build a persistent device UUID. Stored in localStorage so subsequent logins
 * from the same browser/profile reuse the same id — the admin "suspicious
 * activity" page can then flag two accounts whose logins both touched this
 * device id.
 *
 * Falls back to a timestamp+random string when crypto.randomUUID is missing
 * (older WebView contexts).
 * @returns {string}
 */
export function getDeviceUuid () {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing
  } catch {
    return ''
  }
  let uuid
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID()
  } else {
    uuid = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, uuid)
  } catch {
    // ignore — we'll just regenerate on the next call
  }
  return uuid
}
