import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { showDialog } from '../partials/dialog.js'
import { toast } from '../partials/toast.js'
import { render } from '../lib/render.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { renderButton } from '../partials/button.js'

export async function renderTradesPage () {
  const { team } = await server.getMyTeam()
  const { offers, players, teams } = await server.getOffers()
  const incomingOfferList = _renderIncomingOfferList(offers, players, teams, team)
  const offerList = _renderSellOfferList(offers, players, teams, team)
  const myOffersList = _renderMyOffersList(offers, players, teams, team)
  const hasIncomingOffers = _filterIncomingBuyOffers(offers, players, team).length > 0
  const hasOpenOffers = offers.filter(o => o.from_team_id === team.id).length > 0
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
    onClick(playerNameId, () => showPlayerModal(player))
    onClick(acceptButtonId, async () => {
      try {
        await server.acceptOffer({ offer: o })
        toast(`You accepted the buy offer from ${team.name}`)
        render('#page', await renderTradesPage())
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
          render('#page', await renderTradesPage())
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
      onClick(playerNameId, () => showPlayerModal(player))

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
