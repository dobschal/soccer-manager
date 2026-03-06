import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { setQueryParams } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { t } from '../../i18n/index.js'
import { renderLevelBadge } from '../../partials/levelBadge.js'
import { Table } from '../../partials/table.js'

export class MyOffersPage extends UIElement {
  /**
   * @param {UIElement} parentInstance
   */
  constructor (parentInstance) {
    super()
    this.parentInstance = parentInstance
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.my-offers-table': {
        click: async (event) => {
          const row = event.target.closest('[data-offer-id]')
          if (!row) return
          const offerId = Number(row.dataset.offerId)
          const offer = this.offers.find(o => o.id === offerId)
          if (!offer) return

          if (event.target.closest('.player-name')) {
            setQueryParams({ player_id: offer.player_id })
          } else if (event.target.closest('.btn-danger')) {
            try {
              await server.cancelOffer(offer)
              await this.parentInstance.update(true)
            } catch (e) {
              toast(e.message ?? t('toast.somethingWentWrong'), 'error')
            }
          }
        }
      },
      '.answered-offers-table': {
        click: async (event) => {
          const row = event.target.closest('[data-offer-id]')
          if (!row) return
          const offerId = Number(row.dataset.offerId)
          const offer = this.answeredOffers.find(o => o.id === offerId)
          if (!offer) return

          if (event.target.closest('.player-name')) {
            setQueryParams({ player_id: offer.player_id })
          } else if (event.target.closest('.btn-outline-secondary')) {
            try {
              await server.dismissOffer(offer)
              await this.parentInstance.update(true)
            } catch (e) {
              toast(e.message ?? t('toast.somethingWentWrong'), 'error')
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
    return `
      <div>
        <h2>${t('trades.myOffersTitle')}</h2>
        <p>${t('trades.myOffersDesc')}</p>
        <div class="my-offers-table">
          ${new Table({
            cols: [
              { name: t('trades.type') },
              { name: t('results.name') },
              { name: t('results.team') },
              { name: t('player.position') },
              { name: t('player.level'), align: 'right' },
              { name: t('trades.price'), align: 'right' },
              { name: '' }
            ],
            renderRow: (offer) => this._renderOfferRow(offer),
            data: this.offers,
            rowAttrs: (offer) => `data-offer-id="${offer.id}"`
          }).template}
        </div>
        <div class="row">
          <div class="col ${this.hasOpenOffers ? 'hidden' : ''}">
            <h4 class="text-muted text-center mt-5 mb-5">${t('trades.noOpenOffers')}</h4>
          </div>
        </div>

        <h2 class="mt-4">${t('trades.answeredOffersTitle')}</h2>
        <div class="answered-offers-table ${this.answeredOffers.length === 0 ? 'hidden' : ''}">
          ${new Table({
            cols: [
              { name: t('trades.status') },
              { name: t('results.name') },
              { name: t('results.team') },
              { name: t('player.position') },
              { name: t('player.level'), align: 'right' },
              { name: t('trades.price'), align: 'right' },
              { name: '' }
            ],
            renderRow: (offer) => this._renderAnsweredOfferRow(offer),
            data: this.answeredOffers,
            rowAttrs: (offer) => `data-offer-id="${offer.id}"`
          }).template}
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
    const [{ offers, players, teams }, answeredData] = await Promise.all([
      server.getOffers(),
      server.getAnsweredOffers()
    ])
    this._playerMap = new Map()
    this._teamMap = new Map()
    for (const p of [...players, ...(answeredData.players || [])]) {
      this._playerMap.set(p.id, p)
    }
    for (const tm of [...teams, ...(answeredData.teams || [])]) {
      this._teamMap.set(tm.id, tm)
    }
    this.offers = offers.filter(o => o.from_team_id === this.team.id)
    this.answeredOffers = answeredData.answeredOffers || []
  }

  /**
   * @returns {boolean}
   */
  get hasOpenOffers () {
    return this.offers.length > 0
  }

  /**
   * @param {Object} offer
   * @returns {Array<string>}
   */
  _renderOfferRow (offer) {
    const player = this._playerMap.get(offer.player_id)
    const team = this._teamMap.get(player?.team_id)
    return [
      `<span class="badge bg-${offer.type === 'sell' ? 'secondary' : 'primary'}">${offer.type}</span>`,
      `<span class="hover-text player-name">${player?.name ?? ''}</span>`,
      offer.type === 'sell' ? '' : (team?.name ?? ''),
      player?.position ?? '',
      renderLevelBadge(player?.level ?? 0),
      euroFormat.format(offer.offer_value),
      `<button type="button" class="btn btn-danger"><i class="fa fa-times-circle-o" aria-hidden="true"></i></button>`
    ]
  }

  /**
   * @param {Object} offer
   * @returns {Array<string>}
   */
  _renderAnsweredOfferRow (offer) {
    const player = this._playerMap.get(offer.player_id)
    const team = this._teamMap.get(player?.team_id)
    const isAccepted = offer.status === 'accepted'
    const badgeClass = isAccepted ? 'bg-success' : 'bg-danger'
    const badgeText = isAccepted ? t('trades.accepted') : t('trades.rejected')
    return [
      `<span class="badge ${badgeClass}">${badgeText}</span>`,
      `<span class="hover-text player-name">${player?.name ?? ''}</span>`,
      team?.name ?? '',
      player?.position ?? '',
      renderLevelBadge(player?.level ?? 0),
      euroFormat.format(offer.offer_value),
      `<button type="button" class="btn btn-outline-secondary">${t('trades.dismiss')}</button>`
    ]
  }
}
