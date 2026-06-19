import { describe, it, expect, afterEach } from 'vitest'
import { UIElement } from '../../lib/UIElement.js'

describe('UIElement', () => {
  describe('#441 cross-page query-changed', () => {
    afterEach(() => {
      window.location.hash = ''
      document.body.innerHTML = ''
    })

    /**
     * Build a node inside a `[data-page]` wrapper, mirroring how the router
     * mounts pages.
     */
    function mountInPage (cacheKey) {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-page', cacheKey)
      const node = document.createElement('div')
      wrapper.appendChild(node)
      document.body.appendChild(wrapper)
      return node
    }

    it('treats a node as off-page when its wrapper path differs from the route', () => {
      window.location.hash = '#team?id=85'
      const node = mountInPage('user?id=131')
      expect(UIElement._isOnCurrentPage(node)).toBe(false)
    })

    it('treats a node as on-page when its wrapper path matches the route', () => {
      window.location.hash = '#user?id=131'
      const node = mountInPage('user?id=131')
      expect(UIElement._isOnCurrentPage(node)).toBe(true)
    })

    it('matches on path only, ignoring differing query params (same page, new id)', () => {
      window.location.hash = '#team?id=86'
      const node = mountInPage('team?id=85')
      expect(UIElement._isOnCurrentPage(node)).toBe(true)
    })

    it('matches paramless cache keys against the bare route path', () => {
      window.location.hash = '#dashboard'
      const node = mountInPage('dashboard')
      expect(UIElement._isOnCurrentPage(node)).toBe(true)
    })

    it('treats the empty hash as the dashboard route', () => {
      window.location.hash = ''
      const node = mountInPage('dashboard')
      expect(UIElement._isOnCurrentPage(node)).toBe(true)
    })

    it('treats nodes outside any page wrapper as always current', () => {
      window.location.hash = '#team?id=85'
      const node = document.createElement('div')
      document.body.appendChild(node)
      expect(UIElement._isOnCurrentPage(node)).toBe(true)
    })
  })
})
