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
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      button: {
        click: this.onClickHandler
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `<button class="btn btn-${this.type} ${this.cssClass}" type="button">${this.text}</button>`
  }
}

/**
 * @param {string} text
 * @param {() => void} _onClick
 * @param {string} [type]
 * @returns {string}
 */
export function renderButton (text, _onClick, type = 'primary') {
  return new Button(text, _onClick, type).toString()
}
