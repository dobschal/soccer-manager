import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { render } from '../../lib/render.js'
import { showPlayerModal } from '../../partials/playerModal.js'
import { euroFormat } from '../../util/currency.js'
import { renderTradesPage } from '../trades.js'

export async function renderMarket () {
  const { team } = await server.getMyTeam()
  const { offers, players, teams } = await server.getOffers()
  const offerList = _renderSellOfferList(offers, players, teams, team)
  return `
    <h2>Transfer market</h2>
    <p>Have a look on the transfer market to catch better players:</p>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" class="d-none d-sm-table-cell">Team</th>
          <th scope="col">Position</th>
          <th scope="col" class="text-right d-none d-sm-table-cell">Level</th>
          <th scope="col" class="text-right">Price</th>
          <th scope="col" class="d-none d-sm-table-cell"></th>
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
 * @param {TeamType[]} teams
 * @param {TeamType} team
 * @returns {string}
 * @private
 */
function _renderSellOfferList (offers, players, teams, team) {
  return offers
    .filter(o => o.type === 'sell' && o.from_team_id !== team.id)
    .map(offer => {
      const buyButtonId = generateId()
      const player = players.find(p => offer.player_id === p.id)
      const team = teams.find(t => t.id === player.team_id)

      onClick(buyButtonId, async () => {
        const { ok, value } = await showDialog({
          title: `Buy ${player.name}?`,
          text: 'Please enter the value of your offer to buy this player.',
          hasInput: true,
          inputType: 'number',
          inputLabel: 'Price',
          buttonText: 'Submit Offer'
        })
        if (!ok) return
        const price = Number(value)
        if (price <= 0) {
          toast('Please enter a valid price.', 'error')
          return
        }
        try {
          await server.addTradeOffer({
            player,
            price,
            type: 'buy'
          })
          toast('You\'ve sent a buy offer')
          render('#page', await renderTradesPage())
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong', 'error')
        }
      })

      const playerNameId = generateId()
      onClick(playerNameId, () => showPlayerModal(player))

      return `
      <tr>
        <td id="${playerNameId}" class="hover-text">${player.name}</td>
        <td class="d-none d-sm-table-cell">${team.name}</td>
        <td>${player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
        <td class="d-none d-sm-table-cell"><button id="${buyButtonId}" class="btn btn-primary">Buy</button></td>
      </tr>
    `
    })
    .join('')
}
