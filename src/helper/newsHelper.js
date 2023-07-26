import { getGameDayAndSeason } from './gameDayHelper.js'
import { query } from '../lib/database.js'
import { News } from '../entities/news.js'

/**
 * @param {string} message
 * @param {TeamType} team
 * @returns {Promise<void>}
 */
export async function addNews (message, team) {
  const { gameDay, season } = await getGameDayAndSeason()
  const news = new News({
    message,
    team_id: team.id,
    game_day: gameDay,
    season
  })
  await query('INSERT INTO news SET ?', news)
}
