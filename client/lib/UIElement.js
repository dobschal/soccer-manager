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
    if (typeof this.onQueryChanged === 'function') {
      this._queryChangedEventId = on('query-changed', this.onQueryChanged.bind(this))
    }
    onDOMNodeChanged(document.body, (addedNodes, removedNodes) => {
      for (const addedNode of addedNodes) {
        if (addedNode.dataset?.render_id === this._renderId && el(this._elementQuery)) {
          this._onMounted(addedNode)
          break
        }
      }
      for (const removedNode of removedNodes) {
        if (removedNode.dataset?.render_id === this._renderId && !el(this._elementQuery)) {
          this._onDestroy(removedNode)
          break
        }
      }
    })
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
   * @param {Record<string, string>} params
   * @returns {void}
   */
  onQueryChanged (params) {
    console.debug('onQueryChanged', params)
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
  onDestroy () {
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
   * @returns {Promise<void>}
   */
  async load () {
  }

  /**
   * Render the current UIElement --> call load and return the template string then
   * This one is returning a placeholder string first and splices in the content once loaded.
   * @returns {string}
   */
  renderSync () {
    let retries = 0
    const maxRetries = 500 // 5 seconds max wait
    const waitAndRender = async () => {
      /** @type {HTMLTemplateElement} */
      const templateEl = el(this._renderId)
      if (!templateEl) {
        if (++retries > maxRetries) {
          console.error('Template element never appeared in DOM for', this.constructor.name)
          return
        }
        // Template not in DOM yet (parent still rendering), wait and retry
        setTimeout(waitAndRender, 10)
        return
      }
      await this._load()
      await this._renderIntoTemplateEl(templateEl)
      this._renderIntoDOM(templateEl, templateEl)
    }
    setTimeout(waitAndRender)
    return `<template id="${this._renderId}"></template>`
  }

  /**
   * Find the currently rendered DOM nodes for this UIElement and replace those
   * with the current template rendered.
   * @param {boolean} reloadData - default is false to not reload the data
   */
  async update (reloadData = false) {
    if (!this.isRendered) return
    const node = document.querySelector(this._elementQuery)
    const templateEl = document.createElement('template')
    if (reloadData) await this._load()
    await this._renderIntoTemplateEl(templateEl)
    this._renderIntoDOM(node, templateEl)
    this._applyEventHandlers()
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
      this._showLoadingIndicator()
      await this.load()
    } catch (e) {
      console.error('Error on load: ', e)
      toast(e.message ?? 'Something went wrong', 'error')
    } finally {
      this._hideLoadingIndicator()
    }
  }

  /**
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
    for (const elementQuery in this.events) {
      // First try to find as a child element
      let element = el(`${this._elementQuery} ${elementQuery}`)
      // If not found, check if the root element itself matches the selector
      if (!element) {
        const rootEl = el(this._elementQuery)
        if (rootEl?.matches(elementQuery)) {
          element = rootEl
        }
      }
      if (!element) throw new Error('Cannot apply event listener. No element: ' + `${this._elementQuery} ${elementQuery}`)
      for (const eventName in this.events[elementQuery]) {
        element.addEventListener(eventName, this.events[elementQuery][eventName].bind(this))
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
   * @param {Node} node
   * @returns {void}
   * @private
   */
  _onMounted (_node) {
    if (this._isMounted) return // Skip if already mounted (this is an update, not initial mount)
    this._isMounted = true
    console.log('Mounted: ', this.constructor.name)
    this._applyEventHandlers()
    this._registerServerEventHandlers()
    this.onMounted()
  }

  /**
   * @param {Node} node
   * @returns {void}
   * @private
   */
  _onDestroy (_node) {
    this._isMounted = false
    console.log('Destroy: ', this.constructor.name)
    off(this._queryChangedEventId)
    this._unregisterServerEventHandlers()
    this.onDestroy()
  }

  /**
   * @returns {void}
   * @private
   */
  _showLoadingIndicator () {
    this._loadingIndicatorId = generateId()
    let neighborNode = el(this._elementQuery)
    if (!neighborNode?.parentElement) {
      neighborNode = el(this._renderId)
    } else {
      neighborNode.style.display = 'none'
    }

    // This ensures to have only one indicator in similar places
    const neighborIsTemplate = neighborNode?.tagName === 'TEMPLATE'
    if (neighborIsTemplate) {
      return
    }

    if (!neighborNode?.parentElement) {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="${this._loadingIndicatorId}" class="loading-indicator"></div>`
      )
    } else {
      const spinnerEl = document.createElement('div')
      spinnerEl.classList.add('loading-indicator-local')
      spinnerEl.id = this._loadingIndicatorId
      neighborNode.parentNode.insertBefore(
        spinnerEl,
        neighborNode
      )
    }
  }

  /**
   * @returns {void}
   * @private
   */
  _hideLoadingIndicator () {
    el(this._loadingIndicatorId)?.remove()
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
      console.log(`Registered server event handler: ${eventName} for ${this.constructor.name}`)
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
