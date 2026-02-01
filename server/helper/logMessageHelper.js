import { getGameDayAndSeason } from './gameDayHelper.js'
import { getTeam } from './teamHelper.js'
import { query } from '../lib/database.js'
import { LogMessage } from '../entities/logMessage.js'

/**
 * @param {string} message
 * @param {TeamType} team
 * @returns {Promise<void>}
 */
export async function addLogMessage (message, team) {
  const { gameDay, season } = await getGameDayAndSeason()
  const logMessage = new LogMessage({
    message,
    team_id: team.id,
    game_day: gameDay,
    season
  })
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
