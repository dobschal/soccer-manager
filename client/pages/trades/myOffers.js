import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { showPlayerModal } from '../../partials/playerModal.js'
import { server } from '../../lib/gateway.js'
import { render } from '../../lib/render.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../util/currency.js'
import { renderTradesPage } from '../trades.js'
import { setQueryParams } from '../../lib/router.js'

export async function renderMyOffers () {
  const { team } = await server.getMyTeam()
  const { offers, players, teams } = await server.getOffers()
  const myOffersList = _renderMyOffersList(offers, players, teams, team)
  const hasOpenOffers = offers.filter(o => o.from_team_id === team.id).length > 0
  return `
    <h2>My Offers</h2>
    <p>Here are the offers you made:</p>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Name</th>
          <th scope="col" class="d-none d-sm-table-cell">Team</th>
          <th scope="col" class="d-none d-sm-table-cell">Position</th>                    
          <th scope="col" class="text-right d-none d-sm-table-cell">Level</th>
          <th scope="col" class="text-right">Price</th>
          <th scope="col"></th>
        </tr>
      </thead>
      <tbody>
        ${myOffersList}
      </tbody>
    </table>
    <div class="row">
      <div class="col ${hasOpenOffers ? 'hidden' : ''}">
        <h4 class="text-muted text-center mt-5 mb-5">No open offers from you...</h4>
      </div>
    </div>
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
function _renderMyOffersList (offers, players, teams, team) {
  return offers
    .filter(o => o.from_team_id === team.id)
    .map(offer => {
      const player = players.find(p => offer.player_id === p.id)
      const team = teams.find(t => t.id === player.team_id)
      const rowId = generateId()

      const playerNameId = generateId()
      onClick(playerNameId, () => setQueryParams({ player_id: player.id }))

      const cancelButtonId = generateId()
      onClick(cancelButtonId, async () => {
        try {
          await server.cancelOffer({ offer })
          render('#page', await renderTradesPage())
        } catch (e) {
          toast(e.message ?? 'Something went wrong', 'error')
        }
      })

      return `
      <tr id="${rowId}">
        <td><span class="badge badge-${offer.type === 'sell' ? 'secondary' : 'primary'}">${offer.type}</span></td>
        <td class="hover-text" id="${playerNameId}">${player.name}</td>
        <td class="d-none d-sm-table-cell">${offer.type === 'sell' ? '' : team.name}</td>
        <td class="d-none d-sm-table-cell">${player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
        <td>
            <button id="${cancelButtonId}" type="button" class="btn btn-danger">
                <i class="fa fa-times-circle-o" aria-hidden="true"></i>
            </button>
        </td>
      </tr>
    `
    })
    .join('')
}
