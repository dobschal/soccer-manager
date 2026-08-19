import { UIElement } from '../lib/UIElement.js'
import { Table } from './table.js'
import { renderEmblem } from './emblem.js'
import { renderPageNumbers } from './pagination.js'
import { showGameModal } from './gameModal.js'
import { shortenTeamName } from '../util/team.js'
import { t } from '../i18n/index.js'

const PAGE_SIZE = 5
const STANDS = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
const GAME_TYPES = ['league', 'cup', 'friendly']

/**
 * Attendance per stand for the user's past home games.
 *
 * Owns its own filter and page state so toggling a filter never re-renders the
 * surrounding stadium page (which would tear down the Three.js canvas).
 */
export class StadiumAttendanceTable extends UIElement {
  /**
   * @param {Array<object>} attendance - rows from `server.getStadiumAttendance()`
   */
  constructor (attendance = []) {
    super()
    this.attendance = attendance
  }

  /**
   * @returns {string}
   */
  get template () {
    if (this.attendance.length === 0) {
      return `<p class="text-muted mb-4">${t('stadium.noAttendanceData')}</p>`
    }
    return `
      <div class="stadium-attendance">
        <div class="btn-group btn-group-sm mb-3 stadium-attendance-filters" role="group">
          ${GAME_TYPES.map(type => `
            <button type="button"
                    class="btn ${this.activeTypes[type] ? 'btn-info' : 'btn-outline-info'}"
                    data-attendance-filter="${type}">
              ${t('stadium.attendanceFilter.' + type)}
            </button>
          `).join('')}
        </div>
        <div class="stadium-attendance-rows">${this._renderTable()}</div>
        <div class="stadium-attendance-pagination">${this._renderPagination()}</div>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).stadium-attendance-filters': {
        click: (event) => {
          const button = event.target.closest('[data-attendance-filter]')
          if (!button) return
          const type = button.dataset.attendanceFilter
          this.activeTypes[type] = !this.activeTypes[type]
          this._page = 0
          void this.update()
        }
      },
      // The nested Table is rendered as a plain template string, so it never
      // mounts as a UIElement and its own `onClick` would never be wired up.
      // The row click is therefore delegated from here.
      '(optional).stadium-attendance-rows': {
        click: (event) => {
          const row = event.target.closest('tr[data-game-id]')
          if (!row) return
          void showGameModal(Number(row.dataset.gameId))
        }
      },
      '(optional).stadium-attendance-pagination': {
        click: (event) => {
          if (event.target.closest('.stadium-attendance-prev')) return this._goToPage(this._page - 1)
          if (event.target.closest('.stadium-attendance-next')) return this._goToPage(this._page + 1)
          const pageLink = event.target.closest('[data-page-index]')
          if (pageLink) this._goToPage(parseInt(pageLink.dataset.pageIndex, 10))
        }
      }
    }
  }
  /** @type {Array<object>} */
  attendance = []

  /** @type {Object<string, boolean>} */
  activeTypes = { league: true, cup: true, friendly: true }

  _page = 0

  /**
   * @returns {Array<object>}
   */
  get filteredRows () {
    return this.attendance.filter(row => this.activeTypes[row.gameType])
  }

  /**
   * @returns {string}
   */
  _renderTable () {
    const table = this._buildTable()
    if (!table) {
      return `<p class="text-muted">${t('stadium.noAttendanceForFilter')}</p>`
    }
    return table.template
  }

  /**
   * @returns {Table|null} null when the active filters exclude every game
   */
  _buildTable () {
    const rows = this.filteredRows
    if (rows.length === 0) return null
    const start = this._page * PAGE_SIZE
    return new Table({
      cols: [
        { name: t('stadium.attendanceMatchDay') },
        { name: t('stadium.attendanceOpponent') },
        ...STANDS.map(stand => ({ name: t('stadium.' + stand), align: 'right' }))
      ],
      renderRow: (row) => [
        this._renderMatchDayLabel(row),
        this._renderOpponent(row.opponent),
        ...STANDS.map(stand => this._renderStandCell(row.stands[stand]))
      ],
      data: rows.slice(start, start + PAGE_SIZE),
      // `u-cursor-pointer` is not just cosmetic: iOS only bubbles click events
      // out of non-interactive elements when they look clickable.
      rowClass: () => 'u-cursor-pointer',
      rowAttrs: (row) => `data-game-id="${row.gameId}"`,
      useUrlSort: false,
      classes: 'table-sm table-striped table-hover'
    })
  }

  /**
   * One stand's fill rate for one game.
   *
   * A stand that was under construction was closed for that game, so it sold no
   * tickets at all. Printing "0%" there puts it in the same column as a stand
   * nobody wanted to visit — the wrench says the seats were not on sale.
   *
   * @param {object} [data] - `{ guests, size, percentage, underConstruction }`
   * @returns {string}
   */
  _renderStandCell (data) {
    const stand = data || { guests: 0, size: 0, percentage: 0 }
    if (stand.underConstruction) {
      return `<span class="text-muted" title="${t('stadium.attendanceUnderConstruction')}"><i class="fa fa-wrench"></i></span>`
    }
    const title = `${stand.guests.toLocaleString()} / ${stand.size.toLocaleString()}`
    return `<span title="${title}">${stand.percentage}%</span>`
  }

  /**
   * League games are labelled by their match day, cup games by their round.
   * @param {object} row
   * @returns {string}
   */
  _renderMatchDayLabel (row) {
    if (row.gameType === 'cup') {
      return `<span class="badge bg-warning text-dark u-nowrap"><i class="fa fa-trophy"></i> ${this._cupRoundName(row)}</span>`
    }
    if (row.gameType === 'friendly') {
      return `<span class="badge bg-info u-nowrap"><i class="fa fa-handshake-o"></i> ${t('stadium.attendanceFilter.friendly')}</span>`
    }
    const day = row.matchDay ?? (row.gameDay + 1)
    return `<span class="badge bg-secondary u-nowrap"><i class="fa fa-diamond"></i> ${t('schedule.leagueDay', { day })}</span>`
  }

  /**
   * @param {object} row
   * @returns {string}
   */
  _cupRoundName (row) {
    const round = row.cupRound
    if (round === 1) return t('cup.final')
    if (round === 2) return t('cup.semiFinal')
    if (round === 4) return t('cup.quarterFinal')
    if (round === 8) return t('cup.roundOf16')
    if (!round) return t('cup.round')
    return t('cup.roundNumber', { number: (row.totalCupRounds || 0) - Math.log2(round) })
  }

  /**
   * @param {object} opponent
   * @returns {string}
   */
  _renderOpponent (opponent) {
    if (!opponent?.name) return '<span class="text-muted">—</span>'
    return `
      <span class="d-inline-flex align-items-center gap-1 u-nowrap">
        ${renderEmblem(opponent, 20)} ${shortenTeamName(opponent.name, opponent.short_name)}
      </span>
    `
  }

  /**
   * @returns {string}
   */
  _renderPagination () {
    const totalPages = Math.ceil(this.filteredRows.length / PAGE_SIZE)
    if (totalPages <= 1) return ''
    const hasPrev = this._page > 0
    const hasNext = this._page < totalPages - 1
    return `
      <nav>
        <ul class="pagination pagination-sm justify-content-center flex-wrap">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link u-cursor-pointer stadium-attendance-prev">${t('common.prev')}</span>
          </li>
          ${renderPageNumbers(totalPages, this._page)}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link u-cursor-pointer stadium-attendance-next">${t('common.next')}</span>
          </li>
        </ul>
      </nav>
    `
  }

  /**
   * @param {number} pageIndex
   * @returns {void}
   */
  _goToPage (pageIndex) {
    const totalPages = Math.ceil(this.filteredRows.length / PAGE_SIZE)
    if (pageIndex < 0 || pageIndex >= totalPages) return
    this._page = pageIndex
    void this.update()
  }
}
