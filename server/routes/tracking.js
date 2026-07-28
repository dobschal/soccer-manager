import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

/**
 * Ordered funnel steps we care about most (registration → active player). The
 * admin analysis reports distinct-client counts and drop-off along this path.
 * @type {string[]}
 */
const FUNNEL_PAGES = ['landing', 'login', 'register', 'choose-team', 'dashboard']

export default {

  /**
   * Record a page view. Public on purpose: pre-login funnel steps (landing,
   * login, register) have no authenticated user, so anonymous views are
   * correlated via the client-supplied `clientId`.
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
   * Admin-only page-view analytics over the last N days: per-page aggregates
   * plus a distinct-client funnel along FUNNEL_PAGES.
   * @param {number} [days=30] - Look-back window in days
   * @param {Request} req
   * @returns {Promise<{days: number, pages: Array, funnel: Array}>}
   */
  async getPageViewStats (days, req) {
    if (!req.user?.is_admin) {
      throw new BadRequestError('This action is only available for admins')
    }
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)))

    const pages = await query(
      `SELECT page,
              COUNT(*)                    AS views,
              COUNT(DISTINCT client_id)   AS clients,
              COUNT(DISTINCT user_id)     AS users
       FROM page_view
       WHERE created_at >= (NOW() - INTERVAL ? DAY)
       GROUP BY page
       ORDER BY views DESC`,
      [safeDays]
    )

    const pageMap = new Map(pages.map(p => [p.page, p]))
    const funnel = FUNNEL_PAGES.map(page => ({
      page,
      clients: Number(pageMap.get(page)?.clients ?? 0),
      views: Number(pageMap.get(page)?.views ?? 0)
    }))

    return { days: safeDays, pages, funnel }
  }

}
