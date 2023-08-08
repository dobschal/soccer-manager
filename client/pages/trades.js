import { renderMyOffers } from './trades/myOffers.js'
import { getQueryParams } from '../lib/router.js'
import { renderMarket } from './trades/market.js'
import { renderIncomingOffers } from './trades/incoming.js'
import { renderTradeHistory } from './trades/tradeHistory.js'

export async function renderTradesPage () {
  const params = getQueryParams()
  let page = ''
  switch (params.sub_page) {
    case 'incoming':
      page = await renderIncomingOffers()
      break
    case 'my_offers':
      page = await renderMyOffers()
      break
    case 'history':
      page = renderTradeHistory()
      break
    default:
      page = await renderMarket()
  }
  return `
    ${_renderNavigation(params.sub_page)}
    ${page}`
}

function _renderNavigation (page) {
  return `
    <nav class="nav nav-pills mb-2">
      <a class="nav-link ${!page ? 'active' : ''}" href="#trades">Market</a>
      <a class="nav-link ${page === 'incoming' ? 'active' : ''}" href="#trades?sub_page=incoming">Incoming</a>
      <a class="nav-link ${page === 'my_offers' ? 'active' : ''}" href="#trades?sub_page=my_offers">My Offers</a>
      <a class="nav-link ${page === 'history' ? 'active' : ''}" href="#trades?sub_page=history">History</a>
    </nav>

  `
}
