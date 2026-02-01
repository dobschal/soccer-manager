import { getGameDayAndSeason } from './gameDayHelper.js'
import { PlayerHistory } from '../entities/playerHistory.js'
import { query } from '../lib/database.js'

/**
 * @param {number} playerId
 * @param {string} type
 * @param {string|number} value
 * @returns {Promise<void>}
 */
export async function addPlayerHistory (playerId, type, value) {
  if (typeof value === 'number') {
    value = value + ''
  }
  const { season, gameDay } = await getGameDayAndSeason()
  const playerHistory = new PlayerHistory({
    season,
    game_day: gameDay,
    player_id: playerId,
    type,
    value
  })
  await query('INSERT INTO player_history SET ?', playerHistory)
}
