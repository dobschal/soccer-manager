import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { server } from '../lib/gateway.js'
import { goTo } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { formatLastActive } from '../lib/date.js'
import { renderEmblem } from './emblem.js'
import { renderPositionBadge } from './positionBadge.js'

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
  const tabUsersId = generateId()
  const resultsContainerId = generateId()
  const showAllButtonId = generateId()

  let currentTab = 'users'
  let searchTimeout = null
  let currentQuery = ''
  let usersSortDir = 'DESC'
  let lastUsersResult = []

  const remove = () => {
    const overlayEl = el('#' + overlayId)
    if (!overlayEl) return
    overlayEl.classList.add('fade-out')
    overlayEl.addEventListener('animationend', () => {
      overlayEl.remove()
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

  onClick('#' + tabUsersId, (e) => {
    e.preventDefault()
    currentTab = 'users'
    updateTabs()
    performSearch()
  })

  onClick('#' + showAllButtonId, (e) => {
    e.preventDefault()
    e.stopPropagation()
    remove()
    setTimeout(() => {
      const subPage = currentTab === 'players' ? null : currentTab
      const params = new URLSearchParams()
      if (subPage) params.set('sub_page', subPage)
      if (currentQuery.length >= 3) params.set('search_query', currentQuery)
      const qs = params.toString()
      goTo('browse' + (qs ? '?' + qs : ''))
    }, 50)
  })

  const updateTabs = () => {
    const playersTab = el('#' + tabPlayersId)
    const teamsTab = el('#' + tabTeamsId)
    const usersTab = el('#' + tabUsersId)
    if (playersTab && teamsTab && usersTab) {
      playersTab.classList.toggle('active', currentTab === 'players')
      teamsTab.classList.toggle('active', currentTab === 'teams')
      usersTab.classList.toggle('active', currentTab === 'users')
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
      } else if (currentTab === 'teams') {
        const { teams } = await server.searchTeams(currentQuery)
        renderTeamResults(resultsContainer, teams)
      } else {
        const { users } = await server.searchUsers(currentQuery)
        lastUsersResult = users
        renderUserResults(resultsContainer, users)
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
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center search-result-item u-cursor-pointer"
                 data-team-id="${player.team_id}"
                 data-player-id="${player.id}">
              <div>
                <strong>${player.name}</strong>
                <br>
                ${renderPositionBadge(player.position)} <small class="text-muted">Level ${player.level}</small>
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
            <div class="list-group-item list-group-item-action d-flex align-items-center search-result-item u-cursor-pointer"
                 data-team-id="${team.id}">
              <div class="me-3 u-size-40">
                ${renderEmblem(team, 40)}
              </div>
              <div>
                <strong>${team.name}</strong>
              </div>
            </div>
          `).join('')}
      </div>
    `
    container.innerHTML = html
  }

  const renderUserResults = (container, users) => {
    if (users.length === 0) {
      container.innerHTML = `<p class="text-muted text-center">${t('search.noResults')}</p>`
      return
    }

    const sortedUsers = [...users].sort((a, b) => {
      const aTime = a.last_login ? new Date(a.last_login).getTime() : 0
      const bTime = b.last_login ? new Date(b.last_login).getTime() : 0
      return usersSortDir === 'ASC' ? aTime - bTime : bTime - aTime
    })

    const sortClass = usersSortDir === 'ASC' ? 'asc' : 'desc'

    const html = `
      <table class="table table-hover mb-0 search-user-table">
        <thead>
          <tr>
            <th>${t('search.users')}</th>
            <th>${t('search.team')}</th>
            <th class="sort-header ${sortClass}" data-sort="last_login">${t('search.lastLogin')}</th>
          </tr>
        </thead>
        <tbody>
          ${sortedUsers.map(user => `
            <tr class="search-result-item ${user.team_id ? 'u-cursor-pointer' : ''}"
                ${user.team_id ? `data-team-id="${user.team_id}"` : ''}>
              <td><strong><i class="fa fa-user"></i> ${user.username}</strong></td>
              <td><small class="text-muted">${user.team_name || t('search.noTeam')}</small></td>
              <td><small class="text-muted">${formatLastActive(user.last_login)}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    container.innerHTML = html

    const sortHeader = container.querySelector('th[data-sort="last_login"]')
    if (sortHeader) {
      sortHeader.addEventListener('click', (e) => {
        e.stopPropagation()
        usersSortDir = usersSortDir === 'ASC' ? 'DESC' : 'ASC'
        renderUserResults(container, lastUsersResult)
      })
    }
  }

  const html = `
    <div id="${overlayId}" class="overlay-backdrop">
      <div id="${overlayInnerId}" class="card overlay search-overlay">
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
              <a id="${tabUsersId}" class="nav-link active" href="#">
                <i class="fa fa-id-card"></i> ${t('search.users')}
              </a>
            </li>
            <li class="nav-item">
              <a id="${tabPlayersId}" class="nav-link" href="#">
                <i class="fa fa-user"></i> ${t('search.players')}
              </a>
            </li>
            <li class="nav-item">
              <a id="${tabTeamsId}" class="nav-link" href="#">
                <i class="fa fa-users"></i> ${t('search.teams')}
              </a>
            </li>
          </ul>

          <div id="${resultsContainerId}" class="search-results-scroll">
            <p class="text-muted text-center">${t('search.minChars')}</p>
          </div>

          <div class="text-center mt-3">
            <button id="${showAllButtonId}" class="btn btn-outline-primary btn-sm">
              <i class="fa fa-list"></i> ${t('search.showAll')}
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  document.body.insertAdjacentHTML('beforeend', html)

  // Setup event delegation for search results
  const resultsContainer = el('#' + resultsContainerId)
  if (resultsContainer) {
    resultsContainer.addEventListener('click', (e) => {
      const resultItem = e.target.closest('.search-result-item')
      if (resultItem && resultItem.dataset.teamId) {
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
