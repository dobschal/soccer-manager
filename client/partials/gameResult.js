import { renderEmblem } from './emblem.js'

/**
 * Renders a responsive emblem that shows 60px on small screens and 120px on larger screens
 * @param {Object} team - Team object with emblem data
 * @returns {string}
 */
function renderResponsiveEmblem (team) {
  if (!team) return ''
  return `
    <span class="d-md-none">${renderEmblem(team, 60)}</span>
    <span class="d-none d-md-inline">${renderEmblem(team, 120)}</span>
  `
}

/**
 * Renders a game result/match card with two teams and center content
 * @param {Object} options
 * @param {Object} options.team1 - Team 1 object (for emblem)
 * @param {Object} options.team2 - Team 2 object (for emblem)
 * @param {string} options.team1Name - Team 1 display name
 * @param {string} options.team2Name - Team 2 display name
 * @param {boolean} options.isTeam1Highlighted - Whether to highlight team 1 (usually home team)
 * @param {string} options.centerContent - HTML content for the center column
 * @param {string} [options.href] - Optional link URL
 * @returns {string}
 */
export function renderGameResult ({
  team1,
  team2,
  team1Name,
  team2Name,
  isTeam1Highlighted,
  centerContent,
  href
}) {
  const content = `
    <div class="col text-center ${isTeam1Highlighted ? 'font-weight-bold' : ''}">
      <div class="mb-2">${renderResponsiveEmblem(team1)}</div>
      <h6 class="mb-0">${team1Name}</h6>
    </div>
    <div class="col-auto text-center">
      ${centerContent}
    </div>
    <div class="col text-center ${!isTeam1Highlighted ? 'font-weight-bold' : ''}">
      <div class="mb-2">${renderResponsiveEmblem(team2)}</div>
      <h6 class="mb-0">${team2Name}</h6>
    </div>
  `

  if (href) {
    return `<a class="row d-flex align-items-center flex-nowrap" href="${href}">${content}</a>`
  }

  return `<div class="row d-flex align-items-center flex-nowrap">${content}</div>`
}
