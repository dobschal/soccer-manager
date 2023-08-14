import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'

/**
 * @typedef {Object} TableHeadCellConfig
 * @property {string} name
 * @property {string} sortKey
 * @property {(val1: object, val2: object, isAscending: boolean) => number} sortFn
 * @property {boolean} largeScreenOnly
 * @property {'right'|'left'|'center'} align
 * @property {(dataItem: object, rowIndex: number, colIndex: number) => void} [onClick]
 */

/**
 * @typedef {Object} TableConfig
 * @property {Array<TableHeadCellConfig>} cols
 * @property {(data: object) => Array<string>} renderRow
 * @property {Array<object>} data
 * @property {(dataItem: object, rowIndex: number) => void} [onClick]
 */

/**
 * @param {TableConfig} config
 * @returns {string}
 */
export function renderTable (config) {
  const tableBodyId = generateId()
  const tableId = generateId()
  return `
    <table id="${tableId}" class="table${typeof config.onClick === 'function' ? 'table-hover' : ''}">
      <thead>
        <tr>        
          ${_renderHeaderCells(config, tableBodyId, tableId)}
        </tr>
      </thead>
      <tbody id="${tableBodyId}">
        ${_renderTableRows(config)}
      </tbody>
    </table>
  `
}

/**
 * @param {TableConfig} config
 * @param {Array<string>} rowConfig
 * @param {number} rowIndex
 * @returns {string}
 */
function _renderTableCells (config, rowConfig, rowIndex) {
  const dataItem = config.data[rowIndex]
  return rowConfig.map((cellContent, index) => {
    const colConfig = config.cols[index]
    const id = generateId()
    const hasClickFn = typeof colConfig.onClick === 'function'
    if (hasClickFn) {
      onClick(id, () => {
        colConfig.onClick(dataItem, rowIndex, index)
      })
    }
    return `<td id="${id}" class="
              ${colConfig.align ? 'text-' + colConfig.align : ''}
              ${colConfig.largeScreenOnly ? ' d-none d-sm-table-cell' : ''}
              ${hasClickFn ? ' hover-text' : ''}
            ">
        ${cellContent}
    </td>`
  }).join('')
}

/**
 * @param {TableConfig} config
 * @returns {string}
 */
function _renderTableRows (config) {
  return config.data
    .map((item, index) => {
      const rowConfig = config.renderRow(item)
      const dataItem = config.data[index]
      const id = generateId()
      if (typeof config.onClick === 'function') {
        onClick(id, () => {
          config.onClick(dataItem, index)
        })
      }
      item.htmlElementId = id
      return ` <tr id="${id}">
        ${_renderTableCells(config, rowConfig, index)}        
      </tr>`
    })
    .join('')
}

/**
 * @param {TableConfig} config
 * @param {string} tableBodyId
 * @param {string} tableId
 * @returns {string}
 */
function _renderHeaderCells (config, tableBodyId, tableId) {
  return config.cols
    .map(col => {
      const id = generateId()
      if (col.sortKey || col.sortFn) onClick(id, _sortTableClickFn(config, id, col, tableBodyId, tableId))
      return `<th scope="col" id="${id}" class="${col.align ? 'text-' + col.align : ''} ${col.sortKey || col.sortFn ? ' sort-header' : ''}${col.largeScreenOnly ? ' d-none d-sm-table-cell' : ''}">
          ${col.name}
      </th>`
    })
    .join('')
}

/**
 *
 * @param {TableConfig} config
 * @param {string} id
 * @param {TableHeadCellConfig} col
 * @param {string} tableBodyId
 * @param {string} tableId
 * @returns {() => void}
 * @private
 */
function _sortTableClickFn (config, id, col, tableBodyId, tableId) {
  let sortDirection
  return () => {
    document.querySelectorAll(`#${tableId} .sort-header`).forEach(element => {
      element.classList.remove('desc')
      element.classList.remove('asc')
    })
    config.data.sort((oa, ob) => {
      if (col.sortFn) {
        return col.sortFn(oa, ob, sortDirection !== 'DESC')
      }
      if (sortDirection === 'DESC') {
        return oa[col.sortKey] - ob[col.sortKey]
      }
      return ob[col.sortKey] - oa[col.sortKey]
    })
    sortDirection = sortDirection === 'DESC' ? 'ASC' : 'DESC'
    el(id).classList.add(sortDirection === 'DESC' ? 'desc' : 'asc')
    el(tableBodyId).append(...config.data.map(item => el(item.htmlElementId)))
  }
}
