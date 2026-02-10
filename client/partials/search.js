import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { goTo } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { renderEmblem } from './emblem.js'

/**
 * Shows the search overlay with tabs for Players and Teams
 */
export function showSearchOverlay () {
  const overlayId = generateId()
  const overlayInnerId = generateId()
  const closeButtonId = generateId()
  const searchInputId = generateId()
  const tabPlayersId = generateId()
  const tabTeamsId = generateId()
  const resultsContainerId = generateId()

  let currentTab = 'players'
  let searchTimeout = null
  let currentQuery = ''

  const remove = () => {
    const overlayEl = el('#' + overlayId)
    if (!overlayEl) return
    overlayEl.classList.add('fade-out')
    overlayEl.addEventListener('animationend', () => {
      overlayEl.remove()
      document.body.classList.remove('overlay-open')
    }, { once: true })
  }

  const navigateToTeam = (teamId, playerId = null) => {
    remove()
    // Use setTimeout to ensure overlay removal happens before navigation
    setTimeout(() => {
      if (playerId) {
        goTo(`team?id=${teamId}&player_id=${playerId}`)
      } else {
        goTo(`team?id=${teamId}`)
      }
    }, 50)
  }

  onClick('#' + closeButtonId, remove)
  onClick('#' + overlayId, remove)
  onClick('#' + overlayInnerId, event => event.stopPropagation())

  onClick('#' + tabPlayersId, (e) => {
    e.preventDefault()
    currentTab = 'players'
    updateTabs()
    performSearch()
  })

  onClick('#' + tabTeamsId, (e) => {
    e.preventDefault()
    currentTab = 'teams'
    updateTabs()
    performSearch()
  })

  const updateTabs = () => {
    const playersTab = el('#' + tabPlayersId)
    const teamsTab = el('#' + tabTeamsId)
    if (playersTab && teamsTab) {
      playersTab.classList.toggle('active', currentTab === 'players')
      teamsTab.classList.toggle('active', currentTab === 'teams')
    }
  }

  const performSearch = async () => {
    const resultsContainer = el('#' + resultsContainerId)
    if (!resultsContainer) return

    if (currentQuery.length < 3) {
      resultsContainer.innerHTML = `<p class="text-muted text-center">${t('search.minChars')}</p>`
      return
    }

    resultsContainer.innerHTML = '<div class="text-center"><i class="fa fa-spinner fa-spin fa-2x"></i></div>'

    try {
      if (currentTab === 'players') {
        const {
          players,
          teams
        } = await server.searchPlayers(currentQuery)
        renderPlayerResults(resultsContainer, players, teams)
      } else {
        const { teams } = await server.searchTeams(currentQuery)
        renderTeamResults(resultsContainer, teams)
      }
    } catch (e) {
      resultsContainer.innerHTML = `<p class="text-danger">${e.message || t('toast.somethingWentWrong')}</p>`
    }
  }

  const renderPlayerResults = (container, players, teams) => {
    if (players.length === 0) {
      container.innerHTML = `<p class="text-muted text-center">${t('search.noResults')}</p>`
      return
    }

    const teamMap = new Map(teams.map(team => [team.id, team]))

    const html = `
      <div class="list-group">
        ${players.map(player => {
      const team = teamMap.get(player.team_id)
      return `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center search-result-item"
                 data-team-id="${player.team_id}"
                 data-player-id="${player.id}"
                 style="cursor: pointer;">
              <div>
                <strong>${player.name}</strong>
                <br>
                <small class="text-muted">${player.position} - Level ${player.level}</small>
              </div>
              <div class="text-end">
                <small class="text-muted">${team?.name || 'Unknown'}</small>
              </div>
            </div>
          `
    }).join('')}
      </div>
    `
    container.innerHTML = html
  }

  const renderTeamResults = (container, teams) => {
    if (teams.length === 0) {
      container.innerHTML = `<p class="text-muted text-center">${t('search.noResults')}</p>`
      return
    }

    const html = `
      <div class="list-group">
        ${teams.map(team => `
            <div class="list-group-item list-group-item-action d-flex align-items-center search-result-item"
                 data-team-id="${team.id}"
                 style="cursor: pointer;">
              <div class="me-3" style="width: 40px; height: 40px;">
                ${renderEmblem(team, 40)}
              </div>
              <div>
                <strong>${team.name}</strong>
                <br>
                <small class="text-muted">${t('search.level')} ${team.level}</small>
              </div>
            </div>
          `).join('')}
      </div>
    `
    container.innerHTML = html
  }

  const html = `
    <div id="${overlayId}" class="overlay-backdrop">
      <div id="${overlayInnerId}" class="card overlay" style="max-width: 500px;">
        <div class="card-body">
          <span id="${closeButtonId}" class="fa fa-close fa-button fa-lg float-end"></span>
          <h5 class="card-title"><i class="fa fa-search"></i> ${t('search.title')}</h5>

          <div class="mb-3">
            <input
              type="text"
              id="${searchInputId}"
              class="form-control"
              placeholder="${t('search.placeholder')}"
              autofocus
            >
          </div>

          <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
              <a id="${tabPlayersId}" class="nav-link active" href="#">
                <i class="fa fa-user"></i> ${t('search.players')}
              </a>
            </li>
            <li class="nav-item">
              <a id="${tabTeamsId}" class="nav-link" href="#">
                <i class="fa fa-users"></i> ${t('search.teams')}
              </a>
            </li>
          </ul>

          <div id="${resultsContainerId}" style="max-height: 400px; overflow-y: auto;">
            <p class="text-muted text-center">${t('search.minChars')}</p>
          </div>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML('beforeend', html)
  document.body.classList.add('overlay-open')

  // Setup event delegation for search results
  const resultsContainer = el('#' + resultsContainerId)
  if (resultsContainer) {
    resultsContainer.addEventListener('click', (e) => {
      const resultItem = e.target.closest('.search-result-item')
      if (resultItem) {
        e.preventDefault()
        e.stopPropagation()
        const teamId = parseInt(resultItem.dataset.teamId, 10)
        const playerId = resultItem.dataset.playerId ? parseInt(resultItem.dataset.playerId, 10) : null
        navigateToTeam(teamId, playerId)
      }
    })
  }

  // Setup search input with debounce
  const searchInput = el('#' + searchInputId)
  if (searchInput) {
    searchInput.focus()
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value.trim()

      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }

      searchTimeout = setTimeout(() => {
        performSearch()
      }, 300) // 300ms debounce
    })

    // Also search on Enter key
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (searchTimeout) {
          clearTimeout(searchTimeout)
        }
        performSearch()
      }
    })
  }
}
