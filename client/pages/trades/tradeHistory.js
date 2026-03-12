import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { euroFormat } from '../../lib/currency.js'
import { calculatePlayerAge } from '../../util/player.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { Table } from '../../partials/table.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { renderPageNumbers } from '../../partials/pagination.js'
import { toast } from '../../partials/toast.js'

const PAGE_SIZE = 20

export class TradeHistoryPage extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getTradeHistory()
    this.trades = response.trades
    this.teams = response.teams
    this.players = response.players
  }
  /**
   * @param {Object} params
   * @param {string} params.sort_dir
   * @param {string} params.col
   */
  onQueryChanged ({ sort_dir, col }) {
    if (sort_dir && col !== undefined) {
      const cols = this._getTableCols()
      const colConfig = cols[Number(col)]
      if (colConfig && (colConfig.sortKey || colConfig.sortFn)) {
        this.trades.sort((a, b) => {
          if (colConfig.sortFn) return colConfig.sortFn(a, b, sort_dir !== 'DESC')
          if (sort_dir === 'ASC') return a[colConfig.sortKey] - b[colConfig.sortKey]
          return b[colConfig.sortKey] - a[colConfig.sortKey]
        })
        this._page = 0
        this.update()
      }
    }
  }
  trades = []

  teams = []
  players = []
  _page = 0

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).trade-history-pagination': {
        click: (event) => {
          const target = event.target

          if (target.closest('.trade-history-prev')) {
            this._loadPage(this._page - 1)
            return
          }

          if (target.closest('.trade-history-next')) {
            this._loadPage(this._page + 1)
            return
          }

          const pageLink = target.closest('[data-page-index]')
          if (pageLink) {
            this._loadPage(parseInt(pageLink.dataset.pageIndex, 10))
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    if (this.trades.length === 0) {
      return `
        <div>
          <h2>${t('trades.tradeHistoryTitle')}</h2>
          <p>${t('trades.tradeHistoryDesc')}</p>
          <p>${t('trades.noTradeHistory')}</p>
        </div>
      `
    }

    const start = this._page * PAGE_SIZE
    const pageData = this.trades.slice(start, start + PAGE_SIZE)

    const table = new Table({
      data: pageData,
      cols: this._getTableCols(),
      renderRow: (trade) => {
        const player = this.players.find(p => p.id === trade.player_id)
        const fromTeam = this.teams.find(te => te.id === trade.from_team_id)
        const toTeam = this.teams.find(te => te.id === trade.to_team_id)
        return [
          `${player?.name ?? 'Unknown'} (${player?.position ?? '?'}, ${player ? renderLevelBadge(player.level) : '?'}, ${player ? calculatePlayerAge(player, trade.season) : '?'})`,
          fromTeam?.name ?? 'Unknown',
          toTeam?.name ?? 'Unknown',
          `${t('finances.season', { season: trade.season + 1 })}, ${t('results.gameDay', { day: trade.game_day + 1 })}`,
          euroFormat.format(trade.price)
        ]
      }
    })

    return `
      <div>
        <h2>${t('trades.tradeHistoryTitle')}</h2>
        <p>${t('trades.tradeHistoryDesc')}</p>
        ${table}
        <div class="trade-history-pagination">
          ${this._renderPagination()}
        </div>
      </div>
    `
  }

  /**
   * @returns {Array}
   */
  _getTableCols () {
    return [{
      name: t('trades.player'),
      onClick: (trade) => {
        setQueryParams({ player_id: trade.player_id })
      },
      sortFn: (a, b, isAsc) => {
        const playerA = this.players.find(p => p.id === a.player_id)
        const playerB = this.players.find(p => p.id === b.player_id)
        const nameA = playerA?.name ?? ''
        const nameB = playerB?.name ?? ''
        return isAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
      }
    }, {
      name: t('finances.from'),
      onClick: (trade) => {
        const team = this.teams.find(te => te.id === trade.from_team_id)
        if (team?.is_system_team) {
          toast(t('trades.noTeamInfo'))
          return
        }
        goTo(`team?id=${trade.from_team_id}`)
      },
      sortFn: (a, b, isAsc) => {
        const teamA = this.teams.find(te => te.id === a.from_team_id)
        const teamB = this.teams.find(te => te.id === b.from_team_id)
        const nameA = teamA?.name ?? ''
        const nameB = teamB?.name ?? ''
        return isAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
      }
    }, {
      name: t('finances.to2'),
      onClick: (trade) => {
        const team = this.teams.find(te => te.id === trade.to_team_id)
        if (team?.is_system_team) {
          toast(t('trades.noTeamInfo'))
          return
        }
        goTo(`team?id=${trade.to_team_id}`)
      },
      sortFn: (a, b, isAsc) => {
        const teamA = this.teams.find(te => te.id === a.to_team_id)
        const teamB = this.teams.find(te => te.id === b.to_team_id)
        const nameA = teamA?.name ?? ''
        const nameB = teamB?.name ?? ''
        return isAsc ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
      }
    }, {
      name: t('finances.date'),
      sortFn: (a, b, isAsc) => {
        const valA = a.season * 1000 + a.game_day
        const valB = b.season * 1000 + b.game_day
        return isAsc ? valA - valB : valB - valA
      }
    }, {
      name: t('trades.price'),
      sortKey: 'price',
      align: 'right'
    }]
  }

  /**
   * @returns {string}
   */
  _renderPagination () {
    const totalPages = Math.ceil(this.trades.length / PAGE_SIZE)
    if (totalPages <= 1) return ''

    const hasPrev = this._page > 0
    const hasNext = this._page < totalPages - 1

    const pageNumbers = renderPageNumbers(totalPages, this._page)

    return `
      <nav class="mt-3">
        <ul class="pagination pagination-sm justify-content-center flex-wrap">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link trade-history-prev" style="cursor: pointer;">${t('common.prev')}</span>
          </li>
          ${pageNumbers}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link trade-history-next" style="cursor: pointer;">${t('common.next')}</span>
          </li>
        </ul>
      </nav>
    `
  }

  /**
   * @param {number} pageIndex
   */
  _loadPage (pageIndex) {
    const totalPages = Math.ceil(this.trades.length / PAGE_SIZE)
    if (pageIndex < 0 || pageIndex >= totalPages) return
    this._page = pageIndex
    this.update()
  }
}
