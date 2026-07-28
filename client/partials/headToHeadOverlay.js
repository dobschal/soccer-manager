import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { renderEmblem } from './emblem.js'
import { t } from '../i18n/index.js'
import { el, generateId } from '../lib/html.js'

/**
 * Show a head-to-head overlay comparing two teams: aggregated W/D/L plus
 * every historic match between them with links to the game modal.
 *
 * Friendlies are hidden by default and can be revealed via a toggle. The
 * summary record, subtitle count and games list are all computed client-side
 * from the currently visible games so they stay in sync with the toggle.
 * @param {number} teamAId - reference team (left column, "we")
 * @param {number} teamBId - opponent team (right column)
 * @returns {Promise<void>}
 */
export async function showHeadToHeadOverlay (teamAId, teamBId) {
  const data = await server.getHeadToHead(teamAId, teamBId)
  const { teamA, teamB, games } = data

  const hasFriendlies = games.some(g => g.gameType === 'friendly')
  let showFriendlies = false
  const visibleGames = () => showFriendlies ? games : games.filter(g => g.gameType !== 'friendly')

  const summaryId = generateId()
  const gamesId = generateId()
  const toggleId = generateId()
  const countId = generateId()

  const toggle = hasFriendlies
    ? `
      <div class="form-check form-switch head-to-head-toggle">
        <input class="form-check-input" type="checkbox" role="switch" id="${toggleId}">
        <label class="form-check-label" for="${toggleId}">${t('headToHead.showFriendlies')}</label>
      </div>
    `
    : ''

  const headerRow = `
    <div class="head-to-head-header">
      <a href="#team?id=${teamA.id}" class="head-to-head-team">
        ${renderEmblem(teamA, 56)}
        <div class="head-to-head-team-name">${teamA.name}</div>
      </a>
      <div id="${summaryId}" class="head-to-head-summary">
        ${_renderSummary(_computeStats(visibleGames(), teamA.id))}
      </div>
      <a href="#team?id=${teamB.id}" class="head-to-head-team">
        ${renderEmblem(teamB, 56)}
        <div class="head-to-head-team-name">${teamB.name}</div>
      </a>
    </div>
  `

  const body = `
    ${headerRow}
    ${toggle}
    <div id="${gamesId}">
      ${_renderGamesList(visibleGames(), teamA.id)}
    </div>
  `

  showOverlay(
    t('headToHead.title'),
    `<span id="${countId}">${_subtitleText(visibleGames())}</span>`,
    body
  )

  if (hasFriendlies) {
    const checkbox = el('#' + toggleId)
    checkbox?.addEventListener('change', () => {
      showFriendlies = checkbox.checked
      const visible = visibleGames()
      const summaryEl = el('#' + summaryId)
      const gamesEl = el('#' + gamesId)
      const countEl = el('#' + countId)
      if (summaryEl) summaryEl.innerHTML = _renderSummary(_computeStats(visible, teamA.id))
      if (gamesEl) gamesEl.innerHTML = _renderGamesList(visible, teamA.id)
      if (countEl) countEl.innerHTML = _subtitleText(visible)
    })
  }
}

/**
 * Aggregate W/D/L and goals for teamA over the given games.
 * @param {Array<object>} games
 * @param {number} teamAId
 * @returns {{winsA: number, winsB: number, draws: number, goalsA: number, goalsB: number, totalGames: number}}
 */
function _computeStats (games, teamAId) {
  let winsA = 0
  let winsB = 0
  let draws = 0
  let goalsA = 0
  let goalsB = 0
  for (const g of games) {
    const aIsTeam1 = g.team1Id === teamAId
    const gA = aIsTeam1 ? g.goalsTeam1 : g.goalsTeam2
    const gB = aIsTeam1 ? g.goalsTeam2 : g.goalsTeam1
    goalsA += gA
    goalsB += gB
    if (gA > gB) winsA++
    else if (gA < gB) winsB++
    else draws++
  }
  return { winsA, winsB, draws, goalsA, goalsB, totalGames: games.length }
}

function _renderSummary (stats) {
  return `
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
  `
}

function _subtitleText (games) {
  return games.length === 0
    ? t('headToHead.noGames')
    : t('headToHead.totalGames', { count: games.length })
}

function _renderGamesList (games, teamAId) {
  if (games.length === 0) {
    return `<div class="text-center text-muted py-3">${t('headToHead.noGames')}</div>`
  }
  return `
    <table class="table table-sm table-hover head-to-head-table">
      <thead>
        <tr>
          <th>${t('headToHead.colSeason')}</th>
          <th>${t('headToHead.colType')}</th>
          <th class="text-end">${t('headToHead.colResult')}</th>
        </tr>
      </thead>
      <tbody>
        ${games.map(g => _renderGameRow(g, teamAId)).join('')}
      </tbody>
    </table>
  `
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
