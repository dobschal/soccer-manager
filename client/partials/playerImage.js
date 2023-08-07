import { shadeColor } from '../lib/shadeColor.js'

/**
 * @param {PlayerType} player
 * @param {TeamType} team
 * @returns {Promise<string>}
 */
export async function renderPlayerImage (player, team) {
  const index = player.id % 18 + 1
  const imageUrl = `assets/players/soccer_player-${index}.svg`
  const rawResponse = await fetch(imageUrl)
  let svg = await rawResponse.text()
  svg = svg.replaceAll('#FF0001', team.color)
  svg = svg.replaceAll('#CC0001', shadeColor(team.color, -30))
  svg = svg.replaceAll('#00FF00', shadeColor(team.color, -80))
  return `
    <div class="player-image">
        ${svg}
    </div>
  `
}
