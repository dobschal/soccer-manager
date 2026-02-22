import { server } from '../../lib/gateway.js'
import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { renderEmblem } from '../../partials/emblem.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'

const SORT_COL_MAP = [null, 'name', 'level']

export class BrowseTeamsPage extends UIElement {
  teams = []
  totalCount = 0
  pageIndex = 0
  pageSize = 20
  searchQuery = ''
  sortColumn = ''
  sortDirection = ''

  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

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

  async load () {
    const result = await server.browseAllTeams(this.searchQuery, this.pageIndex, this.pageSize, this.sortColumn, this.sortDirection)
    this.teams = result.teams
    this.totalCount = result.totalCount
  }

  get events () {
    return {
      '#browse-search-input': {
        input: (e) => {
          clearTimeout(this._debounce)
          this._debounce = setTimeout(() => {
            setQueryParams({ search_query: e.target.value.trim() || null, page: null })
          }, 300)
        }
      },
      '#browse-prev-page': {
        click: () => setQueryParams({ page: this.pageIndex - 1 })
      },
      '#browse-next-page': {
        click: () => setQueryParams({ page: this.pageIndex + 1 })
      }
    }
  }

  get template () {
    const totalPages = Math.ceil(this.totalCount / this.pageSize)

    const table = new Table({
      cols: [
        { name: '', sortKey: null },
        { name: t('search.teams'), sortKey: 'name' },
        { name: t('search.level'), sortKey: 'level', align: 'right' }
      ],
      data: this.teams,
      renderRow: (team) => [
        `<div style="width: 30px; height: 30px;">${renderEmblem(team, 30)}</div>`,
        `<strong>${team.name}</strong>`,
        renderLevelBadge(team.level)
      ],
      onClick: (team) => {
        goTo(`team?id=${team.id}`)
      }
    })

    return `
      <div>
        <div class="mb-3">
          <input
            type="text"
            id="browse-search-input"
            class="form-control"
            placeholder="${t('search.placeholder')}"
            value="${this.searchQuery}"
          >
        </div>

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
}
