import { getGameDayAndSeason } from './gameDayHelper.js'
import { getTeam } from './teamHelper.js'
import { query } from '../lib/database.js'
import { LogMessage } from '../entities/logMessage.js'
import { t, getUserLocale } from '../i18n/index.js'
import { sendToUser } from '../lib/websocket.js'

/**
 * @param {string} message
 * @param {TeamType} team
 * @param {string} [action]
 * @param {number} [actionValue]
 * @param {string} [icon] - Font Awesome icon name (e.g., 'trophy', 'money', 'user')
 * @param {string} [event] - WebSocket event to send to the user (e.g., 'NEW_LOG_MESSAGE')
 * @returns {Promise<void>}
 */
export async function addLogMessage (message, team, action, actionValue, icon, event) {
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

  // Send WebSocket event if specified and team has a user
  if (event && team.user_id) {
    sendToUser(team.user_id, event, { message, action, actionValue, icon })
  }
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
 * Checks a team for issues (incomplete lineup, low freshness, suspended players) and adds log messages
 * @param {TeamType} team
 * @returns {Promise<void>}
 */
export async function checkTeamAndNotify (team) {
  // Only check teams with a user (not bots)
  if (!team.user_id) return

  const locale = await getUserLocale(team.user_id)
  const players = await query('SELECT * FROM player WHERE team_id=?', [team.id])
  const playersInLineup = players.filter(p => p.in_game_position)

  // Check for suspended players in lineup and remove them
  const suspendedInLineup = playersInLineup.filter(p => p.is_suspended)
  for (const player of suspendedInLineup) {
    // Remove from lineup
    await query('UPDATE player SET in_game_position=\'\' WHERE id=?', [player.id])
    await addLogMessage(
      t('log.playerRemovedFromLineup', { playerName: player.name }, locale),
      team,
      'OPEN_MY_TEAM_PAGE',
      null,
      'ban'
    )
  }

  // Re-check lineup count after removing suspended players
  const availablePlayersInLineup = playersInLineup.filter(p => !p.is_suspended)

  // Check for incomplete lineup
  if (availablePlayersInLineup.length < 11) {
    await addLogMessage(
      t('log.incompleteLineup', { count: availablePlayersInLineup.length }, locale),
      team,
      'OPEN_MY_TEAM_PAGE',
      null,
      'exclamation-triangle'
    )
  }

  // Check for low freshness players in lineup
  const tiredPlayers = availablePlayersInLineup.filter(p => p.freshness < 0.4)
  for (const player of tiredPlayers) {
    await addLogMessage(
      t('log.lowFreshness', { playerName: player.name, freshness: Math.floor(player.freshness * 100) }, locale),
      team,
      'OPEN_PLAYER',
      player.id,
      'exclamation-triangle'
    )
  }

  // Warn about players close to 5 yellow card suspension
  const playersAt4Yellows = players.filter(p => p.yellow_cards === 4)
  for (const player of playersAt4Yellows) {
    await addLogMessage(
      t('log.playerAt4Yellows', { playerName: player.name }, locale),
      team,
      'OPEN_PLAYER',
      player.id,
      'exclamation-triangle'
    )
  }
}

/**
 * Get count of new log messages since a given message ID
 * @param {number} lastSeenId - The ID of the last seen message
 * @param {Request} req
 * @returns {Promise<number>}
 */
export async function getNewLogMessageCount (lastSeenId, req) {
  const team = await getTeam(req)
  const [result] = await query(
    'SELECT COUNT(*) as count FROM log_message WHERE team_id=? AND id > ?',
    [team.id, lastSeenId || 0]
  )
  return result.count
}

/**
 * Delete log messages older than 7 days
 * @returns {Promise<{deleted: number}>}
 */
export async function cleanupOldLogMessages () {
  const result = await query('DELETE FROM log_message WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)')
  const deleted = result.affectedRows || 0
  if (deleted > 0) {
    console.log(`🧹 Cleaned up ${deleted} old log messages`)
  }
  return { deleted }
}
