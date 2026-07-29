import { describe, it, expect, afterEach, vi } from 'vitest'
import { UIElement } from '../../lib/UIElement.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'

describe('UIElement', () => {
  describe('serverEvents validation', () => {
    it('throws when a subclass subscribes to an unknown event name', () => {
      class BadElement extends UIElement {
        get serverEvents () {
          return { NOT_A_REAL_EVENT: () => {} }
        }
      }
      const el = new BadElement()
      expect(() => el._registerServerEventHandlers()).toThrow(/Unknown server event/)
    })

    it('accepts subscriptions to registered event names', () => {
      class GoodElement extends UIElement {
        get serverEvents () {
          return { [SERVER_EVENTS.BALANCE_UPDATED.name]: () => {} }
        }
      }
      const el = new GoodElement()
      expect(() => el._registerServerEventHandlers()).not.toThrow()
      el._unregisterServerEventHandlers()
    })
  })

  describe('updateIndicator', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('adds ui-element-updating class during reload when updateIndicator is set', async () => {
      let resolveLoad
      class Refreshing extends UIElement {
        async load () {
          await new Promise(resolve => { resolveLoad = resolve })
        }
        get template () { return '<div class="target">hello</div>' }
        updateIndicator = true
        
      }
      const el = new Refreshing()
      const host = document.createElement('div')
      document.body.appendChild(host)
      host.innerHTML = `<div class="target" data-render_id="${el._renderId}">hello</div>`

      const updatePromise = el.update(true)
      // Class must appear before load resolves.
      const node = document.querySelector(`[data-render_id="${el._renderId}"]`)
      expect(node.classList.contains('ui-element-updating')).toBe(true)
      resolveLoad()
      await updatePromise
    })

    it('does not add ui-element-updating class when updateIndicator stays false', async () => {
      class Silent extends UIElement {
        get template () { return '<div class="target">hi</div>' }
      }
      const el = new Silent()
      const host = document.createElement('div')
      document.body.appendChild(host)
      host.innerHTML = `<div class="target" data-render_id="${el._renderId}">hi</div>`

      await el.update(true)
      // Reload finished; check that no lingering class was ever attached.
      const node = document.querySelector(`[data-render_id="${el._renderId}"]`)
      expect(node.classList.contains('ui-element-updating')).toBe(false)
    })
  })

  describe('load isUpdate flag', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('passes false to load on initial mount and true on update(true)', async () => {
      const loadSpy = vi.fn(async () => {})
      class Recorder extends UIElement {
        async load (isUpdate) { loadSpy(isUpdate) }
        get template () { return '<div class="target">x</div>' }
        
      }
      const el = new Recorder()
      const host = document.createElement('div')
      document.body.appendChild(host)
      host.innerHTML = `<div class="target" data-render_id="${el._renderId}">x</div>`

      await el._load()
      await el.update(true)

      expect(loadSpy).toHaveBeenCalledTimes(2)
      expect(loadSpy.mock.calls[0][0]).toBe(false)
      expect(loadSpy.mock.calls[1][0]).toBe(true)
    })
  })

  describe('_applyEventHandlers', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('bails quietly when the root element has been detached mid-update', () => {
      // The node the render_id points to is gone (navigation / parent
      // re-render). Wiring required selectors must not throw.
      class Detached extends UIElement {
        get template () { return '<div class="root"><button class="btn">x</button></div>' }
        get events () { return { '.btn': { click: () => {} } } }
      }
      const el = new Detached()
      // No node with el._renderId exists in the DOM.
      expect(() => el._applyEventHandlers()).not.toThrow()
    })

    it('still throws when a required child selector is missing under an existing root', () => {
      class Mismatch extends UIElement {
        get template () { return '<div class="root"></div>' }
        get events () { return { '.missing': { click: () => {} } } }
      }
      const el = new Mismatch()
      // Skip the mount observer so only our direct call exercises the throw
      // (otherwise the async _onMounted would rethrow unhandled).
      el._isMounted = true
      const host = document.createElement('div')
      document.body.appendChild(host)
      host.innerHTML = `<div class="root" data-render_id="${el._renderId}"></div>`
      expect(() => el._applyEventHandlers()).toThrow(/Cannot apply event listener/)
    })

    it('does not throw for a missing (optional) child selector', () => {
      class Opt extends UIElement {
        get template () { return '<div class="root"></div>' }
        get events () { return { '(optional).missing': { click: () => {} } } }
      }
      const el = new Opt()
      const host = document.createElement('div')
      document.body.appendChild(host)
      host.innerHTML = `<div class="root" data-render_id="${el._renderId}"></div>`
      expect(() => el._applyEventHandlers()).not.toThrow()
    })
  })

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
