import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'

export class MyOffersPage extends UIElement {
  /**
   * @param {UIElement} parentInstance
   */
  constructor (parentInstance) {
    super()
    this.parentInstance = parentInstance
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h2>${t('trades.myOffersTitle')}</h2>
        <p>${t('trades.myOffersDesc')}</p>
        <div class="horizontal-scrollable-table">
          <table class="table wide-on-mobile">
            <thead>
              <tr>
                <th scope="col">${t('trades.type')}</th>
                <th scope="col">${t('results.name')}</th>
                <th scope="col" class="d-none d-sm-table-cell">${t('results.team')}</th>
                <th scope="col" class="d-none d-sm-table-cell">${t('player.position')}</th>
                <th scope="col" class="text-right d-none d-sm-table-cell">${t('player.level')}</th>
                <th scope="col" class="text-right">${t('trades.price')}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              ${this.offers.map(offer => new MyOfferListItem(offer, this.parentInstance)).join('')}
            </tbody>
          </table>
        </div>
        <div class="row">
          <div class="col ${this.hasOpenOffers ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">${t('trades.noOpenOffers')}</h4>
          </div>
        </div>

        <h2 class="mt-4">${t('trades.answeredOffersTitle')}</h2>
        <div class="horizontal-scrollable-table">
          <table class="table wide-on-mobile ${this.answeredOffers.length === 0 ? 'hidden' : ''}">
            <thead>
              <tr>
                <th scope="col">${t('trades.status')}</th>
                <th scope="col">${t('results.name')}</th>
                <th scope="col" class="d-none d-sm-table-cell">${t('results.team')}</th>
                <th scope="col" class="d-none d-sm-table-cell">${t('player.position')}</th>
                <th scope="col" class="text-right d-none d-sm-table-cell">${t('player.level')}</th>
                <th scope="col" class="text-right">${t('trades.price')}</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              ${this.answeredOffers.map(offer => new AnsweredOfferListItem(offer, this.parentInstance)).join('')}
            </tbody>
          </table>
        </div>
        <div class="row">
          <div class="col ${this.answeredOffers.length > 0 ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">${t('trades.noAnsweredOffers')}</h4>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getMyTeam()
    this.team = response.team
    const [{ offers }, answeredData] = await Promise.all([
      server.getOffers(),
      server.getAnsweredOffers()
    ])
    this.offers = offers.filter(o => o.from_team_id === this.team.id)
    this.answeredOffers = answeredData.answeredOffers || []
  }

  /**
   * @returns {boolean}
   */
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

  /**
   * @returns {UIElementEvents}
   */
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

  /**
   * @returns {string}
   */
  get template () {
    return `
      <tr >
        <td><span class="badge bg-${this.offer.type === 'sell' ? 'secondary' : 'primary'}">${this.offer.type}</span></td>
        <td class="hover-text" data-show-player>${this.player.name}</td>
        <td class="d-none d-sm-table-cell">${this.offer.type === 'sell' ? '' : this.team.name}</td>
        <td class="d-none d-sm-table-cell">${this.player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${renderLevelBadge(this.player.level)}</td>
        <td class="text-right">${euroFormat.format(this.offer.offer_value)}</td>
        <td>
            <button type="button" class="btn btn-danger" data-cancel>
                <i class="fa fa-times-circle-o" aria-hidden="true"></i>
            </button>
        </td>
      </tr>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    this.player = await server.getPlayerById(this.offer.player_id)
    this.team = await server.getTeamById(this.player.team_id)
  }

  /**
   * @returns {Promise<void>}
   */
  async _cancelOffer () {
    try {
      await server.cancelOffer(this.offer)
      await this.parentInstance.update(true)
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}

class AnsweredOfferListItem extends UIElement {
  /**
   * @param {TradeOfferType} offer
   * @param {UIElement} parentInstance
   */
  constructor (offer, parentInstance) {
    super()
    this.offer = offer
    this.parentInstance = parentInstance
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      'td[data-show-player]': {
        click: () => setQueryParams({ player_id: this.player.id })
      },
      'button[data-dismiss]': {
        click: this._dismissOffer
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const isAccepted = this.offer.status === 'accepted'
    const badgeClass = isAccepted ? 'bg-success' : 'bg-danger'
    const badgeText = isAccepted ? t('trades.accepted') : t('trades.rejected')
    return `
      <tr>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td class="hover-text" data-show-player>${this.player.name}</td>
        <td class="d-none d-sm-table-cell">${this.team.name}</td>
        <td class="d-none d-sm-table-cell">${this.player.position}</td>
        <td class="text-right d-none d-sm-table-cell">${renderLevelBadge(this.player.level)}</td>
        <td class="text-right">${euroFormat.format(this.offer.offer_value)}</td>
        <td>
            <button type="button" class="btn btn-outline-secondary" data-dismiss>
                ${t('trades.dismiss')}
            </button>
        </td>
      </tr>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    this.player = await server.getPlayerById(this.offer.player_id)
    this.team = await server.getTeamById(this.player.team_id)
  }

  /**
   * @returns {Promise<void>}
   */
  async _dismissOffer () {
    try {
      await server.dismissOffer(this.offer)
      await this.parentInstance.update(true)
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }
}
