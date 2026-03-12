import { server } from '../../lib/gateway.js'
import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'

const SORT_COL_MAP = ['username', 'team_name']

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

  get template () {
    const totalPages = Math.ceil(this.totalCount / this.pageSize)

    const table = new Table({
      cols: [
        { name: t('search.users'), sortKey: 'username' },
        { name: t('results.team'), sortKey: 'team_name' }
      ],
      data: this.users,
      renderRow: (user) => [
        `<strong><i class="fa fa-user"></i> ${user.username}</strong>`,
        user.team_name || `<span class="text-muted">${t('search.noTeam')}</span>`
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
}
