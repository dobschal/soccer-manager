import { describe, it, expect, vi, beforeEach } from 'vitest'

let idCounter = 0
vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn(() => `test-id-${idCounter++}`),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/router.js', () => ({
  getQueryParams: vi.fn().mockReturnValue({}),
  setQueryParams: vi.fn()
}))

import { Table } from '../../partials/table.js'
import { el } from '../../lib/html.js'
import { getQueryParams } from '../../lib/router.js'

describe('Table UIElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    getQueryParams.mockReturnValue({})
  })

  describe('Table class', () => {
    it('creates a Table instance with config', () => {
      const config = {
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      }
      const table = new Table(config)
      expect(table.config).toBe(config)
    })

    it('renders table element in template', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      })
      expect(table.template).toContain('<table')
      expect(table.template).toContain('</table>')
    })

    it('renders table headers', () => {
      const table = new Table({
        data: [],
        cols: [
          { name: 'Name' },
          { name: 'Position' },
          { name: 'Level' }
        ],
        renderRow: () => ['Test', 'CM', '5']
      })
      const template = table.template
      expect(template).toContain('<th')
      expect(template).toContain('Name')
      expect(template).toContain('Position')
      expect(template).toContain('Level')
    })

    it('renders table rows with data', () => {
      const table = new Table({
        data: [
          { name: 'Player 1' },
          { name: 'Player 2' }
        ],
        cols: [{ name: 'Name' }],
        renderRow: (item) => [item.name]
      })
      const template = table.template
      expect(template).toContain('Player 1')
      expect(template).toContain('Player 2')
      expect(template).toContain('<tr')
      expect(template).toContain('<td')
    })

    it('applies text alignment to cells', () => {
      const table = new Table({
        data: [{ price: 100 }],
        cols: [{ name: 'Price', align: 'right' }],
        renderRow: () => ['$100']
      })
      expect(table.template).toContain('text-end')
    })

    it('wraps table in horizontal-scrollable-table div', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      })
      expect(table.template).toContain('horizontal-scrollable-table')
      expect(table.template).toContain('wide-on-mobile')
    })

    it('supports rowClass callback', () => {
      const table = new Table({
        data: [{ active: true }],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test'],
        rowClass: (item) => item.active ? 'table-info' : ''
      })
      expect(table.template).toContain('table-info')
    })

    it('supports rowAttrs callback', () => {
      const table = new Table({
        data: [{ id: 42 }],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test'],
        rowAttrs: (item) => `data-id="${item.id}"`
      })
      expect(table.template).toContain('data-id="42"')
    })

    it('supports extra classes via config.classes', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test'],
        classes: 'table-sm table-striped'
      })
      expect(table.template).toContain('table-sm')
      expect(table.template).toContain('table-striped')
    })

    it('adds sort-header class for sortable columns', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Price', sortKey: 'price' }],
        renderRow: () => ['$100']
      })
      expect(table.template).toContain('sort-header')
    })

    it('adds table-hover class when onClick is provided', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test'],
        onClick: vi.fn()
      })
      expect(table.template).toContain('table-hover')
    })

    it('extends UIElement', () => {
      const table = new Table({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      })
      expect(table.isUIElement).toBe(true)
    })
  })

  describe('_sortTable', () => {
    /**
     * Helper: create a Table, mount its template in the DOM, and wire up el()
     */
    function mountTable (config) {
      const table = new Table(config)
      const wrapper = document.createElement('div')
      wrapper.innerHTML = table.template
      const rootEl = wrapper.firstElementChild
      rootEl.setAttribute('data-render_id', table._renderId)
      document.body.appendChild(rootEl)
      el.mockImplementation((query) => document.querySelector(query))
      return { table, rootEl }
    }

    it('sorts data in ascending order by sortKey', () => {
      const { table } = mountTable({
        data: [{ name: 'B', level: 10 }, { name: 'A', level: 3 }],
        cols: [{ name: 'Name' }, { name: 'Level', sortKey: 'level' }],
        renderRow: (item) => [item.name, String(item.level)]
      })

      table._sortTable(1, 'ASC')

      expect(table.config.data[0].level).toBe(3)
      expect(table.config.data[1].level).toBe(10)
    })

    it('sorts data in descending order by sortKey', () => {
      const { table } = mountTable({
        data: [{ name: 'A', level: 3 }, { name: 'B', level: 10 }],
        cols: [{ name: 'Name' }, { name: 'Level', sortKey: 'level' }],
        renderRow: (item) => [item.name, String(item.level)]
      })

      table._sortTable(1, 'DESC')

      expect(table.config.data[0].level).toBe(10)
      expect(table.config.data[1].level).toBe(3)
    })

    it('uses custom sortFn when provided', () => {
      const { table } = mountTable({
        data: [{ name: 'Zebra' }, { name: 'Apple' }],
        cols: [{
          name: 'Name',
          sortFn: (a, b, isAsc) => isAsc
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name)
        }],
        renderRow: (item) => [item.name]
      })

      table._sortTable(0, 'ASC')
      expect(table.config.data[0].name).toBe('Apple')

      table._sortTable(0, 'DESC')
      expect(table.config.data[0].name).toBe('Zebra')
    })

    it('updates tbody innerHTML after sorting', () => {
      const { table, rootEl } = mountTable({
        data: [{ name: 'B', level: 10 }, { name: 'A', level: 3 }],
        cols: [{ name: 'Name' }, { name: 'Level', sortKey: 'level' }],
        renderRow: (item) => [item.name, String(item.level)]
      })

      table._sortTable(1, 'ASC')

      const tbody = rootEl.querySelector('tbody')
      const rows = tbody.querySelectorAll('tr')
      expect(rows[0].textContent).toContain('A')
      expect(rows[0].textContent).toContain('3')
      expect(rows[1].textContent).toContain('B')
      expect(rows[1].textContent).toContain('10')
    })

    it('adds sort direction class to the sorted column header', () => {
      const { table, rootEl } = mountTable({
        data: [{ level: 5 }, { level: 2 }],
        cols: [{ name: 'Level', sortKey: 'level' }],
        renderRow: (item) => [String(item.level)]
      })

      table._sortTable(0, 'ASC')
      const th = rootEl.querySelector('th')
      expect(th.classList.contains('asc')).toBe(true)

      table._sortTable(0, 'DESC')
      expect(th.classList.contains('desc')).toBe(true)
      expect(th.classList.contains('asc')).toBe(false)
    })

    it('does not destroy the scroll container when re-rendering tbody', () => {
      const { table, rootEl } = mountTable({
        data: [{ name: 'B', level: 10 }, { name: 'A', level: 3 }],
        cols: [{ name: 'Name' }, { name: 'Level', sortKey: 'level' }],
        renderRow: (item) => [item.name, String(item.level)]
      })

      // The rootEl IS the .horizontal-scrollable-table div
      const scrollContainer = rootEl

      table._sortTable(1, 'ASC')

      // The scroll container must be the same DOM node (not replaced)
      const currentRoot = document.querySelector(`[data-render_id="${table._renderId}"]`)
      expect(currentRoot).toBe(scrollContainer)
    })
  })

})
