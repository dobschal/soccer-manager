import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

/**
 * Collect a fresh snapshot of high level game statistics and persist it.
 * Bot teams (user_id IS NULL) are excluded from money/player aggregates so
 * the numbers reflect actual user activity.
 *
 * @returns {Promise<StatisticsRow>}
 */
export async function collectStatistics () {
  const { season } = await getGameDayAndSeason()

  const [{ daily_active_users: dailyActiveUsers }] = await query(
    'SELECT COUNT(*) AS daily_active_users FROM user WHERE last_login > NOW() - INTERVAL 1 DAY'
  )

  const [{ monthly_active_users: monthlyActiveUsers }] = await query(
    'SELECT COUNT(*) AS monthly_active_users FROM user WHERE last_login > NOW() - INTERVAL 30 DAY'
  )

  const [{ total_user_count: totalUserCount }] = await query(
    'SELECT COUNT(*) AS total_user_count FROM user'
  )

  const [{ in_game_money: inGameMoney }] = await query(
    'SELECT COALESCE(SUM(balance), 0) AS in_game_money FROM team WHERE user_id IS NOT NULL'
  )

  const [{ player_count: playerCount, avg_player_level: avgPlayerLevel, avg_player_age: avgPlayerAge }] = await query(
    `SELECT COUNT(*) AS player_count,
            COALESCE(AVG(p.level), 0) AS avg_player_level,
            COALESCE(AVG(? - p.carrier_start_season + 16), 0) AS avg_player_age
     FROM player p
     JOIN team t ON t.id = p.team_id
     WHERE t.user_id IS NOT NULL`,
    [season]
  )

  const [{ action_card_count: actionCardCount }] = await query(
    `SELECT COUNT(*) AS action_card_count
     FROM action_card ac
     JOIN team t ON t.id = ac.team_id
     WHERE t.user_id IS NOT NULL AND ac.played = 0`
  )

  const row = {
    daily_active_users: Number(dailyActiveUsers) || 0,
    monthly_active_users: Number(monthlyActiveUsers) || 0,
    total_user_count: Number(totalUserCount) || 0,
    in_game_money: Number(inGameMoney) || 0,
    player_count: Number(playerCount) || 0,
    avg_player_level: Number(Number(avgPlayerLevel).toFixed(2)) || 0,
    avg_player_age: Number(Number(avgPlayerAge).toFixed(2)) || 0,
    action_card_count: Number(actionCardCount) || 0
  }

  const result = await query('INSERT INTO statistics SET ?', row)
  return { id: result.insertId, ...row }
}

/**
 * Read paginated statistics rows ordered by the most recent first.
 *
 * @param {object} [options]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @returns {Promise<{ rows: Array<StatisticsRow>, total: number }>}
 */
export async function getStatistics ({ limit = 30, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 30)))
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0))

  const rows = await query(
    `SELECT id, daily_active_users, monthly_active_users, total_user_count,
            in_game_money, player_count, avg_player_level, avg_player_age,
            action_card_count, created_at
     FROM statistics
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [safeLimit, safeOffset]
  )

  const [{ total }] = await query('SELECT COUNT(*) AS total FROM statistics')
  return { rows, total: Number(total) || 0 }
}
