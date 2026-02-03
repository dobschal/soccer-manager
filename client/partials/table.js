import { UIElement } from '../lib/UIElement.js'
import { el } from '../lib/html.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'

/**
 * @typedef {object} TableHeadCellConfig
 * @property {string} name
 * @property {string} sortKey
 * @property {(val1: object, val2: object, isAscending: boolean) => number} sortFn
 * @property {boolean} largeScreenOnly
 * @property {'right'|'left'|'center'} align
 * @property {(dataItem: object, rowIndex: number, colIndex: number) => void} [onClick]
 */

/**
 * @typedef {object} TableConfig
 * @property {Array<TableHeadCellConfig>} cols
 * @property {(data: object) => Array<string>} renderRow
 * @property {Array<object>} data
 * @property {(dataItem: object, rowIndex: number) => void} [onClick]
 */

export class Table extends UIElement {
  /**
   * @param {TableConfig} config
   */
  constructor (config) {
    super()
    this.config = config
    this.sortDirection = null
    this.sortColIndex = null
  }

  /**
   * @returns {string}
   */
  get template () {
    const hasHover = typeof this.config.onClick === 'function'
    return `
      <table class="table${hasHover ? ' table-hover' : ''}">
        <thead>
          <tr>
            ${this._renderHeaderCells()}
          </tr>
        </thead>
        <tbody>
          ${this._renderTableRows()}
        </tbody>
      </table>
    `
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._applyInitialSort()
    this._attachEventHandlers()
  }

  /**
   * @returns {void}
   */
  _applyInitialSort () {
    const {
      sort_dir: sortDirection,
      col: colIndex
    } = getQueryParams()
    if (sortDirection && colIndex !== undefined) {
      const col = this.config.cols[Number(colIndex)]
      if (col && (col.sortKey || col.sortFn)) {
        this._sortTable(Number(colIndex), sortDirection)
      }
    }
  }

  /**
   * @returns {void}
   */
  _attachEventHandlers () {
    // Attach header click handlers for sorting
    const headers = document.querySelectorAll(`${this._elementQuery} th.sort-header`)
    headers.forEach((header, index) => {
      const col = this.config.cols[index]
      if (col.sortKey || col.sortFn) {
        header.addEventListener('click', () => {
          const { sort_dir: currentDir } = getQueryParams()
          setQueryParams({
            sort_dir: currentDir === 'DESC' ? 'ASC' : 'DESC',
            col: index.toString()
          })
        })
      }
    })

    // Attach row click handlers
    if (typeof this.config.onClick === 'function') {
      const rows = document.querySelectorAll(`${this._elementQuery} tbody tr`)
      rows.forEach((row, index) => {
        row.addEventListener('click', () => {
          this.config.onClick(this.config.data[index], index)
        })
      })
    }

    // Attach cell click handlers
    this.config.cols.forEach((col, colIndex) => {
      if (typeof col.onClick === 'function') {
        const cells = document.querySelectorAll(`${this._elementQuery} tbody tr td:nth-child(${colIndex + 1})`)
        cells.forEach((cell, rowIndex) => {
          cell.addEventListener('click', (e) => {
            e.stopPropagation()
            col.onClick(this.config.data[rowIndex], rowIndex, colIndex)
          })
        })
      }
    })
  }

  /**
   * @param {number} colIndex
   * @param {string} sortDirection
   * @returns {void}
   */
  _sortTable (colIndex, sortDirection) {
    const col = this.config.cols[colIndex]
    const tableEl = el(`${this._elementQuery} table`)
    if (!tableEl) return

    // Remove existing sort indicators
    tableEl.querySelectorAll('.sort-header').forEach(header => {
      header.classList.remove('desc', 'asc')
    })

    // Sort data
    this.config.data.sort((a, b) => {
      if (col.sortFn) {
        return col.sortFn(a, b, sortDirection !== 'DESC')
      }
      if (sortDirection === 'ASC') {
        return a[col.sortKey] - b[col.sortKey]
      }
      return b[col.sortKey] - a[col.sortKey]
    })

    // Add sort indicator
    const header = tableEl.querySelectorAll('th')[colIndex]
    if (header) {
      header.classList.add(sortDirection === 'DESC' ? 'desc' : 'asc')
    }

    // Re-render table body
    const tbody = tableEl.querySelector('tbody')
    if (tbody) {
      tbody.innerHTML = this._renderTableRows()
      this._attachEventHandlers()
    }
  }

  /**
   * @returns {string}
   */
  _renderHeaderCells () {
    return this.config.cols
      .map((col) => {
        const isSortable = col.sortKey || col.sortFn
        const classes = [
          col.align ? `text-${col.align}` : '',
          isSortable ? 'sort-header' : '',
          col.largeScreenOnly ? 'd-none d-sm-table-cell' : ''
        ].filter(Boolean).join(' ')

        return `<th scope="col" class="${classes}">${col.name}</th>`
      })
      .join('')
  }

  /**
   * @returns {string}
   */
  _renderTableRows () {
    return this.config.data
      .map((item, rowIndex) => {
        const rowContent = this.config.renderRow(item)
        return `<tr>${this._renderTableCells(rowContent, rowIndex)}</tr>`
      })
      .join('')
  }

  /**
   * @param {Array<string>} rowContent
   * @param {number} rowIndex
   * @returns {string}
   */
  _renderTableCells (rowContent, _rowIndex) {
    return rowContent.map((cellContent, colIndex) => {
      const col = this.config.cols[colIndex]
      const hasClickFn = typeof col.onClick === 'function'
      const classes = [
        col.align ? `text-${col.align}` : '',
        col.largeScreenOnly ? 'd-none d-sm-table-cell' : '',
        hasClickFn ? 'hover-text' : ''
      ].filter(Boolean).join(' ')

      return `<td class="${classes}">${cellContent}</td>`
    }).join('')
  }
}

/**
 * Backwards compatibility wrapper
 * @param {TableConfig} config
 * @returns {string}
 */
export function renderTable (config) {
  return new Table(config).toString()
}
