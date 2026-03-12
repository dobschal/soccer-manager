import { UIElement } from '../lib/UIElement.js'

export class Button extends UIElement {
  /**
   * @param {string} text
   * @param {() => void} onClickHandler
   * @param {string} [type]
   * @param {string} [cssClass]
   */
  constructor (text, onClickHandler, type = 'primary', cssClass = '') {
    super()
    this.text = text
    this.onClickHandler = onClickHandler
    this.type = type
    this.cssClass = cssClass
  }

  /**
   * @returns {string}
   */
  get template () {
    return `<button class="btn btn-${this.type} ${this.cssClass}" type="button">${this.text}</button>`
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      button: {
        click: this.onClickHandler
      }
    }
  }
  
}

