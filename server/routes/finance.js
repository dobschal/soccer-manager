import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getEstimatedTvMoney } from '../helper/tvMoneyHelper.js'

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
   * Get finance log with optional filtering by season/gameday range
   * @param {number} [fromSeason]
   * @param {number} [fromGameDay]
   * @param {number} [toSeason]
   * @param {number} [toGameDay]
   * @param {Request} req
   * @returns {Promise<{log: FinanceLogEntry[]}>}
   */
  async getFinanceLog (fromSeason, fromGameDay, toSeason, toGameDay, req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])

    let sql = 'SELECT * FROM finance_log WHERE team_id=?'
    const params = [team.id]

    // Add from filter if provided
    if (typeof fromSeason === 'number' && typeof fromGameDay === 'number') {
      sql += ' AND (season > ? OR (season = ? AND game_day >= ?))'
      params.push(fromSeason, fromSeason, fromGameDay)
    }

    // Add to filter if provided
    if (typeof toSeason === 'number' && typeof toGameDay === 'number') {
      sql += ' AND (season < ? OR (season = ? AND game_day <= ?))'
      params.push(toSeason, toSeason, toGameDay)
    }

    const log = await query(sql, params)
    return { log }
  },

  /**
   * Get the bounds (min/max season and gameday) for the team's finance log
   * @param {Request} req
   * @returns {Promise<{minSeason: number, minGameDay: number, maxSeason: number, maxGameDay: number}>}
   */
  async getFinanceLogBounds (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const { season: currentSeason, gameDay: currentGameDay } = await getGameDayAndSeason()

    // Get oldest entry
    const [oldest] = await query(
      'SELECT season, game_day FROM finance_log WHERE team_id=? ORDER BY season ASC, game_day ASC LIMIT 1',
      [team.id]
    )

    return {
      minSeason: oldest?.season ?? currentSeason,
      minGameDay: oldest?.game_day ?? currentGameDay,
      maxSeason: currentSeason,
      maxGameDay: currentGameDay
    }
  },

  /**
   * Estimated TV money payout for the user's team at the end of the current
   * season, based on the team's current standing in its league.
   * @param {Request} req
   * @returns {Promise<{base: number, level: number, rank: number | null, totalTeams: number, estimatedValue: number}>}
   */
  async getEstimatedTvMoney (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const { season } = await getGameDayAndSeason()
    return getEstimatedTvMoney(team, season)
  }
}
