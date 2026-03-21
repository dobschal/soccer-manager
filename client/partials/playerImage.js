import { shadeColor } from '../lib/shadeColor.js'
import { renderEmblem } from './emblem.js'

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

// Grey color for free agents without a team
const FREE_AGENT_COLOR = '#808080'

/**
 * @param {PlayerType} player
 * @param {TeamType|null} team - Pass null for free agents to render grey shirt without emblem
 * @param {number} size
 * @param {Object} [options]
 * @param {boolean} [options.isCaptain] - Show captain badge
 * @returns {Promise<string>}
 */
export async function renderPlayerImage (player, team, size = 224, options = {}) {
  if (typeof player?.id === 'undefined') return ''
  const index = player.id % 18 + 1
  const imageUrl = `assets/players/soccer_player-${index}.svg`
  const rawResponse = await fetch(imageUrl)
  let svg = await rawResponse.text()
  const height = Math.floor(size * (234 / 224)) // Maintain aspect ratio (default: 224x234)
  svg = svg.replace('width="224"', `width="${size}"`)
  svg = svg.replace('height="234"', `height="${height}"`)

  // Use team color or grey for free agents
  const shirtColor = team?.color ?? FREE_AGENT_COLOR
  svg = svg.replaceAll('#FF0001', shirtColor)
  svg = svg.replaceAll('#0000FF', hairColors[player.hair_color])
  svg = svg.replaceAll('#CC0001', shadeColor(shirtColor, -30))
  svg = svg.replaceAll('#00FF00', shadeColor(shirtColor, -80))
  for (const skinColor of skinColors) {
    svg = svg.replaceAll(skinColor[0], skinColors[player.skin_color][0])
    svg = svg.replaceAll(skinColor[1], skinColors[player.skin_color][1])
  }

  // Calculate emblem size relative to player image, use percentage positioning for consistency
  const emblemSize = Math.floor(size * 0.11)

  // Only render emblem if player has a team
  const emblemHtml = team
    ? `<div class="emblem-wrapper" style="width: ${emblemSize}px; height: ${emblemSize}px; left: 56%; top: 64%;">
            ${renderEmblem(team, emblemSize)}
        </div>`
    : ''

  const captainBadgeHtml = options.isCaptain
    ? `<div class="captain-badge" style="font-size: ${Math.max(10, Math.floor(size * 0.08))}px;">
        <div class="captain-badge__star">&#9733;</div>
        <div class="captain-badge__label" style="font-size: ${Math.max(8, Math.floor(size * 0.06))}px;">Captain</div>
      </div>`
    : ''

  return `
    <div class="player-image" style="width: ${size}px; height: ${height}px;">
        ${svg}
        ${emblemHtml}
        ${captainBadgeHtml}
    </div>
  `
}
