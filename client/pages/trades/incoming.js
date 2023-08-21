import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { renderButton } from '../../partials/button.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'

export async function renderIncomingOffers () {
  const { team } = await server.getMyTeam()
  const { offers, players, teams } = await server.getOffers()
  const incomingOfferList = _renderIncomingOfferList(offers, players, teams, team)
  const hasIncomingOffers = _filterIncomingBuyOffers(offers, players, team).length > 0
  return `
    <h2>Incoming Offers</h2>
    <p>Someone wants to buy your players:</p>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col" class="d-none d-sm-table-cell">Team</th>
          <th scope="col" class="d-none d-sm-table-cell">Position</th>
          <th scope="col" class="text-right d-none d-sm-table-cell">Level</th>
          <th scope="col" class="text-right">Price</th>
          <th scope="col"></th>
        </tr>
      </thead>
      <tbody>
        ${incomingOfferList}
      </tbody>
    </table>
    <div class="row">
      <div class="col ${hasIncomingOffers ? 'hidden' : ''}">
        <h4 class="text-muted text-center mt-5 mb-5">No incoming buy offers...</h4>
      </div>
    </div>
  `
}

/**
 * @param {TradeOfferType[]} offers
 * @param {PlayerType[]} players
 * @param {TeamType} team
 * @returns {TradeOfferType[]}
 * @private
 */
function _filterIncomingBuyOffers (offers, players, team) {
  return offers
    .filter(o => {
      const player = players.find(p => p.id === o.player_id)
      return player.team_id === team.id && o.type === 'buy'
    })
}

/**
 * @param {TradeOfferType[]} offers
 * @param {PlayerType[]} players
 * @param {TeamType[]} teams
 * @param {TeamType} team
 * @returns {string}
 * @private
 */
function _renderIncomingOfferList (offers, players, teams, team) {
  return _filterIncomingBuyOffers(offers, players, team).map(o => {
    const acceptButtonId = generateId()
    const player = players.find(p => p.id === o.player_id)
    const team = teams.find(t => t.id === o.from_team_id)
    const playerNameId = generateId()
    onClick(playerNameId, () => setQueryParams({ player_id: player.id }))
    onClick(acceptButtonId, async () => {
      try {
        await server.acceptOffer({ offer: o })
        toast(`You accepted the buy offer from ${team.name}`)
        // render('#page', await renderTradesPage())
        //
        // TODO: Call update here
        //
        window.reload()
      } catch (e) {
        console.error(e)
        toast(e.message ?? 'Something went wrong', 'error')
      }
    })

    const declineButton = renderButton(
      '<i class="fa fa-times-circle-o" aria-hidden="true"></i>',
      async () => {
        try {
          await server.declineOffer({ offer: o })
          toast(`You declined the buy offer from ${team.name}`)
          // render('#page', await renderTradesPage())
          //
          // TODO: Call update here
          //
          window.reload()
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong', 'error')
        }
      },
      'danger')

    return `
        <tr>
          <td id="${playerNameId}" class="hover-text">${player.name}</td>
          <td class="d-none d-sm-table-cell">${team.name}</td>
          <td class="d-none d-sm-table-cell">${player.position}</td>
          <td class="text-right d-none d-sm-table-cell">${player.level}</td>
          <td class="text-right">${euroFormat.format(o.offer_value)}</td>
          <td>
            <button id="${acceptButtonId}" class="btn btn-success"><i class="fa fa-check-circle-o" aria-hidden="true"></i></button>
            ${declineButton}
          </td>
        </tr>
      `
  })
    .join('')
}
