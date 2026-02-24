import { server } from '../../lib/gateway.js'
import { UIElement } from '../../lib/UIElement.js'
import { Table } from '../../partials/table.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { calculatePlayerAge } from '../../util/player.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'

const SORT_COL_MAP = ['name', 'position', 'level', 'age', 'team_name']

export class BrowsePlayersPage extends UIElement {
  players = []
  totalCount = 0
  pageIndex = 0
  pageSize = 20
  searchQuery = ''
  season = 0
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

    // Reset page when sort changes
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
    const { season } = await server.getCurrentGameday()
    this.season = season
    const result = await server.browseAllPlayers(this.searchQuery, this.pageIndex, this.pageSize, this.sortColumn, this.sortDirection)
    this.players = result.players
    this.totalCount = result.totalCount
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
        { name: t('search.players'), sortKey: 'name' },
        { name: t('trades.position'), sortKey: 'position' },
        { name: t('search.level'), sortKey: 'level', align: 'right' },
        { name: t('player.age'), sortKey: '_age', align: 'right', largeScreenOnly: true },
        { name: t('results.team'), sortKey: 'team_name', largeScreenOnly: true }
      ],
      data: this.players.map(p => ({ ...p, _age: calculatePlayerAge(p, this.season) })),
      renderRow: (player) => [
        `<strong>${player.name}</strong>`,
        player.position,
        renderLevelBadge(player.level),
        `${player._age}`,
        player.team_name || '-'
      ],
      onClick: (player) => {
        goTo(`team?id=${player.team_id}&player_id=${player.id}`)
      }
    })

    return `
      <div>
        ${this.players.length === 0
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
