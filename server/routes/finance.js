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
 * @property {number | null} match_day - Displayed 1-based match day; null on
 *   days without a played league/cup game.
 * @property {'league' | 'cup' | null} match_day_kind
 */

/**
 * SQL subqueries that resolve the user-facing match_day for a given
 * (season, game_day). League is preferred over cup since both are
 * exposed but the user-facing label "Spieltag" usually refers to the
 * league round.
 */
const MATCH_DAY_SUBQUERY = `
  COALESCE(
    (SELECT g.match_day FROM game g
       WHERE g.season=fl.season AND g.game_day=fl.game_day
         AND (g.game_type='league' OR g.game_type IS NULL)
         AND g.match_day IS NOT NULL
       LIMIT 1),
    (SELECT g.match_day FROM game g
       WHERE g.season=fl.season AND g.game_day=fl.game_day
         AND g.game_type='cup' AND g.match_day IS NOT NULL
       LIMIT 1)
  ) AS match_day,
  CASE
    WHEN EXISTS (SELECT 1 FROM game g
                  WHERE g.season=fl.season AND g.game_day=fl.game_day
                    AND (g.game_type='league' OR g.game_type IS NULL)
                    AND g.match_day IS NOT NULL) THEN 'league'
    WHEN EXISTS (SELECT 1 FROM game g
                  WHERE g.season=fl.season AND g.game_day=fl.game_day
                    AND g.game_type='cup' AND g.match_day IS NOT NULL) THEN 'cup'
    ELSE NULL
  END AS match_day_kind
`

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

    let sql = `SELECT fl.*, ${MATCH_DAY_SUBQUERY} FROM finance_log fl WHERE fl.team_id=?`
    const params = [team.id]

    // Add from filter if provided
    if (typeof fromSeason === 'number' && typeof fromGameDay === 'number') {
      sql += ' AND (fl.season > ? OR (fl.season = ? AND fl.game_day >= ?))'
      params.push(fromSeason, fromSeason, fromGameDay)
    }

    // Add to filter if provided
    if (typeof toSeason === 'number' && typeof toGameDay === 'number') {
      sql += ' AND (fl.season < ? OR (fl.season = ? AND fl.game_day <= ?))'
      params.push(toSeason, toSeason, toGameDay)
    }

    const log = await query(sql, params)
    return { log }
  },

  /**
   * Get the bounds (min/max season and gameday) for the team's finance log,
   * plus a lookup of `match_day` for every (season, game_day) inside that
   * range so the frontend can render the user-facing "Spieltag X" labels
   * instead of the internal `game_day + 1` counter.
   *
   * @param {Request} req
   * @returns {Promise<{
   *   minSeason: number,
   *   minGameDay: number,
   *   maxSeason: number,
   *   maxGameDay: number,
   *   gameDayLabels: Array<{season: number, game_day: number, match_day: number | null, kind: 'league'|'cup'|null}>
   * }>}
   */
  async getFinanceLogBounds (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
    const { season: currentSeason, gameDay: currentGameDay } = await getGameDayAndSeason()

    // Get oldest entry
    const [oldest] = await query(
      'SELECT season, game_day FROM finance_log WHERE team_id=? ORDER BY season ASC, game_day ASC LIMIT 1',
      [team.id]
    )

    const minSeason = oldest?.season ?? currentSeason
    const minGameDay = oldest?.game_day ?? currentGameDay
    const maxSeason = currentSeason
    const maxGameDay = currentGameDay

    // Resolve match_day for every (season, game_day) in [min, max] so the
    // filter dropdown can render user-facing labels.
    const gameDayLabels = await query(
      `SELECT season, game_day,
              MAX(CASE WHEN game_type='league' OR game_type IS NULL THEN match_day END) AS league_match_day,
              MAX(CASE WHEN game_type='cup' THEN match_day END) AS cup_match_day
         FROM game
        WHERE match_day IS NOT NULL
          AND ((season > ? OR (season = ? AND game_day >= ?))
               AND (season < ? OR (season = ? AND game_day <= ?)))
        GROUP BY season, game_day
        ORDER BY season ASC, game_day ASC`,
      [minSeason, minSeason, minGameDay, maxSeason, maxSeason, maxGameDay]
    )

    return {
      minSeason,
      minGameDay,
      maxSeason,
      maxGameDay,
      gameDayLabels: gameDayLabels.map(row => ({
        season: row.season,
        game_day: row.game_day,
        match_day: row.league_match_day ?? row.cup_match_day ?? null,
        kind: row.league_match_day != null ? 'league' : (row.cup_match_day != null ? 'cup' : null)
      }))
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
