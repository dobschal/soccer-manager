import { query } from '../lib/database.js'

/**
 * @typedef {Object} FinanceLogEntry
 * @property {number} id
 * @property {number} season
 * @property {number} game_day
 * @property {number} value - Positive for income, negative for expenses
 * @property {number} balance - Team balance after this transaction
 * @property {number} team_id
 * @property {string} reason
 * @property {string} created_at - ISO date string
 */

export default {
  /**
   * @param {Request} req
   * @returns {Promise<{log: FinanceLogEntry[]}>}
   */
  async getFinanceLog (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const log = await query('SELECT * FROM finance_log WHERE team_id=?', [team.id])
    return { log }
  }
}
