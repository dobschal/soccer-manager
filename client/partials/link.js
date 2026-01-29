import { UIElement } from '../lib/UIElement.js'
import { goTo } from '../lib/router.js'

export class Link extends UIElement {
  constructor (text, path) {
    super()
    this.text = text
    this.path = path
  }

  get events () {
    return {
      span: {
        click: () => goTo(this.path)
      }
    }
  }

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
