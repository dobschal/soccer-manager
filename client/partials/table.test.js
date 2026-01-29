import { describe, it, expect, vi, beforeEach } from 'vitest'

let idCounter = 0
vi.mock('../lib/html.js', () => ({
  generateId: vi.fn(() => `test-id-${idCounter++}`),
  el: vi.fn((query) => document.querySelector(query))
}))

vi.mock('../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('./toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../lib/router.js', () => ({
  getQueryParams: vi.fn().mockReturnValue({}),
  setQueryParams: vi.fn()
}))

import { Table, renderTable } from './table.js'
import { getQueryParams } from '../lib/router.js'

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
      expect(table.template).toContain('text-right')
    })

    it('applies largeScreenOnly class to cells', () => {
      const table = new Table({
        data: [{ value: 'test' }],
        cols: [{ name: 'Details', largeScreenOnly: true }],
        renderRow: () => ['Details here']
      })
      expect(table.template).toContain('d-none d-sm-table-cell')
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

  describe('renderTable (backwards compatibility)', () => {
    it('returns a string', () => {
      const result = renderTable({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      })
      expect(typeof result).toBe('string')
    })

    it('returns template element for async rendering', () => {
      const result = renderTable({
        data: [],
        cols: [{ name: 'Name' }],
        renderRow: () => ['Test']
      })
      expect(result).toContain('<template')
    })
  })
})
