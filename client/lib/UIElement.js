import { toast } from '../partials/toast.js'
import { el, generateId } from './html.js'
import { off, on } from './event.js'
import { onDOMNodeChanged } from './observeDOM.js'
import { offServerEvent, onServerEvent } from './websocket.js'

/**
 * @typedef {Record<string, Record<string, (event: Event) => void>>} UIElementEvents
 */

export class UIElement {
  /**
   * @param {Object} params
   */
  constructor (params = {}) {
    for (const paramsKey in params) {
      this[paramsKey] = params[paramsKey]
    }
    if (this.onQueryChanged !== UIElement.prototype.onQueryChanged) {
      const boundHandler = this.onQueryChanged.bind(this)
      this._queryChangedEventId = on('query-changed', (params) => {
        const node = document.querySelector(this._elementQuery)
        if (!node || UIElement._isInsideHiddenContainer(node)) return
        // The query-changed event is global, so cached pages from the route we
        // just left are still mounted (and, during the slide-out animation,
        // still visible) when it fires. If this element belongs to a page
        // whose path differs from the current route, ignore the event —
        // otherwise e.g. navigating #user?id=131 → #team?id=85 would feed the
        // team id into the still-mounted UserProfilePage. See #441.
        if (!UIElement._isOnCurrentPage(node)) return
        boundHandler(params)
      })
    }
    onDOMNodeChanged(document.body, (addedNodes, removedNodes) => {
      for (const addedNode of addedNodes) {
        if (addedNode.dataset?.render_id === this._renderId && el(this._elementQuery)) {
          this._onMounted()
          break
        }
      }
      for (const removedNode of removedNodes) {
        if (removedNode.dataset?.render_id === this._renderId && !el(this._elementQuery)) {
          this._onDestroy()
          break
        }
      }
    })
  }

  /**
   * @abstract
   * @returns {Promise<void>}
   */
  async load () {
  }

  /**
   * @abstract
   * @returns {string}
   */
  get template () {
    return ''
  }

  /**
   * @abstract
   * @returns {UIElementEvents}
   */
  get events () {
    return {}
  }

  /**
   * Override this getter to define server event handlers
   * Example:
   * get serverEvents() {
   *   return {
   *     NEW_SELL_TRADE_OFFER: () => this.update(true)
   *   }
   * }
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {}
  }

  /**
   * @abstract
   * @returns {void}
   */
  onMounted () {
  }

  /**
   * @abstract
   * @returns {void}
   */
  onUpdate () {
  }

  /**
   * @abstract
   * @param {Record<string, string>} _params
   * @returns {void}
   */
  onQueryChanged (_params) {
  }

  /**
   * @abstract
   * @returns {void}
   */
  onDestroy () {
  }

  /**
   * Render the current UIElement --> call load and return the template string then
   * This one is returning a placeholder string first and splices in the content once loaded.
   * @returns {string}
   */
  renderSync () {
    this._isMounted = false
    let retries = 0
    const maxRetries = 500 // 5 seconds max wait
    const waitAndRender = async () => {
      const placeholderEl = el(this._renderId)
      if (!placeholderEl) {
        if (++retries > maxRetries) {
          console.error('Placeholder element never appeared in DOM for', this.constructor.name)
          return
        }
        // Placeholder not in DOM yet (parent still rendering), wait and retry
        requestAnimationFrame(waitAndRender)
        return
      }
      await this._load()
      const templateEl = document.createElement('template')
      await this._renderIntoTemplateEl(templateEl)
      this._renderIntoDOM(placeholderEl, templateEl)
    }
    requestAnimationFrame(waitAndRender)
    if (this.showLoadingIndicator) {
      return `<div id="${this._renderId}" class="ui-element-loading">
        <div class="ui-element-loading-ball-wrapper">
          <div class="ui-element-loading-ball"><img src="assets/ball.svg" alt="loading"/></div>
          <div class="ui-element-loading-shadow"></div>
        </div>
      </div>`
    }
    return `<template id="${this._renderId}"></template>`
  }

