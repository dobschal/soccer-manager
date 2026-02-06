import { getGameDayAndSeason } from './gameDayHelper.js'
import { getTeam } from './teamHelper.js'
import { query } from '../lib/database.js'
import { LogMessage } from '../entities/logMessage.js'
import { t, getUserLocale } from '../i18n/index.js'

/**
 * @param {string} message
 * @param {TeamType} team
 * @param {string} [action]
 * @param {number} [actionValue]
 * @param {string} [icon] - Font Awesome icon name (e.g., 'trophy', 'money', 'user')
 * @returns {Promise<void>}
 */
export async function addLogMessage (message, team, action, actionValue, icon) {
  const { gameDay, season } = await getGameDayAndSeason()
  const data = {
    message,
    team_id: team.id,
    game_day: gameDay,
    season
  }
  if (action) {
    data.action = action
  }
  if (actionValue !== undefined && actionValue !== null) {
    data.action_value = actionValue
  }
  if (icon) {
    data.icon = icon
  }
  const logMessage = new LogMessage(data)
  await query('INSERT INTO log_message SET ?', logMessage)
}

/**
 * @param {number} pageIndex
 * @param {number} pageSize
 * @param {Request} [req]
 * @returns {Promise<Array<LogMessageType>>}
 */
export async function getLogMessages (pageIndex, pageSize, req) {
  const team = await getTeam(req)
  return await query('SELECT * FROM log_message WHERE team_id=? ORDER BY id DESC LIMIT ?, ?', [team.id, pageIndex * pageSize, pageSize])
}

/**
 * @param {Request} req
 * @returns {Promise<number>}
 */
export async function getLogMessageCount (req) {
  const team = await getTeam(req)
  const [result] = await query('SELECT COUNT(*) as count FROM log_message WHERE team_id=?', [team.id])
  return result.count
}

/**
 * @param {number} messageId
 * @param {Request} req
 * @returns {Promise<void>}
 */
export async function deleteLogMessage (messageId, req) {
  const team = await getTeam(req)
  await query('DELETE FROM log_message WHERE id=? AND team_id=?', [messageId, team.id])
}

/**
 * Checks a team for issues (incomplete lineup, low freshness) and adds log messages
 * @param {TeamType} team
 * @returns {Promise<void>}
 */
export async function checkTeamAndNotify (team) {
  // Only check teams with a user (not bots)
  if (!team.user_id) return

  const locale = await getUserLocale(team.user_id)
  const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
  const playersInLineup = players.filter(p => p.in_game_position)

  // Check for incomplete lineup
  if (playersInLineup.length < 11) {
    await addLogMessage(
      t('log.incompleteLineup', { count: playersInLineup.length }, locale),
      team,
      'OPEN_MY_TEAM_PAGE',
      null,
      'exclamation-triangle'
    )
  }

  // Check for low freshness players in lineup
  const tiredPlayers = playersInLineup.filter(p => p.freshness < 0.4)
  for (const player of tiredPlayers) {
    await addLogMessage(
      t('log.lowFreshness', { playerName: player.name, freshness: Math.floor(player.freshness * 100) }, locale),
      team,
      'OPEN_PLAYER',
      player.id,
      'exclamation-triangle'
    )
  }
}
