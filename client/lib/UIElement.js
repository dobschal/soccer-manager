import { toast } from '../partials/toast.js'
import { el, generateId } from './html.js'
import { on } from './event.js'

export class UIElement {
  constructor (params = {}) {
    for (const paramsKey in params) {
      this[paramsKey] = params[paramsKey]
    }
    if (typeof this.onQueryChanged === 'function') {
      on('query-changed', this.onQueryChanged.bind(this))
    }
  }

  onQueryChanged () {}

  /**
   * @abstract
   * @returns {string}
   */
  get template () {
    return ''
  }

  /**
   * @returns {Promise}
   */
  async load () {}

  /**
   * Render the current UIElement --> call load and return the template string then
   * @returns {Promise<string>}
   */
  async render () {
    try {
      await this.load()
      return this.template
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
      return ''
    }
  }

  /**
   * Find the currently rendered DOM nodes for this UIElement and replace those
   * with the current template rendered.
   */
  update () {
    if (!this._renderId) return console.error('Called update on UIElement without having the UIElement rendered.')
    const nodes = document.querySelectorAll(`.render${this._renderId}`)
    if (nodes.length !== 1) throw new Error('UIElement needs to have exactly one element as root')
    const templateEl = document.createElement('template')
    templateEl.innerHTML = this.template
    templateEl.content.children[0].classList.add(`render${this._renderId}`)
    nodes.item(0).replaceWith(templateEl.content.childNodes.item(1))
  }

  static toString () {
    const uiElement = new this()
    return uiElement.toString()
  }

  toString () {
    const { template, id } = UIElement._renderAsync(this.render.bind(this))()
    this._renderId = id
    return template
  }

  /**
   * @param {function(...[*]): Promise<string>} renderFn
   * @returns {function(...[*]): {template: string, id: string}}
   * @private
   */
  static _renderAsync (renderFn) {
    return (...params) => {
      const id = generateId()

      setTimeout(async () => {
        /** @type {HTMLTemplateElement} */
        const wrapperElement = el(id)
        if (!wrapperElement) return
        wrapperElement.innerHTML = await renderFn(...params)
        if (wrapperElement.content.children.length !== 1) throw new Error('UIElement needs to have exactly one element as root: ' + wrapperElement.content.children.length)
        wrapperElement.content.children[0].classList.add(`render${id}`)
        // TODO: replaceWith leads to flickering...
        wrapperElement.replaceWith(...wrapperElement.content.childNodes)
      })

      return { template: `<template id="${id}"></template>`, id }
    }
  }

  isUIElement = true
  static isUIElement = true
}
