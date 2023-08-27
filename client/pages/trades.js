import { MyOffersPage } from './trades/myOffers.js'
import { renderMarket } from './trades/market.js'
import { renderIncomingOffers } from './trades/incoming.js'
import { renderTradeHistory } from './trades/tradeHistory.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { UIElement } from '../lib/UIElement.js'
import { FreePlayers } from './trades/freePlayers.js'

export class TradesPage extends UIElement {
  get events () {
    return super.events
  }

  get template () {
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.pageName ? 'active' : ''}" href="#trades">Market</a>
          <a class="nav-link ${this.pageName === 'incoming' ? 'active' : ''}" href="#trades?sub_page=incoming">Incoming</a>
          <a class="nav-link ${this.pageName === 'my_offers' ? 'active' : ''}" href="#trades?sub_page=my_offers">My Offers</a>
          <a class="nav-link ${this.pageName === 'history' ? 'active' : ''}" href="#trades?sub_page=history">History</a>
          <a class="nav-link ${this.pageName === 'free-players' ? 'active' : ''}" href="#trades?sub_page=free_players">Free Players</a>
        </nav>
        ${this.page ?? 'Loading...'}
      </div>
    `
  }

  async load () {
    await super.load()
  }

  async onQueryChanged ({ sub_page: pageName, player_id: playerId }) {
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
      default:
        this.page = await renderMarket()
    }
    await this.update()
  }
}
