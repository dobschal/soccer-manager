import { query } from '../lib/database.js'

/**
 * Ordered registration funnel. Each step is either a tracked page view
 * (`source: 'page'`, keyed by the router path) or a funnel event
 * (`source: 'event'`).
 *
 * The landing page is served by the `login` route (`client/app.js` maps
 * `login: [DefaultLayout, LandingPage]`), so its page key is `login` — there
 * is no `landing` route and never was. Likewise there is no `register` route:
 * registration is a mode of the landing form, which is why the attempt has to
 * be recorded as an event rather than a page view.
 * @type {Array<{key: string, source: 'page'|'event'}>}
 */
export const FUNNEL_STEPS = [
  { key: 'login', source: 'page' },
  { key: 'register-attempt', source: 'event' },
  { key: 'register-success', source: 'event' },
  { key: 'choose-team', source: 'page' },
  { key: 'dashboard', source: 'page' }
]

/** Max length of the `event` / `detail` columns. */
const EVENT_MAX_LENGTH = 64

/**
 * Read the anonymous visitor id the client sends as `X-Client-Id` on every
 * gateway request. Lets pre-login routes attribute their funnel events to the
 * same visitor that viewed the landing page.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getClientIdFromRequest (req) {
  const raw = req?.headers?.['x-client-id']
  if (typeof raw !== 'string' || raw.length === 0) return null
  return raw.slice(0, EVENT_MAX_LENGTH)
}

/**
 * Record a funnel event. Best-effort by design: analytics must never break
 * registration or login, so a failing insert is logged and swallowed rather
 * than propagated to the caller.
 * @param {string} event - Event key (e.g. 'register-attempt')
 * @param {string|null} detail - Optional reason (e.g. 'username-taken')
 * @param {import('express').Request} req
 * @param {object} [overrides]
 * @param {number|null} [overrides.userId] - Explicit user id for events that
 *   create or authenticate a user, where `req.user` is not populated yet
 * @param {string|null} [overrides.clientId] - Explicit client id, for the
 *   public route where the client passes it as a parameter
 * @returns {Promise<void>}
 */
export async function recordFunnelEvent (event, detail, req, { userId = null, clientId = null } = {}) {
  if (typeof event !== 'string' || event.length === 0) return
  const resolvedClientId = (typeof clientId === 'string' && clientId.length > 0)
    ? clientId.slice(0, EVENT_MAX_LENGTH)
    : getClientIdFromRequest(req)
  try {
    await query(
      'INSERT INTO funnel_event (user_id, client_id, event, detail) VALUES (?, ?, ?, ?)',
      [
        userId ?? req?.user?.id ?? null,
        resolvedClientId,
        event.slice(0, EVENT_MAX_LENGTH),
        typeof detail === 'string' && detail.length > 0 ? detail.slice(0, EVENT_MAX_LENGTH) : null
      ]
    )
  } catch (e) {
    console.error(`[Funnel] Failed to record "${event}":`, e.message)
  }
}
