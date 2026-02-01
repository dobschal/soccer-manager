import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

import { DefaultLayout, renderDefaultLayout } from '../../layouts/defaultLayout.js'

describe('DefaultLayout', () => {
  describe('DefaultLayout class', () => {
    it('template contains centered-container class', () => {
      const layout = new DefaultLayout()
      expect(layout.template).toContain('class="centered-container"')
    })

    it('template contains id "page"', () => {
      const layout = new DefaultLayout()
      expect(layout.template).toContain('id="page"')
    })

    it('extends UIElement', () => {
      const layout = new DefaultLayout()
      expect(layout.isUIElement).toBe(true)
    })
  })

  describe('renderDefaultLayout (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderDefaultLayout).toBe('function')
    })
  })
})
