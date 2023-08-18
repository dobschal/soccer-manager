import { shadeColor } from '../lib/shadeColor.js'

// first is the real skin color, second is the shade
const skinColors = [
  ['#FCD1C8', '#F9A8A1'],
  ['#DD8C79', '#BC6D69'],
  ['#E2AD94', '#CB8A79']
]

const hairColors = [
  '#6D526F',
  '#BC6D68',
  '#DE8C79',
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
  const index = player.id % 18 + 1
  const imageUrl = `assets/players/soccer_player-${index}.svg`
  const rawResponse = await fetch(imageUrl)
  let svg = await rawResponse.text()
  svg = svg.replace('width="224"', `width="${size}"`)
  svg = svg.replaceAll('#FF0001', team.color)
  svg = svg.replaceAll('#0000FF', hairColors[player.hair_color])
  svg = svg.replaceAll('#CC0001', shadeColor(team.color, -30))
  svg = svg.replaceAll('#00FF00', shadeColor(team.color, -80))
  for (const skinColor of skinColors) {
    svg = svg.replaceAll(skinColor[0], skinColors[player.skin_color][0])
    svg = svg.replaceAll(skinColor[1], skinColors[player.skin_color][1])
  }
  return `
    <div class="player-image">
        ${svg}
    </div>
  `
}
