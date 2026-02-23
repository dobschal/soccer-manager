import { MyOffersPage } from './trades/myOffers.js'
import { renderMarket } from './trades/market.js'
import { renderIncomingOffers } from './trades/incoming.js'
import { renderTradeHistory } from './trades/tradeHistory.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { FreePlayers } from './trades/freePlayers.js'
import { MarketValuesPage } from './trades/marketValues.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'

export class TradesPage extends UIElement {
  pageName = null
  _subPageCache = {}
  _subPageContainerId = generateId()

  /**
   * @returns {string}
   */
  get template () {
    const key = this.pageName || 'market'
    const subPage = this._subPageCache[key] ?? t('common.loading')
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.pageName ? 'active' : ''}" href="#trades">${t('trades.market')}</a>
          <a class="nav-link ${this.pageName === 'incoming' ? 'active' : ''}" href="#trades?sub_page=incoming">${t('trades.incomingOffers')}</a>
          <a class="nav-link ${this.pageName === 'my_offers' ? 'active' : ''}" href="#trades?sub_page=my_offers">${t('trades.myOffers')}</a>
          <a class="nav-link ${this.pageName === 'history' ? 'active' : ''}" href="#trades?sub_page=history">${t('player.history')}</a>
          <a class="nav-link ${this.pageName === 'free_players' ? 'active' : ''}" href="#trades?sub_page=free_players">${t('trades.freePlayers')}</a>
          <a class="nav-link ${this.pageName === 'market_values' ? 'active' : ''}" href="#trades?sub_page=market_values">${t('trades.marketValues')}</a>
        </nav>
        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  async load () {
    const key = this.pageName || 'market'
    if (!this._subPageCache[key]?.isUIElement) {
      this._subPageCache[key] = await this._createSubPage(key)
    }
  }

  /**
   * @param {string} key
   * @returns {Promise<UIElement|string>}
   */
  async _createSubPage (key) {
    switch (key) {
      case 'incoming':
        return await renderIncomingOffers()
      case 'my_offers':
        return new MyOffersPage(this)
      case 'history':
        return renderTradeHistory()
      case 'free_players':
        return new FreePlayers()
      case 'market_values':
        return new MarketValuesPage()
      default:
        return await renderMarket()
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.pageName || 'market'

    container.querySelectorAll('[data-subpage]').forEach(w => {
      w.style.display = 'none'
    })

    const existing = container.querySelector(`[data-subpage="${key}"]`)
    if (existing) {
      existing.style.display = ''
      const cached = this._subPageCache[key]
      if (cached?.update) cached.update()
      return
    }

    const subPage = await this._createSubPage(key)
    this._subPageCache[key] = subPage
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
      const isActive = this.pageName
        ? href === `#trades?sub_page=${this.pageName}`
        : href === '#trades'
      link.classList.toggle('active', isActive)
    })
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('trades', this)
  }

  /**
   * @param {Object} params
   * @param {string} params.sub_page
   * @param {string} params.player_id
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    sub_page: pageName,
    player_id: playerId
  }) {
    if (playerId) await showPlayerModal(Number(playerId))
    const newPageName = pageName || null
    if (newPageName === this.pageName) return
    this.pageName = newPageName
    await this._switchSubPage()
    this._updateNav()
  }
}
