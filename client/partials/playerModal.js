import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { calculatePlayerAge, sallaryPerLevel } from '../util/player.js'
import { euroFormat } from '../util/currency.js'

/**
 * @param {PlayerType} player
 * @returns {Promise<void>}
 */
export async function showPlayerModal (player) {
  const { season } = await server.getCurrentGameday()
  showOverlay(
    player.name,
    `Position: ${player.position}`,
    `
      <b>Age</b>: ${calculatePlayerAge(player, season)}<br>
      <b>Level</b>: ${player.level}<br>
      <b>Sallary</b>: ${euroFormat.format(sallaryPerLevel[player.level])}
    `
  )
}
