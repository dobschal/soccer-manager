import { showOverlay } from './overlay.js'

/**
 * @param {PlayerType} player
 * @returns {Promise<void>}
 */
export async function showPlayerModal (player) {
  showOverlay(
    player.name,
    `Position: ${player.position}`,
    '<button class="btn btn-success">Make Buy Offer</button>'
  )
}
