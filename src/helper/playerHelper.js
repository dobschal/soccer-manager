import { query } from '../lib/database.js'

/**
 * @param {number} id
 * @returns {Promise<PlayerType>}
 */
export async function getPlayerById (id) {
  const [player] = await query('SELECT * FROM player WHERE id=? LIMIT 1', [id])
  return player
}
