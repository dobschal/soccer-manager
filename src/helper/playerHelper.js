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

/**
 * A player at level 10 in age 22 is 50mio
 * for every age above you take the amount times 0.75
 * for every level less, the same
 * @param {PlayerType} player
 * @returns {Promise<number>} - price in EUR
 */
export async function getAveragePlanPriceOfPlayer (player) {
  const age = await getPlayerAge(player)
  let price = 50_000_000
  for (let a = 22; a < age; a++) {
    price *= 0.75
  }
  for (let l = 10; l > player.level; l--) {
    price *= 0.5
  }
  return Math.floor(price)
}

/**
 * @param {number} teamId
 * @returns {Promise<Array<PlayerType>>}
 */
export async function getPlayersByTeamId (teamId) {
  return await query('SELECT * FROM player WHERE team_id=?', [teamId])
}
