import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { FUNNEL_STEPS, recordFunnelEvent } from '../helper/funnelHelper.js'

export default {

  /**
   * Record a page view. Public on purpose: pre-login funnel steps (landing,
   * login) have no authenticated user, so anonymous views are correlated via
   * the client-supplied `clientId`.
   * @param {string} page - Route/page key (e.g. 'dashboard')
   * @param {string} [clientId] - Stable anonymous client id from localStorage
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async trackPageView (page, clientId, req) {
    if (typeof page !== 'string' || page.length === 0) {
      return { success: false }
    }
    const userId = req.user?.id ?? null
    const safeClientId = (typeof clientId === 'string' && clientId.length > 0)
      ? clientId.slice(0, 64)
      : null
    const safePage = page.slice(0, 255)
    await query(
      'INSERT INTO page_view (user_id, client_id, page) VALUES (?, ?, ?)',
      [userId, safeClientId, safePage]
    )
    return { success: true }
  },

  /**
   * Record a funnel event from the client. Public for the same reason as
   * `trackPageView` — the interesting events happen before login.
   *
   * Only steps the server cannot observe itself belong here (an attempt that
   * client-side validation rejected never reaches `createAccount`). Everything
   * that does reach a route is recorded server-side, where the rejection
   * reason is actually known.
   * @param {string} event - Event key (e.g. 'register-abort')
   * @param {string} [detail] - Optional reason (e.g. 'email-invalid')
   * @param {string} [clientId] - Stable anonymous client id from localStorage
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async trackFunnelEvent (event, detail, clientId, req) {
    if (typeof event !== 'string' || event.length === 0) {
      return { success: false }
    }
    // The gateway also sends the id as `X-Client-Id`; the explicit parameter
    // wins so this route keeps working if a client ever calls it directly.
    await recordFunnelEvent(event, detail, req, { clientId })
    return { success: true }
  },

  /**
   * Admin-only funnel + page-view analytics over the last N days.
   *
   * `funnel` walks FUNNEL_STEPS in order, counting distinct visitors per step
   * and the drop-off from the previous one. Steps come from two sources:
   * page views for actual routes, funnel events for the registration attempt
   * and its outcome (there is no `register` route — registration is a mode of
   * the landing form, so it can only be observed as an event).
   *
   * `registrationErrors` breaks the rejected attempts down by reason, which is
   * what tells you whether visitors bounce without trying or fail on a
   * specific validation rule. It covers both server-side rejections
   * (`register-error`) and attempts client-side validation stopped before they
   * ever reached a route (`register-abort`).
   * @param {number} [days=30] - Look-back window in days
   * @param {Request} req
   * @returns {Promise<{days: number, pages: Array, funnel: Array, registrationErrors: Array, loginErrors: Array}>}
   */
  async getPageViewStats (days, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)))

    const [pages, events, registrationErrors, loginErrors] = await Promise.all([
      query(
        `SELECT page,
                COUNT(*)                    AS views,
                COUNT(DISTINCT client_id)   AS clients,
                COUNT(DISTINCT user_id)     AS users
         FROM page_view
         WHERE created_at >= (NOW() - INTERVAL ? DAY)
         GROUP BY page
         ORDER BY views DESC`,
        [safeDays]
      ),
      query(
        `SELECT event,
                COUNT(*)                    AS views,
                COUNT(DISTINCT client_id)   AS clients
         FROM funnel_event
         WHERE created_at >= (NOW() - INTERVAL ? DAY)
         GROUP BY event`,
        [safeDays]
      ),
      query(
        `SELECT COALESCE(detail, 'unknown') AS reason,
                COUNT(*)                    AS count,
                COUNT(DISTINCT client_id)   AS clients
         FROM funnel_event
         WHERE event IN ('register-error', 'register-abort')
           AND created_at >= (NOW() - INTERVAL ? DAY)
         GROUP BY reason
         ORDER BY count DESC`,
        [safeDays]
      ),
      query(
        `SELECT COALESCE(detail, 'unknown') AS reason,
                COUNT(*)                    AS count,
                COUNT(DISTINCT client_id)   AS clients
         FROM funnel_event
         WHERE event = 'login-error'
           AND created_at >= (NOW() - INTERVAL ? DAY)
         GROUP BY reason
         ORDER BY count DESC`,
        [safeDays]
      )
    ])

    const pageMap = new Map(pages.map(p => [p.page, p]))
    const eventMap = new Map(events.map(e => [e.event, e]))
    let previous = null
    const funnel = FUNNEL_STEPS.map(({ key, source }) => {
      const row = source === 'page' ? pageMap.get(key) : eventMap.get(key)
      const clients = Number(row?.clients ?? 0)
      // Drop-off is measured against the previous step, not the first one:
      // that is what points at the single worst transition.
      const dropOff = previous === null || previous === 0
        ? 0
        : Math.max(0, previous - clients)
      const step = {
        key,
        source,
        clients,
        views: Number(row?.views ?? 0),
        dropOff,
        dropOffPercent: previous ? Math.round((dropOff / previous) * 100) : 0
      }
      previous = clients
      return step
    })

    return { days: safeDays, pages, funnel, registrationErrors, loginErrors }
  }

}
