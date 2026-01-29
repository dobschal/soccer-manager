import { UIElement } from '../lib/UIElement.js'

export class DefaultLayout extends UIElement {
  get template () {
    return '<div class="centered-container" id="page"></div>'
  }
}

// Backwards compatibility
export function renderDefaultLayout () {
  return new DefaultLayout().toString()
}
