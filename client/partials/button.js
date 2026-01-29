import { UIElement } from '../lib/UIElement.js'

export class Button extends UIElement {
  constructor (text, onClickHandler, type = 'primary') {
    super()
    this.text = text
    this.onClickHandler = onClickHandler
    this.type = type
  }

  get events () {
    return {
      button: {
        click: this.onClickHandler
      }
    }
  }

  get template () {
    return `<button class="btn btn-${this.type}" type="button">${this.text}</button>`
  }
}

// Backwards compatibility wrapper
export function renderButton (text, _onClick, type = 'primary') {
  return new Button(text, _onClick, type).toString()
}
