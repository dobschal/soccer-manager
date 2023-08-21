import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'

export class MyOffersPage extends UIElement {
  /**
   * @param {UIElement} parentInstance
   */
  constructor (parentInstance) {
    super()
    this.parentInstance = parentInstance
  }

  get template () {
    return `
      <div>
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
            ${this.offers.map(offer => new MyOfferListItem(offer, this.parentInstance)).join('')}
          </tbody>
        </table>
        <div class="row">
          <div class="col ${this.hasOpenOffers ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">No open offers from you...</h4>
          </div>
        </div>
      </div>
    `
  }

  onQueryChanged () {
    super.onQueryChanged()
  }

  get events () {
    return super.events
  }

  async load () {
    const response = await server.getMyTeam()
    this.team = response.team
    const { offers } = await server.getOffers()
    this.offers = offers.filter(o => o.from_team_id === this.team.id)
  }

  get hasOpenOffers () {
    return this.offers.length > 0
  }
}

class MyOfferListItem extends UIElement {
  /**
   * @param {TradeOfferType} offer
   * @param {UIElement} parentInstance
   */
  constructor (offer, parentInstance) {
    super()
    this.offer = offer
    this.parentInstance = parentInstance
  }

  get events () {
    return {
      'td[data-show-player]': {
        click: () => setQueryParams({ player_id: this.player.id })
      },
      'button[data-cancel]': {
        click: this._cancelOffer
      }
    }
  }

  get template () {
    return `
      <tr >
        <td><span class="badge bg-${this.offer.type === 'sell' ? 'secondary' : 'primary'}">${this.offer.type}</span></td>
        <td class="hover-text" data-show-player>${this.player.name}</td>
        <td class="d-none d-sm-table-cell">${this.offer.type === 'sell' ? '' : this.team.name}</td>
        <td class="d-none d-sm-table-cell">${this.player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${this.player.level}</td>
        <td class="text-right">${euroFormat.format(this.offer.offer_value)}</td>
        <td>
            <button type="button" class="btn btn-danger" data-cancel>
                <i class="fa fa-times-circle-o" aria-hidden="true"></i>
            </button>
        </td>
      </tr>
    `
  }

  async load () {
    this.player = await server.getPlayerById_V2(this.offer.player_id)
    this.team = await server.getTeamById_V2(this.player.team_id)
    console.log('Got player and team: ', this.player, this.team)
  }

  async _cancelOffer () {
    try {
      await server.cancelOffer({ offer: this.offer })
      await this.parentInstance.update(false)
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  onQueryChanged () {}

  onDestroy () {}

  onMounted () {}
}
