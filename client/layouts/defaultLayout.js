import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'

export class DefaultLayout extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const versionData = await server.getVersion()
    this._version = versionData.version
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="default-layout">
        <div class="centered-container" id="page"></div>
        <footer class="app-footer">
          <span class="text-muted">FootballManager.IO v${this._version}</span>
          <br>
          <a href="imprint.html" class="text-muted">${t('footer.imprintPrivacy')}</a>
        </footer>
      </div>
    `
  }
  _version = ''
  
}
