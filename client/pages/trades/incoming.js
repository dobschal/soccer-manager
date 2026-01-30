import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'

export class IncomingOffersPage extends UIElement {
  team = {}
  offers = []
  players = []
  teams = []

  /**
   * @returns {Object}
   */
  get events () {
    return {
      tbody: {
        click: async (event) => {
          const target = event.target
          const row = target.closest('[data-offer]')
          if (!row) return

          const idx = parseInt(row.dataset.offer, 10)
          const incomingOffers = this._filterIncomingBuyOffers()
          const offer = incomingOffers[idx]
          const player = this.players.find(p => p.id === offer.player_id)
          const fromTeam = this.teams.find(t => t.id === offer.from_team_id)

          if (target.closest('.player-name')) {
            setQueryParams({ player_id: player.id })
          } else if (target.closest('.btn-success')) {
            try {
              await server.acceptOffer(offer)
              toast(`You accepted the buy offer from ${fromTeam.name}`)
              await this.load()
              await this.update(true)
            } catch (e) {
              console.error(e)
              toast(e.message ?? 'Something went wrong', 'error')
            }
          } else if (target.closest('.btn-danger')) {
            try {
              await server.declineOffer(offer)
              toast(`You declined the buy offer from ${fromTeam.name}`)
              await this.load()
              await this.update(true)
            } catch (e) {
              console.error(e)
              toast(e.message ?? 'Something went wrong', 'error')
            }
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const incomingOffers = this._filterIncomingBuyOffers()
    const hasIncomingOffers = incomingOffers.length > 0

    return `
      <div>
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
            ${incomingOffers.map((o, idx) => this._renderOfferRow(o, idx)).join('')}
          </tbody>
        </table>
        <div class="row">
          <div class="col ${hasIncomingOffers ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">No incoming buy offers...</h4>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const teamResponse = await server.getMyTeam()
    this.team = teamResponse.team

    const offersResponse = await server.getOffers()
    this.offers = offersResponse.offers
    this.players = offersResponse.players
    this.teams = offersResponse.teams
  }


  /**
   * @returns {Array}
   */
  _filterIncomingBuyOffers () {
    return this.offers.filter(o => {
      const player = this.players.find(p => p.id === o.player_id)
      return player && player.team_id === this.team.id && o.type === 'buy'
    })
  }

  /**
   * @param {Object} offer
   * @param {number} index
   * @returns {string}
   */
  _renderOfferRow (offer, index) {
    const player = this.players.find(p => p.id === offer.player_id)
    const fromTeam = this.teams.find(t => t.id === offer.from_team_id)

    return `
      <tr data-offer="${index}">
        <td class="hover-text player-name">${player.name}</td>
        <td class="d-none d-sm-table-cell">${fromTeam.name}</td>
        <td class="d-none d-sm-table-cell">${player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${player.level}</td>
        <td class="text-right">${euroFormat.format(offer.offer_value)}</td>
        <td>
          <button class="btn btn-success"><i class="fa fa-check-circle-o" aria-hidden="true"></i></button>
          <button class="btn btn-danger"><i class="fa fa-times-circle-o" aria-hidden="true"></i></button>
        </td>
      </tr>
    `
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderIncomingOffers () {
  return new IncomingOffersPage().toString()
}
