import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'

export async function renderTradesPage () {
  const { offers, players } = await server.getOffers()
  const offerList = await _renderOffList(offers, players)
  return `
    <h2>Offers</h2>
    <table class="table table-hover">
      <thead>
        <tr>          
          <th scope="col">Name</th>
          <th scope="col">Position</th>                    
          <th scope="col" class="text-right">Level</th>
          <th scope="col" class="text-right">Price</th>          
        </tr>
      </thead>
      <tbody>
        ${offerList}
      </tbody>
    </table>
  `
}

/**
 * @param {TradeOfferType[]} offers
 * @param {PlayerType[]} players
 * @returns {Promise<string>}
 * @private
 */
async function _renderOffList (offers, players) {
  return offers.filter(o => o.type === 'sell').map(offer => {
    const player = players.find(p => offer.player_id === p.id)
    return `
      <tr>
        <td>${player.name}</td>
        <td>${player.position}</td>
        <td class="text-right">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
      </tr>
    `
  }).join('')
}
