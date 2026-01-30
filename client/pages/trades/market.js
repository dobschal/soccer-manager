import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { Table } from '../../partials/table.js'
import { setQueryParams } from '../../lib/router.js'
import { sortByPosition } from '../../util/player.js'

export class MarketPage extends UIElement {
  team = {}
  offers = []
  players = []
  teams = []

  /**
   * @returns {Object}
   */
  get events () {
    return {
      div: {
        click: (event) => {
          const target = event.target
          const buyBtn = target.closest('[data-buy-player]')
          if (!buyBtn) return

          const playerId = Number(buyBtn.dataset.buyPlayer)
          const player = this.players.find(p => p.id === playerId)
          if (player) {
            this._showBuyDialog(player)
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const sellOffers = this.offers.filter(o => o.type === 'sell' && o.from_team_id !== this.team.id)

    const table = new Table({
      data: sellOffers,
      cols: this._prepareTableCols(),
      renderRow: offer => {
        const player = this.players.find(p => p.id === offer.player_id)
        const offerTeam = this.teams.find(t => t.id === offer.from_team_id)
        return [
          player.name,
          offerTeam.name,
          player.position,
          player.level,
          euroFormat.format(offer.offer_value),
          `<button class="btn btn-primary" data-buy-player="${player.id}">Buy</button>`
        ]
      }
    })

    return `
      <div>
        <h2>Transfer market</h2>
        <p>Have a look on the transfer market to catch better players:</p>
        ${table}
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

    console.log('Render market...')
  }


  /**
   * @returns {Array}
   */
  _prepareTableCols () {
    return [{
      name: 'Name',
      onClick: (offer) => {
        setQueryParams({ player_id: offer.player_id })
      }
    }, {
      name: 'Team',
      largeScreenOnly: true
    }, {
      name: 'Position',
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        if (isAsc) {
          return sortByPosition(playerB, playerA)
        }
        return sortByPosition(playerA, playerB)
      }
    }, {
      name: 'Level',
      largeScreenOnly: true,
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        if (isAsc) {
          return playerA.level - playerB.level
        }
        return playerB.level - playerA.level
      },
      align: 'right'
    }, {
      name: 'Price',
      align: 'right',
      sortKey: 'offer_value'
    }, {
      name: '',
      largeScreenOnly: true
    }]
  }

  /**
   * @param {Object} player
   * @returns {Promise<void>}
   */
  async _showBuyDialog (player) {
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
      await server.addTradeOffer(player, price, 'buy')
      toast('You\'ve sent a buy offer')
      await this.load()
      await this.update(true)
    } catch (e) {
      console.error(e)
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderMarket () {
  return new MarketPage().toString()
}
