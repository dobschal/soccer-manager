/**
 * @param {PlayerType} player
 * @returns {string}
 */
export function renderPlayerImage (player) {
  const index = player.id % 11 + 1
  const imageUrl = `assets/players/soccer_player-${index}.svg`
  return `
    <div class="player-image"  style="background-image: url('${imageUrl}')"></div>
  `
}
