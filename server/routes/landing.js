import { query } from '../lib/database.js'

/**
 * Public: lightweight game-wide stats for the landing page (#455). No auth
 * required — the landing page is shown pre-login. Bot teams are excluded from
 * the user count; the showcased team is a real, user-owned club with an emblem.
 *
 * @returns {Promise<{totalUsers: number, newUsers: number, team: object|null}>}
 */
export default {
  async getLandingStats () {
    const [{ total_users: totalUsers }] = await query(
      'SELECT COUNT(*) AS total_users FROM user'
    )
    const [{ new_users: newUsers }] = await query(
      'SELECT COUNT(*) AS new_users FROM user WHERE created_at > NOW() - INTERVAL 21 DAY'
    )
    // Prefer a real user's club with a designed emblem; fall back to any team.
    let teamRows = await query(
      `SELECT id, name, short_name, emblem, color, level, league
       FROM team
       WHERE user_id IS NOT NULL AND emblem IS NOT NULL AND is_system_team = 0
       ORDER BY RAND() LIMIT 1`
    )
    if (teamRows.length === 0) {
      teamRows = await query(
        `SELECT id, name, short_name, emblem, color, level, league
         FROM team
         WHERE emblem IS NOT NULL AND is_system_team = 0
         ORDER BY RAND() LIMIT 1`
      )
    }
    return {
      totalUsers: Number(totalUsers) || 0,
      newUsers: Number(newUsers) || 0,
      team: teamRows[0] || null
    }
  }
}
