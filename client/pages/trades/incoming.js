import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { Table } from '../../partials/table.js'

export class IncomingOffersPage extends UIElement {
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
   * @returns {string}
   */
  get template () {
    const incomingOffers = this._filterIncomingBuyOffers()
    const hasIncomingOffers = incomingOffers.length > 0

    return `
      <div>
        <h2>${t('trades.incomingOffersTitle')}</h2>
        <p>${t('trades.incomingOffersDesc')}</p>
        ${new Table({
    cols: [
      { name: t('results.name') },
      { name: t('results.team') },
      { name: t('player.position') },
      { name: t('player.level'), align: 'right' },
      { name: t('trades.price'), align: 'right' },
      { name: '' }
    ],
    renderRow: (offer, index) => this._renderOfferRow(offer, index),
    data: incomingOffers,
    rowAttrs: (offer, index) => 'data-offer="' + index + '"'
  })}
        <div class="row">
          <div class="col ${hasIncomingOffers ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">${t('trades.noIncomingOffers')}</h4>
          </div>
        </div>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {}
  }

  onMounted () {
    this._attachClickHandler()
  }

  onUpdate () {
    this._attachClickHandler()
  }

  _attachClickHandler () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.addEventListener('click', this._handleClick)
  }

  _handleClick = async (event) => {
    const target = event.target
    const row = target.closest('[data-offer]')
    if (!row) return

    const idx = parseInt(row.dataset.offer, 10)
    const incomingOffers = this._filterIncomingBuyOffers()
    const offer = incomingOffers[idx]
    const player = this.players.find(p => p.id === offer.player_id)
    const fromTeam = this.teams.find(t2 => t2.id === offer.from_team_id)

    if (target.closest('.player-name')) {
      setQueryParams({ player_id: player.id })
    } else if (target.closest('.btn-primary')) {
      try {
        await server.acceptOffer(offer)
        toast(t('trades.acceptedOffer', { teamName: fromTeam.name }))
        await this.load()
        await this.update()
      } catch (e) {
        console.error(e)
        toast(e.message ?? t('toast.somethingWentWrong'), 'error')
      }
    } else if (target.closest('.btn-danger')) {
      try {
        await server.declineOffer(offer)
        toast(t('trades.declinedOffer', { teamName: fromTeam.name }))
        this.offers = this.offers.filter(o => o.id !== offer.id)
        row.remove()
        this._updateEmptyState()
      } catch (e) {
        console.error(e)
        toast(e.message ?? t('toast.somethingWentWrong'), 'error')
      }
    }
  }
  team = {}
  offers = []
  players = []
  teams = []

  /**
   * After removing a row, re-index data-offer attributes and toggle the empty state message.
   */
  _updateEmptyState () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('[data-offer]').forEach((row, i) => {
      row.dataset.offer = i
    })
    const incomingOffers = this._filterIncomingBuyOffers()
    const emptyCol = root.querySelector('.col')
    if (emptyCol) {
      emptyCol.classList.toggle('hidden', incomingOffers.length > 0)
    }
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
  _renderOfferRow (offer) {
    const player = this.players.find(p => p.id === offer.player_id)
    const fromTeam = this.teams.find(t => t.id === offer.from_team_id)

    return [
      `<span class="hover-text player-name">${player.name}</span>`,
      fromTeam.name,
      renderPositionBadge(player.position),
      renderLevelBadge(player.level),
      euroFormat.format(offer.offer_value),
      `<button class="btn btn-primary"><i class="fa fa-check-circle-o" aria-hidden="true"></i></button>
          <button class="btn btn-danger"><i class="fa fa-times-circle-o" aria-hidden="true"></i></button>`
    ]
  }
}
