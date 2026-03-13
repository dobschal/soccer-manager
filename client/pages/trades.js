import { MyOffersPage } from './trades/myOffers.js'
import { MarketPage } from './trades/market.js'
import { IncomingOffersPage } from './trades/incoming.js'
import { TradeHistoryPage } from './trades/tradeHistory.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { FreePlayers } from './trades/freePlayers.js'
import { MarketValuesPage } from './trades/marketValues.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class TradesPage extends TabbedPage {
  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#trades">${t('trades.market')}</a>
          <a class="nav-link ${this.subPage === 'incoming' ? 'active' : ''}" href="#trades?sub_page=incoming">${t('trades.incomingOffers')}</a>
          <a class="nav-link ${this.subPage === 'my_offers' ? 'active' : ''}" href="#trades?sub_page=my_offers">${t('trades.myOffers')}</a>
          <a class="nav-link ${this.subPage === 'history' ? 'active' : ''}" href="#trades?sub_page=history">${t('player.history')}</a>
          <a class="nav-link ${this.subPage === 'free_players' ? 'active' : ''}" href="#trades?sub_page=free_players">${t('trades.freePlayers')}</a>
          <a class="nav-link ${this.subPage === 'market_values' ? 'active' : ''}" href="#trades?sub_page=market_values">${t('trades.marketValues')}</a>
        </nav>
        ${this.renderSubPageContainer()}
      </div>
    `
  }
  onMounted () {
    void showTutorialIfNeeded('trades', this)
  }
  async onQueryChanged (params) {
    if (params.player_id) await showPlayerModal(Number(params.player_id))
    this._handleSubPageChange(params.sub_page)
  }
  get routeName () { return 'trades' }
  
  get defaultSubPageKey () { return 'market' }
  
  createSubPage (key) {
    switch (key) {
      case 'incoming': return new IncomingOffersPage()
      case 'my_offers': return new MyOffersPage()
      case 'history': return new TradeHistoryPage()
      case 'free_players': return new FreePlayers()
      case 'market_values': return new MarketValuesPage()
      default: return new MarketPage()
    }
  }
  
}
