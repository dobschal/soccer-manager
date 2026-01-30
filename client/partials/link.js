import { UIElement } from '../lib/UIElement.js'
import { goTo } from '../lib/router.js'

export class Link extends UIElement {
  /**
   * @param {string} text
   * @param {string} path
   */
  constructor (text, path) {
    super()
    this.text = text
    this.path = path
  }

  /**
   * @returns {Object.<string, Object.<string, Function>>}
   */
  get events () {
    return {
      span: {
        click: () => goTo(this.path)
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `<span class="hover-text">${this.text}</span>`
  }
}

/**
 * @param {string} text
 * @param {string} path
 * @returns {string}
 */
export function renderLink (text, path) {
  return new Link(text, path).toString()
}
