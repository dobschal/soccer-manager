import { UIElement } from '../lib/UIElement.js'
import { generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'
import { StadiumSubPage } from './club/stadium.js'
import { BuildingsPage } from './club/buildings.js'
import { FinancesPage } from './club/finances.js'

export class ClubPage extends UIElement {
  subPage = null
  _subPageCache = {}
  _subPageContainerId = generateId()
  /** @type {StadiumSubPage|null} */
  _currentStadiumPage = null

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {}
  }

  /**
   * @returns {string}
   */
  get template () {
    const key = this.subPage || 'stadium'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#club">${t('stadium.tabStadium')}</a>
          <a class="nav-link ${this.subPage === 'buildings' ? 'active' : ''}" href="#club?sub_page=buildings">${t('stadium.tabBuildings')}</a>
          <a class="nav-link ${this.subPage === 'finances' ? 'active' : ''}" href="#club?sub_page=finances">${t('stadium.tabFinances')}</a>
        </nav>
        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    // Sub-pages handle their own data loading
  }

  _getOrCreateSubPage () {
    const key = this.subPage || 'stadium'
    if (key === 'stadium') {
      // Stadium tab has Three.js canvas — always recreate
      this._currentStadiumPage = new StadiumSubPage()
      return this._currentStadiumPage
    }
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    return this._subPageCache[key]
  }

  _createSubPage (key) {
    switch (key) {
      case 'buildings':
        return new BuildingsPage(this)
      case 'finances':
        return new FinancesPage()
      default:
        return new StadiumSubPage()
    }
  }

  _switchSubPage () {
    const container = document.getElementById(this._subPageContainerId)
    if (!container) return
    const key = this.subPage || 'stadium'

    // Cleanup old stadium sub-page when leaving
    if (this._currentStadiumPage) {
      this._currentStadiumPage.onDestroy()
      this._currentStadiumPage = null
    }

    container.querySelectorAll('[data-subpage]').forEach(w => {
      w.style.display = 'none'
    })

    // Stadium tab: always recreate (Three.js needs fresh canvas)
    if (key === 'stadium') {
      const oldWrapper = container.querySelector('[data-subpage="stadium"]')
      if (oldWrapper) oldWrapper.remove()
      this._currentStadiumPage = new StadiumSubPage()
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-subpage', 'stadium')
      wrapper.insertAdjacentHTML('afterbegin', String(this._currentStadiumPage))
      container.appendChild(wrapper)
      return
    }

    const existing = container.querySelector(`[data-subpage="${key}"]`)
    if (existing) {
      existing.style.display = ''
      const cached = this._subPageCache[key]
      if (cached?.update) cached.update()
      return
    }

    const subPage = this._getOrCreateSubPage()
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-subpage', key)
    wrapper.insertAdjacentHTML('afterbegin', String(subPage))
    container.appendChild(wrapper)
  }

  _updateNav () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href')
      const isActive = this.subPage
        ? href === `#club?sub_page=${this.subPage}`
        : href === '#club'
      link.classList.toggle('active', isActive)
    })
  }

  /**
   * @param {Object} params
   * @param {string} params.sub_page
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ sub_page: subPage }) {
    const newSubPage = subPage || null
    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      this._switchSubPage()
      this._updateNav()
    }
  }

  /**
   * Called when component is unmounted - cleanup Three.js resources
   */
  onDestroy () {
    if (this._currentStadiumPage) {
      this._currentStadiumPage.onDestroy()
      this._currentStadiumPage = null
    }
  }
}
