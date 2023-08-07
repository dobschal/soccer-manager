import { query } from '../lib/database.js'

/**
 * @returns {Promise<{season: number, gameDay: number}>}
 */
export async function getGameDayAndSeason () {
  let results = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
  if (results.length === 0) {
    results = await query('SELECT * FROM game WHERE played=1 ORDER BY season DESC, game_day DESC LIMIT 1')
  }
  if (results.length === 0) {
    return { gameDay: 0, season: 0 }
  }
  const { game_day: gameDay, season } = results[0]
  return { gameDay: gameDay ?? 0, season: season ?? 0 }
}
