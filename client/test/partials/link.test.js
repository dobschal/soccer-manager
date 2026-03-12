import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock UIElement dependencies
vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-link-id'),
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
  goTo: vi.fn()
}))

import { Link } from '../../partials/link.js'
import { goTo } from '../../lib/router.js'

describe('Link UIElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  describe('Link class', () => {
    it('creates a Link instance with text and path', () => {
      const link = new Link('Home', 'home')
      expect(link.text).toBe('Home')
      expect(link.path).toBe('home')
    })

    it('renders span with hover-text class', () => {
      const link = new Link('Team', 'team')
      expect(link.template).toContain('hover-text')
      expect(link.template).toContain('<span')
    })

    it('renders text content', () => {
      const link = new Link('My Team', 'my-team')
      expect(link.template).toContain('My Team')
    })

    it('has events getter for click handler', () => {
      const link = new Link('Home', 'home')
      expect(link.events).toHaveProperty('span')
      expect(link.events.span).toHaveProperty('click')
    })

    it('click handler navigates to path', () => {
      const link = new Link('Team', 'team?id=1')
      link.events.span.click()
      expect(goTo).toHaveBeenCalledWith('team?id=1')
    })

    it('extends UIElement', () => {
      const link = new Link('Home', 'home')
      expect(link.isUIElement).toBe(true)
    })
  })

})
