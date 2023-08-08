import { shadeColor } from '../lib/shadeColor.js'

const hairColors = [
  '#6D526F',
  '#BC6D69',
  '#DD8C79',
  '#E09976',
  '#7F5562',
  '#4C466A',
  '#3E3155'
]

/**
 * @param {PlayerType} player
 * @param {TeamType} team
 * @param {number} size
 * @returns {Promise<string>}
 */
export async function renderPlayerImage (player, team, size = 224) {
  if (typeof player?.id === 'undefined') return ''
  console.log('Player hair: ', player.hair_color)
  const index = player.id % 18 + 1
  const imageUrl = `assets/players/soccer_player-${index}.svg`
  const rawResponse = await fetch(imageUrl)
  let svg = await rawResponse.text()
  svg = svg.replace('width="224"', `width="${size}"`)
  svg = svg.replaceAll('#FF0001', team.color)
  svg = svg.replaceAll('#0000FF', hairColors[player.hair_color])
  svg = svg.replaceAll('#CC0001', shadeColor(team.color, -30))
  svg = svg.replaceAll('#00FF00', shadeColor(team.color, -80))
  return `
    <div class="player-image">
        ${svg}
    </div>
  `
}
