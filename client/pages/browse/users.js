import { server } from '../../lib/gateway.js'
import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'
import { formatLastActive } from '../../lib/date.js'
import { formatLeague } from '../../util/league.js'

const SORT_COL_MAP = ['username', 'team_name', 'league', 'last_login', 'is_friend']

function renderUserAvatar (avatar, username) {
  const alt = username || ''
  if (avatar) {
    const baseUrl = window.__NATIVE_SERVER_URL || ''
    return `<img class="browse-user-avatar" src="${baseUrl}/uploads/avatars/${avatar}" alt="${alt}">`
  }
  return '<img class="browse-user-avatar browse-user-avatar--default" src="./assets/avatar-placeholder.svg" alt="">'
}

export class BrowseUsersPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }
  async load () {
    const result = await server.browseAllUsers(this.searchQuery, this.pageIndex, this.pageSize, this.sortColumn, this.sortDirection)
    this.users = result.users
    this.totalCount = result.totalCount
  }
  get template () {
    const totalPages = Math.ceil(this.totalCount / this.pageSize)

    const table = new Table({
      cols: [
        { name: t('search.users'), sortKey: 'username' },
        { name: t('results.team'), sortKey: 'team_name' },
        {
          name: t('search.league'),
          sortFn: (a, b, asc) => {
            const aLevel = a.team_level ?? Number.POSITIVE_INFINITY
            const bLevel = b.team_level ?? Number.POSITIVE_INFINITY
            if (aLevel !== bLevel) return asc ? aLevel - bLevel : bLevel - aLevel
            const aLeague = a.team_league ?? 0
            const bLeague = b.team_league ?? 0
            return asc ? aLeague - bLeague : bLeague - aLeague
          }
        },
        {
          name: t('search.lastLogin'),
          sortFn: (a, b, asc) => {
            const aTime = a.last_login ? new Date(a.last_login).getTime() : 0
            const bTime = b.last_login ? new Date(b.last_login).getTime() : 0
            return asc ? aTime - bTime : bTime - aTime
          }
        },
        {
          name: t('search.friend'),
          align: 'center',
          sortFn: (a, b, asc) => {
            const aVal = a.is_friend ? 1 : 0
            const bVal = b.is_friend ? 1 : 0
            return asc ? aVal - bVal : bVal - aVal
          }
        }
      ],
      data: this.users,
      renderRow: (user) => [
        `<strong>${renderUserAvatar(user.avatar, user.username)} ${user.username}</strong>`,
        user.team_name || `<span class="text-muted">${t('search.noTeam')}</span>`,
        user.team_level !== null && user.team_level !== undefined
          ? formatLeague(user.team_level, user.team_league)
          : '<span class="text-muted">—</span>',
        `<span class="text-muted">${formatLastActive(user.last_login)}</span>`,
        user.is_friend
          ? '<i class="fa fa-heart text-danger" aria-hidden="true"></i>'
          : '<span class="text-muted">—</span>'
      ],
      onClick: (user) => {
        if (user.team_id) {
          goTo(`team?id=${user.team_id}`)
        }
      }
    })

    return `
      <div>
        ${this.users.length === 0
    ? `<p class="text-muted text-center">${t('search.noResults')}</p>`
    : table}

        ${totalPages > 1 ? `
          <nav class="d-flex justify-content-between align-items-center mt-3">
            <button id="browse-prev-page" class="btn btn-sm btn-outline-secondary" ${this.pageIndex <= 0 ? 'disabled' : ''}>
              <i class="fa fa-chevron-left"></i> ${t('common.prev')}
            </button>
            <span>${t('common.page')} ${this.pageIndex + 1} ${t('common.of')} ${totalPages}</span>
            <button id="browse-next-page" class="btn btn-sm btn-outline-secondary" ${this.pageIndex >= totalPages - 1 ? 'disabled' : ''}>
              ${t('common.next')} <i class="fa fa-chevron-right"></i>
            </button>
          </nav>
        ` : ''}
      </div>
    `
  }
  get events () {
    return {
      '(optional) #browse-prev-page': {
        click: () => setQueryParams({ page: this.pageIndex - 1 })
      },
      '(optional) #browse-next-page': {
        click: () => setQueryParams({ page: this.pageIndex + 1 })
      }
    }
  }
  users = []
  
  totalCount = 0
  pageIndex = 0
  pageSize = 20
  searchQuery = ''
  sortColumn = ''
  sortDirection = ''
  
  async applyQueryParams (params) {
    const newSortDir = params.sort_dir || ''
    const newSortCol = params.col !== undefined ? (SORT_COL_MAP[Number(params.col)] || '') : ''

    if (newSortDir !== this.sortDirection || newSortCol !== this.sortColumn) {
      this.pageIndex = 0
    } else {
      this.pageIndex = parseInt(params.page) || 0
    }

    this.searchQuery = params.search_query || ''
    this.sortColumn = newSortCol
    this.sortDirection = newSortDir
  }
  
}
