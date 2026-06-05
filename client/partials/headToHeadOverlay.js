import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { renderEmblem } from './emblem.js'
import { t } from '../i18n/index.js'

/**
 * Show a head-to-head overlay comparing two teams: aggregated W/D/L plus
 * every historic match between them with links to the game modal.
 * @param {number} teamAId - reference team (left column, "we")
 * @param {number} teamBId - opponent team (right column)
 * @returns {Promise<void>}
 */
export async function showHeadToHeadOverlay (teamAId, teamBId) {
  const data = await server.getHeadToHead(teamAId, teamBId)
  const { teamA, teamB, games, stats } = data

  const headerRow = `
    <div class="head-to-head-header">
      <a href="#team?id=${teamA.id}" class="head-to-head-team">
        ${renderEmblem(teamA, 56)}
        <div class="head-to-head-team-name">${teamA.name}</div>
      </a>
      <div class="head-to-head-summary">
        <div class="head-to-head-record">
          <span class="head-to-head-wins">${stats.winsA}</span>
          <span class="head-to-head-draws">${stats.draws}</span>
          <span class="head-to-head-losses">${stats.winsB}</span>
        </div>
        <div class="head-to-head-record-labels">
          <span>${t('headToHead.wins')}</span>
          <span>${t('headToHead.draws')}</span>
          <span>${t('headToHead.losses')}</span>
        </div>
        <div class="head-to-head-goals">
          ${t('headToHead.goals')}: <b>${stats.goalsA}</b> : <b>${stats.goalsB}</b>
        </div>
      </div>
      <a href="#team?id=${teamB.id}" class="head-to-head-team">
        ${renderEmblem(teamB, 56)}
        <div class="head-to-head-team-name">${teamB.name}</div>
      </a>
    </div>
  `

  const gamesList = games.length === 0
    ? `<div class="text-center text-muted py-3">${t('headToHead.noGames')}</div>`
    : `
        <table class="table table-sm table-hover head-to-head-table">
          <thead>
            <tr>
              <th>${t('headToHead.colSeason')}</th>
              <th>${t('headToHead.colType')}</th>
              <th class="text-end">${t('headToHead.colResult')}</th>
            </tr>
          </thead>
          <tbody>
            ${games.map(g => _renderGameRow(g, teamA.id)).join('')}
          </tbody>
        </table>
      `

  const subtitle = stats.totalGames === 0
    ? t('headToHead.noGames')
    : t('headToHead.totalGames', { count: stats.totalGames })

  showOverlay(
    t('headToHead.title'),
    subtitle,
    `${headerRow}${gamesList}`
  )
}

function _renderGameRow (game, teamAId) {
  const aIsTeam1 = game.team1Id === teamAId
  const goalsA = aIsTeam1 ? game.goalsTeam1 : game.goalsTeam2
  const goalsB = aIsTeam1 ? game.goalsTeam2 : game.goalsTeam1
  const typeLabel = _gameTypeLabel(game.gameType)
  let resultClass = 'text-muted'
  if (goalsA > goalsB) resultClass = 'text-success'
  else if (goalsA < goalsB) resultClass = 'text-danger'
  const href = game.gameType === 'friendly'
    ? `#`
    : game.gameType === 'cup'
      ? `#results?game_id=${game.id}&sub_page=cup`
      : `#results?game_id=${game.id}`
  return `
    <tr>
      <td>${t('headToHead.seasonShort')} ${game.season}</td>
      <td>${typeLabel}</td>
      <td class="text-end ${resultClass}">
        <a href="${href}" class="text-decoration-none ${resultClass}">${goalsA}:${goalsB}</a>
      </td>
    </tr>
  `
}

function _gameTypeLabel (type) {
  if (type === 'cup') return t('cup.title')
  if (type === 'friendly') return t('friendly.title')
  return t('headToHead.league')
}
