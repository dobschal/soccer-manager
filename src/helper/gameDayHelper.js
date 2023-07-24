import { query } from '../lib/database.js'

/**
 * @returns {Promise<{season: number, gameDay: number}>}
 */
export async function getGameDayAndSeason () {
  const [{ game_day: gameDay, season }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
  return { gameDay: gameDay ?? 0, season: season ?? 0 }
}