  /**
   * Find the currently rendered DOM nodes for this UIElement and replace those
   * with the current template rendered.
   * @param {boolean} [reloadData] - default is false to not reload the data
   */
  async update (reloadData = false) {
    if (!this.isRendered) return
    const node = document.querySelector(this._elementQuery)
    const parent = node?.parentElement
    const lockedHeight = parent?.getBoundingClientRect().height
    const previousMinHeight = parent?.style.minHeight ?? ''
    if (parent && lockedHeight) {
      parent.style.minHeight = `${lockedHeight}px`
    }
    const templateEl = document.createElement('template')
    if (reloadData) await this._load()
    await this._renderIntoTemplateEl(templateEl)
    this._renderIntoDOM(node, templateEl)
    this._applyEventHandlers()
    this.onUpdate()
    if (parent && lockedHeight) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          parent.style.minHeight = previousMinHeight
        })
      })
    }
  }

  /**
   * @returns {string}
   */
  toString () {
    return this.renderSync()
  }

  /**
   * @returns {boolean}
   */
  get isRendered () {
    return Boolean(this._renderId && el(this._elementQuery))
  }

  isUIElement = true
  static isUIElement = true

  // // // // // // // // // // // // // // // // // // // // // // // // // // // // //
  // Private API // // // // // // // // // // // // // // // // // // // // // // // //
  // // // // // // // // // // // // // // // // // // // // // // // // // // // // //

  _renderId = generateId()
  _isMounted = false
  /** @type {AbortController|null} */
  _eventAbortController = null
  /** @type {Map<string, Function>} */
  _serverEventHandlers = new Map()

  /**
   * @param {HTMLTemplateElement} templateEl
   * @private
   */
  async _renderIntoTemplateEl (templateEl) {
    if (!templateEl) return console.error('Template element isn\'t available for rendering')
    templateEl.innerHTML = this.template
    if (templateEl.content.children.length !== 1) throw new Error('UIElement needs to have exactly one element as root: ' + templateEl.content.children.length)
  }

  async _load () {
    try {
      await this.load()
    } catch (e) {
      console.error('Error on load: ', e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * If this is called the first time for this instance, the target itself is a template element.
   * This target gets replaced with the actual content. The node inserted into the DOM gets the
   * same render_id as the template to be able to find it later for updates.
   * @param {HTMLElement} target
   * @param {HTMLTemplateElement} templateEl
   * @private
   */
  _renderIntoDOM (target, templateEl) {
    templateEl.content.children[0].setAttribute('data-render_id', this._renderId)
    target.replaceWith(templateEl.content.children[0])
  }

  /**
   * @returns {void}
   * @private
   */
  _applyEventHandlers () {
    // Abort previous event handlers to prevent duplicates
    if (this._eventAbortController) {
      this._eventAbortController.abort()
    }
    this._eventAbortController = new AbortController()
    const { signal } = this._eventAbortController

    for (const originalQuery in this.events) {
      let elementQuery = originalQuery
      const isOptional = elementQuery.toLowerCase().startsWith('(optional)')
      if (isOptional) {
        elementQuery = elementQuery.replace('(optional)', '').trim()
      }
      const rootEl = el(this._elementQuery)
      // Match every child node (class selectors with multiple instances must all be wired)
      const elements = rootEl ? Array.from(rootEl.querySelectorAll(elementQuery)) : []
      // Also include the root element itself if it matches the selector
      if (rootEl?.matches(elementQuery)) {
        elements.push(rootEl)
      }
      if (elements.length === 0) {
        if (!isOptional) {
          throw new Error('Cannot apply event listener. No element: ' + `${this._elementQuery} ${elementQuery}`)
        } else {
          continue
        }
      }
      for (const element of elements) {
        for (const eventName in this.events[originalQuery]) {
          element.addEventListener(eventName, this.events[originalQuery][eventName].bind(this), { signal })
        }
      }
    }
  }

  /**
   * @returns {string}
   * @protected
   */
  get _elementQuery () {
    return `[data-render_id="${this._renderId}"]`
  }

  /**
   * @returns {void}
   * @private
   */
  _onMounted () {
    if (this._isMounted) return // Skip if already mounted (this is an update, not initial mount)
    this._isMounted = true
    this._applyEventHandlers()
    this._registerServerEventHandlers()
    this.onMounted()
  }

  /**
   * @returns {void}
   * @private
   */
  _onDestroy () {
    this._isMounted = false
    console.log('🗑️Destroy: ', this.constructor.name)
    if (this._queryChangedEventId) {
      off(this._queryChangedEventId)
    }
    this._unregisterServerEventHandlers()
    this.onDestroy()
  }

  /**
   * Check if a node is inside a container hidden via inline styles
   * @param {HTMLElement} node
   * @returns {boolean}
   * @private
   */
  static _isInsideHiddenContainer (node) {
    let current = node.parentElement
    while (current && current !== document.body) {
      if (current.style.opacity === '0' || current.style.display === 'none') return true
      current = current.parentElement
    }
    return false
  }

  /**
   * Is the given node part of the page that matches the current route?
   * The router wraps every page in a `[data-page="<cacheKey>"]` element whose
   * cache key starts with the route path. Elements not inside any page wrapper
   * (e.g. layout chrome) are treated as always-current.
   * @param {HTMLElement} node
   * @returns {boolean}
   */
  static _isOnCurrentPage (node) {
    const pageWrapper = node.closest('[data-page]')
    if (!pageWrapper) return true
    const pagePath = (pageWrapper.getAttribute('data-page') || '').split('?')[0]
    const currentPath = window.location.hash.substring(1).split('?')[0] || 'dashboard'
    return pagePath === currentPath
  }

  /**
   * Register server event handlers defined in serverEvents getter
   * @returns {void}
   * @private
   */
  _registerServerEventHandlers () {
    const serverEvents = this.serverEvents
    for (const eventName in serverEvents) {
      const handler = serverEvents[eventName].bind(this)
      this._serverEventHandlers.set(eventName, handler)
      onServerEvent(eventName, handler)
    }
  }

  /**
   * Unregister all server event handlers
   * @returns {void}
   * @private
   */
  _unregisterServerEventHandlers () {
    for (const [eventName, handler] of this._serverEventHandlers) {
      offServerEvent(eventName, handler)
      console.log(`Unregistered server event handler: ${eventName} for ${this.constructor.name}`)
    }
    this._serverEventHandlers.clear()
  }
}
