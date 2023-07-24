import { server } from '../lib/gateway.js'
import { euroFormat } from '../util/currency.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { showDialog } from '../partials/dialog.js'
import { toast } from '../partials/toast.js'
import { render } from '../lib/render.js'
import { showPlayerModal } from '../partials/playerModal.js'

export async function renderTradesPage () {
  const { team } = await server.getMyTeam()
  const { offers, players, teams } = await server.getOffers()
  const incomingOfferList = await _renderIncomingOfferList(offers, players, teams, team)
  const offerList = await _renderSellOfferList(offers, players, teams, team)
  const myOffersList = await _renderMyOffersList(offers, players, teams, team)
  return `
    <h2>Incoming Offers</h2>
    <p>Someone wants to buy your players:</p>
    <table class="table">
      <thead>
        <tr>          
          <th scope="col">Name</th>
          <th scope="col">Team</th>
          <th scope="col">Position</th>                    
          <th scope="col" class="text-right">Level</th>
          <th scope="col" class="text-right">Price</th>
          <th scope="col"></th>             
        </tr>
      </thead>
      <tbody>
        ${incomingOfferList}
      </tbody>
    </table>
    <h2>Transfer market</h2>
    <p>Have a look on the transfer market to catch better players:</p>
    <table class="table">
      <thead>
        <tr>          
          <th scope="col">Name</th>
          <th scope="col">Team</th>
          <th scope="col">Position</th>                    
          <th scope="col" class="text-right">Level</th>
          <th scope="col" class="text-right">Price</th>
          <th scope="col"></th>             
        </tr>
      </thead>
      <tbody>
        ${offerList}
      </tbody>
    </table>
    <h2>My Offers</h2>
    <p>Here are the offers you made:</p>
    <table class="table">
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col">Name</th>
          <th scope="col">Team</th>
          <th scope="col">Position</th>                    
          <th scope="col" class="text-right">Level</th>
          <th scope="col" class="text-right">Price</th>          
        </tr>
      </thead>
      <tbody>
        ${myOffersList}
      </tbody>
    </table>
  `
}

/**
 * @param {TradeOfferType[]} offers
 * @param {PlayerType[]} players
 * @param {TeamType[]} teams
 * @param {TeamType} team
 * @returns {Promise<string>}
 * @private
 */
function _renderIncomingOfferList (offers, players, teams, team) {
  return offers
    .filter(o => {
      const player = players.find(p => p.id === o.player_id)
      return player.team_id === team.id && o.type === 'buy'
    })
    .map(o => {
      const acceptButtonId = generateId()
      const player = players.find(p => p.id === o.player_id)
      const team = teams.find(t => t.id === player.team_id)
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
      return `
        <tr>
          <td id="${playerNameId}" class="hover-text">${player.name}</td>
          <td>${team.name}</td>
          <td>${player.position}</td>
          <td class="text-right">${player.level}</td>
          <td class="text-right">${euroFormat.format(o.offer_value)}</td>
          <td><button id="${acceptButtonId}" class="btn btn-primary">Accept</button></td>
        </tr>
      `
    })
    .join(', ')
}

/**
 * @param {TradeOfferType[]} offers
 * @param {PlayerType[]} players
 * @param {TeamType[]} teams
 * @param {TeamType} team
 * @returns {Promise<string>}
 * @private
 */
async function _renderSellOfferList (offers, players, teams, team) {
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
        <td>${team.name}</td>
        <td>${player.position}</td>
        <td class="text-right">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
        <td><button id="${buyButtonId}" class="btn btn-primary">Buy</button></td>
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
 * @returns {Promise<string>}
 * @private
 */
async function _renderMyOffersList (offers, players, teams, team) {
  return offers
    .filter(o => o.from_team_id === team.id)
    .map(offer => {
      const player = players.find(p => offer.player_id === p.id)
      const team = teams.find(t => t.id === player.team_id)

      const playerNameId = generateId()
      onClick(playerNameId, () => showPlayerModal(player))

      return `
      <tr>
        <td><span class="badge badge-${offer.type === 'sell' ? 'secondary' : 'primary'}">${offer.type}</span></td>
        <td class="hover-text" id="${playerNameId}">${player.name}</td>
        <td>${offer.type === 'sell' ? '' : team.name}</td>
        <td>${player.position}</td>
        <td class="text-right">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
      </tr>
    `
    })
    .join('')
}
