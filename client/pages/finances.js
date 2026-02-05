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

const GAMEDAYS_PER_SEASON = 34

export class FinancesPage extends UIElement {
  sponsor = null
  offers = []
  /** @type {FinanceLogEntry[]} */
  financeLog = []

  // Filter bounds
  minSeason = 0
  minGameDay = 0
  maxSeason = 0
  maxGameDay = 0

  // Selected filter values
  fromSeason = 0
  fromGameDay = 0
  toSeason = 0
  toGameDay = 0

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
      },
      '#filter-from': {
        change: async (event) => {
          const value = parseInt(event.target.value, 10)
          this.fromSeason = Math.floor(value / GAMEDAYS_PER_SEASON)
          this.fromGameDay = value % GAMEDAYS_PER_SEASON
          await this._loadFinanceLog()
          await this.update(true)
        }
      },
      '#filter-to': {
        change: async (event) => {
          const value = parseInt(event.target.value, 10)
          this.toSeason = Math.floor(value / GAMEDAYS_PER_SEASON)
          this.toGameDay = value % GAMEDAYS_PER_SEASON
          await this._loadFinanceLog()
          await this.update(true)
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
            <h5>Account Balance (€)</h5>
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
          <div class="row mb-3">
            <div class="col-6 col-md-3">
              <label for="filter-from" class="form-label">From</label>
              <select class="form-select" id="filter-from">
                ${this._renderGameDayOptions(this.fromSeason, this.fromGameDay)}
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label for="filter-to" class="form-label">To</label>
              <select class="form-select" id="filter-to">
                ${this._renderGameDayOptions(this.toSeason, this.toGameDay)}
              </select>
            </div>
          </div>
          <table class="table">
             <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col" class="d-none d-sm-table-cell">Balance</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
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

    // Load bounds for the filter
    const bounds = await server.getFinanceLogBounds()
    this.minSeason = bounds.minSeason
    this.minGameDay = bounds.minGameDay
    this.maxSeason = bounds.maxSeason
    this.maxGameDay = bounds.maxGameDay

    // Set default "to" to current gameday
    this.toSeason = this.maxSeason
    this.toGameDay = this.maxGameDay

    // Set default "from" to 10 gamedays ago
    const currentTotal = this.maxSeason * GAMEDAYS_PER_SEASON + this.maxGameDay
    const fromTotal = Math.max(
      this.minSeason * GAMEDAYS_PER_SEASON + this.minGameDay,
      currentTotal - 9
    )
    this.fromSeason = Math.floor(fromTotal / GAMEDAYS_PER_SEASON)
    this.fromGameDay = fromTotal % GAMEDAYS_PER_SEASON

    await this._loadFinanceLog()
  }

  /**
   * @returns {Promise<void>}
   */
  async _loadFinanceLog () {
    const logResponse = await server.getFinanceLog(
      this.fromSeason,
      this.fromGameDay,
      this.toSeason,
      this.toGameDay
    )
    this.financeLog = logResponse.log
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('finances')
  }

  /**
   * Renders options for gameday select from min to max bounds
   * @param {number} selectedSeason
   * @param {number} selectedGameDay
   * @returns {string}
   */
  _renderGameDayOptions (selectedSeason, selectedGameDay) {
    const options = []
    const minTotal = this.minSeason * GAMEDAYS_PER_SEASON + this.minGameDay
    const maxTotal = this.maxSeason * GAMEDAYS_PER_SEASON + this.maxGameDay
    const selectedTotal = selectedSeason * GAMEDAYS_PER_SEASON + selectedGameDay

    for (let total = minTotal; total <= maxTotal; total++) {
      const season = Math.floor(total / GAMEDAYS_PER_SEASON)
      const gameDay = total % GAMEDAYS_PER_SEASON
      const selected = total === selectedTotal ? 'selected' : ''
      options.push(`<option value="${total}" ${selected}>Season ${season + 1}, Day ${gameDay + 1}</option>`)
    }
    return options.join('')
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
        <tr class="table-group-divider table-warning">
          <td >Game Day: ${logItem.game_day + 1}</td>
          <td class="d-none d-sm-table-cell"></td>
          <td ></td>
        </tr>`
    }
    return `
      ${dividerRow}
      <tr class="table-warning">
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
            <br><small>${this.sponsor.remaining_days} game days remaining</small>
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
