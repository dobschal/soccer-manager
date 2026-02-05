import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { Balance } from '../partials/balance.js'
import { euroFormat } from '../lib/currency.js'
import { BalanceChart } from '../partials/balanceChart.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'

/**
 * @typedef {Object} FinanceLogEntry
 * @property {number} id
 * @property {number} season
 * @property {number} game_day
 * @property {number} value - Positive for income, negative for expenses
 * @property {number} balance - Team balance after this transaction
 * @property {number} team_id
 * @property {string} reason
 * @property {string} created_at - ISO date string
 */

export class FinancesPage extends UIElement {
  sponsor = null
  offers = []
  /** @type {FinanceLogEntry[]} */
  financeLog = []

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '#sponsor-offers': {
        click: async (event) => {
          const target = event.target
          const btn = target.closest('.btn-primary')
          if (!btn) return

          const offerCard = target.closest('[data-sponsor-offer]')
          if (!offerCard) return

          const idx = parseInt(offerCard.dataset.sponsorOffer, 10)
          const offer = this.offers[idx]

          try {
            await server.chooseSponsor(offer)
            toast(`You signed a sponsor contract with ${offer.name}`)
            await this.load()
            await this.update(true)
          } catch (e) {
            toast(e.message ?? 'Something went wrong', 'error')
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
      <div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between;">
        <h2>Finances</h2>
        <h3>${new Balance()}</h3>
        </div>
        <div class="row">
          <div class="col-12 ${this.sponsor ? 'col-lg-8' : ''}">
            <h5>Account Balance</h5>
            ${new BalanceChart(this.financeLog)}
          </div>
          <div class="col-12 col-lg-4 ${!this.sponsor ? 'd-none' : ''}">
            <h5>Sponsor</h5>
            ${this._renderSponsorCardCompact()}
          </div>
        </div>
        <div class="${this.sponsor ? 'hidden' : ''}">
          <h3>Choose Sponsor</h3>
          <p>The following sponsor would help you out with some money.</p>
          <div class="row" id="sponsor-offers">
            ${this.offers.map((offer, idx) => this._renderSponsorOfferCard(offer, idx)).join('')}
          </div>
        </div>
        <div>
          <h3>Transactions</h3>
          <table class="table table-hover">
            <tbody>
              ${this.financeLog.sort(this._sortFinanceLog).map((item, idx, arr) => this._renderFinanceLog(item, idx, arr)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const sponsorResponse = await server.getSponsor()
    this.sponsor = sponsorResponse.sponsor

    const offersResponse = await server.getSponsorOffers()
    this.offers = offersResponse.sponsors

    const logResponse = await server.getFinanceLog()
    this.financeLog = logResponse.log
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('finances')
  }

  /**
   * @param {FinanceLogEntry} logA
   * @param {FinanceLogEntry} logB
   * @returns {number}
   */
  _sortFinanceLog (logA, logB) {
    if (logB.season !== logA.season) return logB.season - logA.season
    if (logB.game_day !== logA.game_day) return logB.game_day - logA.game_day
    // Use id as tiebreaker for entries on the same game day (newer entries have higher ids)
    return logB.id - logA.id
  }

  /**
   * @param {FinanceLogEntry} logItem
   * @param {number} index
   * @param {FinanceLogEntry[]} array
   * @returns {string}
   */
  _renderFinanceLog (logItem, index, array) {
    let dividerRow = ''
    if (array[index - 1]?.game_day !== logItem.game_day) {
      dividerRow = `
        <tr>
          <td><small class="table-divider-text">Game Day: ${logItem.game_day + 1}</small></td>
          <td class="d-none d-sm-table-cell"></td>
          <td></td>
        </tr>`
    }
    return `
      ${dividerRow}
      <tr>
        <td class="text-right ${logItem.value > 0 ? 'text-success' : 'text-danger'}">${logItem.value > 0 ? '+' : ''}${euroFormat.format(logItem.value)}</td>
        <td class="d-none d-md-table-cell text-right">${euroFormat.format(logItem.balance)}</td>
        <td>${logItem.reason}</td>
      </tr>
    `
  }

  /**
   * Converts sponsor name to kebab-case filename
   * @param {string} name
   * @returns {string}
   */
  _getSponsorImagePath (name) {
    const filename = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    return `assets/sponsor-images/${filename}.svg`
  }

  /**
   * @returns {string}
   */
  _renderSponsorCardCompact () {
    if (!this.sponsor) return ''
    const imagePath = this._getSponsorImagePath(this.sponsor.name)
    return `
      <div class="action-card card text-white bg-success">
        <div class="card-header">
          <i class="fa fa-magic" aria-hidden="true"></i>
          <i>Sponsor</i>
        </div>
        <img class="card-img-top" src="${imagePath}" alt="${this.sponsor.name}">
        <div class="card-body">
          <h5 class="card-title">${this.sponsor.name}</h5>
          <p class="card-text">
            ${this.sponsor.name} is sending you ${euroFormat.format(this.sponsor.value)} per game day.
          </p>
        </div>
      </div>
    `
  }

  /**
   * @param {Object} offer
   * @param {number} index
   * @returns {string}
   */
  _renderSponsorOfferCard (offer, index) {
    const classes = ['dark', 'success', 'info', 'warning']
    const imagePath = this._getSponsorImagePath(offer.name)

    return `
      <div class="col-12 col-sm-6 col-md-3 mb-4" data-sponsor-offer="${index}">
        <div class="action-card card text-white bg-${classes[index]}">
          <div class="card-header">
            <i class="fa fa-magic" aria-hidden="true"></i>
            <i>Sponsor</i>
          </div>
          <img class="card-img-top" src="${imagePath}" alt="${offer.name}">
          <div class="card-body">
            <h5 class="card-title">${offer.name}, ${offer.duration} Days</h5>
            <p class="card-text">
              ${offer.name} offers you a contract for ${offer.duration} days.
              They will send you ${euroFormat.format(offer.value)} per game day.
            </p>
            <button type="button" class="btn btn-primary">Sign Contract</button>
          </div>
        </div>
      </div>
    `
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderFinancesPage () {
  return new FinancesPage().toString()
}
