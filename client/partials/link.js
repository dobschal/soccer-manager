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
   * @returns {string}
   */
  get template () {
    return `<span class="hover-text">${this.text}</span>`
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      span: {
        click: () => goTo(this.path)
      }
    }
  }
  
}

