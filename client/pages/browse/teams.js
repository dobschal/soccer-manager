import { server } from '../../lib/gateway.js'
import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { renderEmblem } from '../../partials/emblem.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'

const SORT_COL_MAP = [null, 'name']

export class BrowseTeamsPage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }
  async load () {
    const result = await server.browseAllTeams(this.searchQuery, this.pageIndex, this.pageSize, this.sortColumn, this.sortDirection)
    this.teams = result.teams
    this.totalCount = result.totalCount
  }
  get template () {
    const totalPages = Math.ceil(this.totalCount / this.pageSize)

    const table = new Table({
      cols: [
        { name: '', sortKey: null },
        { name: t('search.teams'), sortKey: 'name' }
      ],
      data: this.teams,
      renderRow: (team) => [
        `<div style="width: 30px; height: 30px;">${renderEmblem(team, 30)}</div>`,
        `<strong>${team.name}</strong>`
      ],
      onClick: (team) => {
        goTo(`team?id=${team.id}`)
      }
    })

    return `
      <div>
        ${this.teams.length === 0
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
  teams = []
  
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
