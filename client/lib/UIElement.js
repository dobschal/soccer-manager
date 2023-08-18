import { toast } from '../partials/toast.js'
import { renderAsync } from './renderAsync.js'

export class UIElement {
  constructor (params = {}) {
    for (const paramsKey in params) {
      this[paramsKey] = params[paramsKey]
    }
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
   * @returns {Promise}
   */
  async load () {}

  /**
   * @param {UIElement} uiElement
   * @returns {Promise<*|string>}
   */
  static async render (uiElement) {
    try {
      uiElement = uiElement ?? new this()
      await uiElement.load()
      return uiElement.template
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
      return ''
    }
  }

  static toString () {
    return renderAsync(this.render.bind(this))()
  }

  toString () {
    return renderAsync(UIElement.render)(this)
  }

  isUIElement = true
  static isUIElement = true
}
