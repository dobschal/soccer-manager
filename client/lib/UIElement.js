import { toast } from '../partials/toast.js'
import { el, generateId } from './html.js'
import { off, on } from './event.js'
import { onDOMNodeChanged } from './observeDOM.js'

export class UIElement {
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

  /** @abstract */
  get events () {
    return {}
  }

  /** @abstract */
  onQueryChanged () {}

  /** @abstract */
  onMounted () {}

  /** @abstract */
  onDestroy () {}

  /** @abstract */
  get template () {}

  /** @abstract */
  async load () {}

  /**
   * Render the current UIElement --> call load and return the template string then
   * @returns {Promise<string>}
   */
  async _render (skipLoad = false) {
    try {
      if (!skipLoad) await this.load()
      return this.template
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
      return ''
    }
  }

  /**
   * Render the current UIElement --> call load and return the template string then
   * This one is returning a placeholder string first and splices in the content once loaded.
   * @returns {string}
   */
  renderSync () {
    setTimeout(async () => {
      /** @type {HTMLTemplateElement} */
      const templateEl = el(this._renderId)
      await this._renderIntoTemplateEl(templateEl, false)
      this._renderIntoDOM(templateEl, templateEl)
    })
    return `<template id="${this._renderId}"></template>`
  }

  /**
   * Find the currently rendered DOM nodes for this UIElement and replace those
   * with the current template rendered.
   * @param {boolean} skipLoad - default is true to not reload the data
   */
  async update (skipLoad = true) {
    if (!this.isRendered) return
    const node = document.querySelector(this._elementQuery)
    const templateEl = document.createElement('template')
    await this._renderIntoTemplateEl(templateEl, skipLoad)
    this._renderIntoDOM(node, templateEl)
  }

  toString () {
    return this.renderSync()
  }

  get isRendered () {
    return Boolean(this._renderId && el(this._elementQuery))
  }

  isUIElement = true
  static isUIElement = true

  // Private API

  _renderId = generateId()

  /**
   * @param {HTMLTemplateElement} templateEl
   * @param {boolean} skipLoad
   * @private
   */
  async _renderIntoTemplateEl (templateEl, skipLoad) {
    if (!templateEl) return console.error('Template element isn\'t available for rendering')
    templateEl.innerHTML = await this._render(skipLoad)
    if (templateEl.content.children.length !== 1) throw new Error('UIElement needs to have exactly one element as root: ' + templateEl.content.children.length)
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

  _applyEventHandlers () {
    for (const elementQuery in this.events) {
      const element = el(`${this._elementQuery} ${elementQuery}`)
      if (!element) throw new Error('Cannot apply event listener. No element: ' + `${this._elementQuery} ${elementQuery}`)
      for (const eventName in this.events[elementQuery]) {
        element.addEventListener(eventName, this.events[elementQuery][eventName].bind(this))
      }
    }
  }

  get _elementQuery () {
    return `[data-render_id="${this._renderId}"]`
  }

  _onMounted (node) {
    console.log('Mounted: ', this.constructor.name)
    this._applyEventHandlers()
    this.onMounted()
  }

  _onDestroy (node) {
    console.log('Destroy: ', this.constructor.name)
    off(this._queryChangedEventId)
    this.onDestroy()
  }
}
