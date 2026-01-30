import { UIElement } from '../lib/UIElement.js'

export class DefaultLayout extends UIElement {
  /**
   * @returns {string}
   */
  get template () {
    return '<div class="centered-container" id="page"></div>'
  }
}

// Backwards compatibility
/**
 * @returns {string}
 */
export function renderDefaultLayout () {
  return new DefaultLayout().toString()
}
