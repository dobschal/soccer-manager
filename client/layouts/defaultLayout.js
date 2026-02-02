import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'

export class DefaultLayout extends UIElement {
  _version = ''

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="default-layout">
        <div class="centered-container" id="page"></div>
        <footer class="app-footer">
          <span class="text-muted">SoccerManagerIO v${this._version}</span>
        </footer>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const versionData = await server.getVersion()
    this._version = versionData.version
  }
}

// Backwards compatibility
/**
 * @returns {string}
 */
export function renderDefaultLayout () {
  return new DefaultLayout().toString()
}
