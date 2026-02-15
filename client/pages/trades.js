import { MyOffersPage } from './trades/myOffers.js'
import { renderMarket } from './trades/market.js'
import { renderIncomingOffers } from './trades/incoming.js'
import { renderTradeHistory } from './trades/tradeHistory.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { UIElement } from '../lib/UIElement.js'
import { FreePlayers } from './trades/freePlayers.js'
import { MarketValuesPage } from './trades/marketValues.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'

export class TradesPage extends UIElement {
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return super.events
  }

  /**
   * @returns {string}
   */
  get template () {
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
        ${this.page ?? t('common.loading')}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    await super.load()
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
    if (pageName && pageName === this.pageName) return
    this.pageName = pageName
    switch (this.pageName) {
      case 'incoming':
        this.page = await renderIncomingOffers()
        break
      case 'my_offers':
        this.page = new MyOffersPage(this)
        break
      case 'history':
        this.page = renderTradeHistory()
        break
      case 'free_players':
        this.page = new FreePlayers()
        break
      case 'market_values':
        this.page = new MarketValuesPage()
        break
      default:
        this.page = await renderMarket()
    }
    await this.update()
  }
}
