import { query } from '../lib/database.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

/**
 * @param {number} id
 * @returns {Promise<PlayerType>}
 */
export async function getPlayerById (id) {
  const [player] = await query('SELECT * FROM player WHERE id=? LIMIT 1', [id])
  return player
}

/**
 * @param {PlayerType} player
 * @param {number} [season]
 * @returns {Promise<number>}
 */
export async function getPlayerAge (player, season) {
  if (typeof season === 'undefined') {
    const r = await getGameDayAndSeason()
    season = r.season
  }
  return season - player.carrier_start_season + 16
}
