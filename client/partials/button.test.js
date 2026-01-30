import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock UIElement dependencies
vi.mock('../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-btn-id'),
  el: vi.fn()
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

import { Button, renderButton } from './button.js'

describe('Button UIElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  describe('Button class', () => {
    it('creates a Button instance with text', () => {
      const btn = new Button('Click Me', () => {})
      expect(btn.text).toBe('Click Me')
    })

    it('creates a Button instance with default primary type', () => {
      const btn = new Button('Click Me', () => {})
      expect(btn.type).toBe('primary')
    })

    it('creates a Button instance with custom type', () => {
      const btn = new Button('Delete', () => {}, 'danger')
      expect(btn.type).toBe('danger')
    })

    it('stores the click handler', () => {
      const handler = vi.fn()
      const btn = new Button('Click', handler)
      expect(btn.onClickHandler).toBe(handler)
    })

    it('has events getter for click handler', () => {
      const handler = vi.fn()
      const btn = new Button('Click', handler)
      expect(btn.events).toEqual({
        button: { click: handler }
      })
    })

    it('renders button HTML in template', () => {
      const btn = new Button('Click Me', () => {}, 'success')
      expect(btn.template).toContain('Click Me')
      expect(btn.template).toContain('btn-success')
      expect(btn.template).toContain('<button')
    })

    it('extends UIElement', () => {
      const btn = new Button('Click', () => {})
      expect(btn.isUIElement).toBe(true)
    })
  })

  describe('renderButton (backwards compatibility)', () => {
    it('returns a string', () => {
      const result = renderButton('Click', () => {})
      expect(typeof result).toBe('string')
    })

    it('returns template element for async rendering', () => {
      const result = renderButton('Click', () => {})
      expect(result).toContain('<template')
    })
  })
})
