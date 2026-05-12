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

/**
 * Number of cron ticks from the imminent tick until `targetGameDay` is played.
 *
 * The cron always picks the lowest unplayed `game_day` for the next tick, so the
 * wait-time is the ordinal position of `targetGameDay` in the sorted distinct
 * list of unplayed game days — NOT `targetGameDay - currentGameDay`. The naïve
 * subtraction overshoots when earlier game days have already been played but a
 * still-unplayed game day (e.g. a stuck cup round) keeps `currentGameDay` low.
 *
 * @param {number} season
 * @param {number} targetGameDay
 * @returns {Promise<number>} 0 = plays at the next imminent tick
 */
export async function getTicksUntilGameDay (season, targetGameDay) {
  const rows = await query(
    'SELECT DISTINCT game_day FROM game WHERE played=0 AND season=? AND game_day<=? ORDER BY game_day ASC',
    [season, targetGameDay]
  )
  if (rows.length === 0) return 0
  const idx = rows.findIndex(r => r.game_day === targetGameDay)
  return idx < 0 ? 0 : idx
}
