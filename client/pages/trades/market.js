import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { showDialog } from '../../partials/dialog.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { Table } from '../../partials/table.js'
import { setQueryParams } from '../../lib/router.js'
import { calculatePlayerAge, sortByPosition } from '../../util/player.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'

export class MarketPage extends UIElement {
  team = {}
  offers = []
  players = []
  teams = []

  /**
   * @returns {UIElementEvents}
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
          calculatePlayerAge(player, this.season),
          renderLevelBadge(player.level),
          euroFormat.format(offer.offer_value),
          `<button class="btn btn-primary" data-buy-player="${player.id}">${t('trades.buy')}</button>`
        ]
      }
    })

    return `
      <div>
        <h2>${t('trades.transferMarket')}</h2>
        <p>${t('trades.transferMarketDesc')}</p>
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

    const { season } = await server.getCurrentGameday()
    this.season = season

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
      name: t('results.name'),
      onClick: (offer) => {
        setQueryParams({ player_id: offer.player_id })
      }
    }, {
      name: t('results.team'),
      largeScreenOnly: true
    }, {
      name: t('player.position'),
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        if (isAsc) {
          return sortByPosition(playerB, playerA)
        }
        return sortByPosition(playerA, playerB)
      }
    }, {
      name: t('player.age'),
      largeScreenOnly: true,
      sortFn: (offerA, offerB, isAsc) => {
        const playerA = this.players.find(p => p.id === offerA.player_id)
        const playerB = this.players.find(p => p.id === offerB.player_id)
        const ageA = calculatePlayerAge(playerA, this.season)
        const ageB = calculatePlayerAge(playerB, this.season)
        return isAsc ? ageA - ageB : ageB - ageA
      },
      align: 'right'
    }, {
      name: t('player.level'),
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
      name: t('trades.price'),
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
      title: t('trades.buyPlayer', { playerName: player.name }),
      text: t('trades.enterOfferValue'),
      hasInput: true,
      inputType: 'number',
      inputLabel: t('trades.price'),
      buttonText: t('trades.submitOffer')
    })

    if (!ok) return

    const price = Number(value)
    if (price <= 0) {
      toast(t('trades.validPrice'), 'error')
      return
    }

    try {
      await server.addTradeOffer(player, price, 'buy')
      toast(t('trades.sentBuyOffer'))
      await this.load()
      await this.update()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderMarket () {
  return new MarketPage().toString()
}
