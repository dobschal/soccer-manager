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

const userIcon = '<i class="fa fa-user fa-sm ms-1" aria-hidden="true"></i>'

/**
 * Renders a game result/match card with two teams and center content
 * @param {Object} options
 * @param {Object} options.team1 - Team 1 object (for emblem)
 * @param {Object} options.team2 - Team 2 object (for emblem)
 * @param {string} options.team1Name - Team 1 display name
 * @param {string} options.team2Name - Team 2 display name
 * @param {boolean} options.isTeam1Highlighted - Whether to highlight team 1 (usually home team)
 * @param {string} options.centerContent - HTML content for the center column
 * @param {string} [options.href] - Optional link URL wrapping the whole card (legacy)
 * @param {string} [options.team1Href] - Optional link for the team 1 column (opens the team page)
 * @param {string} [options.team2Href] - Optional link for the team 2 column (opens the team page)
 * @param {string} [options.centerId] - Optional element id for the center column so the caller can attach a click handler
 * @param {boolean} [options.team1HasUser] - Whether team 1 is controlled by a real player
 * @param {boolean} [options.team2HasUser] - Whether team 2 is controlled by a real player
 * @param {boolean} [options.team1Won] - Whether team 1 won the match
 * @param {boolean} [options.team2Won] - Whether team 2 won the match
 * @returns {string}
 */
export function renderGameResult ({
  team1,
  team2,
  team1Name,
  team2Name,
  isTeam1Highlighted,
  centerContent,
  href,
  team1Href,
  team2Href,
  centerId,
  team1HasUser = false,
  team2HasUser = false,
  team1Won = false,
  team2Won = false
}) {
  const label1 = `${team1Won ? '<b>' : ''}${team1Name}${team1HasUser ? userIcon : ''}${team1Won ? '</b>' : ''}`
  const label2 = `${team2Won ? '<b>' : ''}${team2Name}${team2HasUser ? userIcon : ''}${team2Won ? '</b>' : ''}`

  const team1Col = renderTeamColumn(team1, label1, isTeam1Highlighted, team1Href)
  const team2Col = renderTeamColumn(team2, label2, !isTeam1Highlighted, team2Href)

  const centerClickable = Boolean(centerId)
  const centerCol = `
    <div class="col-auto text-center game-result-center${centerClickable ? ' game-result-center-link' : ''}"${centerId ? ` id="${centerId}"` : ''}>
      ${centerContent}
    </div>
  `

  const content = `${team1Col}${centerCol}${team2Col}`

  // Legacy: wrap the whole card in a single link only when no per-zone links
  // are requested.
  if (href && !team1Href && !team2Href && !centerId) {
    return `<a class="row d-flex align-items-center flex-nowrap" href="${href}">${content}</a>`
  }

  return `<div class="row d-flex align-items-center flex-nowrap">${content}</div>`
}

/**
 * Renders a single team column, optionally wrapped in a link to the team page.
 * @param {Object} team - Team object for the emblem
 * @param {string} label - Rendered team-name label HTML
 * @param {boolean} highlighted - Whether to bold the column (usually home team)
 * @param {string} [href] - Optional link to the team page
 * @returns {string}
 */
function renderTeamColumn (team, label, highlighted, href) {
  const inner = `
    <div class="mb-2">${renderResponsiveEmblem(team)}</div>
    <h6 class="mb-0">${label}</h6>
  `
  const classes = `col text-center game-result-team ${highlighted ? 'font-weight-bold' : ''}${href ? ' game-result-team-link' : ''}`
  if (href) {
    return `<a class="${classes}" href="${href}">${inner}</a>`
  }
  return `<div class="${classes}">${inner}</div>`
}
