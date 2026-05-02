import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { Balance } from '../../partials/balance.js'
import { euroFormat } from '../../lib/currency.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { t } from '../../i18n/index.js'

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
  /**
   * @returns {Promise<void>}
   */
  async load () {
    if (!this._BalanceChart) {
      const module = await import('../../partials/balanceChart.js')
      this._BalanceChart = module.BalanceChart
    }

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
   * @returns {string}
   */
  get template () {
    return `
      <div>
      <div class="finances-header">
        <h2>${t('finances.title')}</h2>
        <h3>${new Balance()}</h3>
        </div>
        <div class="row">
          <div class="col-12 ${this.sponsor ? 'col-lg-8' : ''}">
            <h5>${t('finances.accountBalance')}</h5>
            ${new this._BalanceChart(this.financeLog)}

          </div>
          <div class="col-12 col-lg-4 ${!this.sponsor ? 'd-none' : ''}">
            <h5>${t('finances.sponsor')}</h5>
            ${this._renderSponsorCardCompact()}
          </div>
        </div>
        <div class="${this.sponsor ? 'hidden' : ''}">
          <h3>${t('finances.chooseSponsor')}</h3>
          <p>${t('finances.sponsorHelp')}</p>
          <div class="row" id="sponsor-offers">
            ${this.offers.map((offer, idx) => this._renderSponsorOfferCard(offer, idx)).join('')}
          </div>
        </div>
        <div>
          <h3>${t('finances.transactions')}</h3>
          <div class="row mb-3">
            <div class="col-6 col-md-3">
              <label for="filter-from" class="form-label">${t('finances.from')}</label>
              <select class="form-select" id="filter-from">
                ${this._renderGameDayOptions(this.fromSeason, this.fromGameDay)}
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label for="filter-to" class="form-label">${t('finances.to')}</label>
              <select class="form-select" id="filter-to">
                ${this._renderGameDayOptions(this.toSeason, this.toGameDay)}
              </select>
            </div>
          </div>
          <div class="horizontal-scrollable-table">
          <table class="table mb-4 wide-on-mobile">
             <thead>
              <tr>
                <th scope="col">${t('finances.value')}</th>
                <th scope="col">${t('finances.balance')}</th>
                <th scope="col">${t('finances.description')}</th>
              </tr>
            </thead>
            <tbody>
              ${this.financeLog.sort(this._sortFinanceLog).map((item, idx, arr) => this._renderFinanceLog(item, idx, arr)).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    `
  }
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
            toast(t('finances.signedContract', { name: offer.name }))
            await this.load()
            await this.update()
          } catch (e) {
            toast(e.message ?? t('toast.somethingWentWrong'), 'error')
          }
        }
      },
      '#filter-from': {
        change: async (event) => {
          const value = parseInt(event.target.value, 10)
          this.fromSeason = Math.floor(value / GAMEDAYS_PER_SEASON)
          this.fromGameDay = value % GAMEDAYS_PER_SEASON
          await this._loadFinanceLog()
          await this.update()
        }
      },
      '#filter-to': {
        change: async (event) => {
          const value = parseInt(event.target.value, 10)
          this.toSeason = Math.floor(value / GAMEDAYS_PER_SEASON)
          this.toGameDay = value % GAMEDAYS_PER_SEASON
          await this._loadFinanceLog()
          await this.update()
        }
      }
    }
  }
  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('finances', this)
  }
  sponsor = null

  offers = []
  /** @type {FinanceLogEntry[]} */
  financeLog = []

  /** @type {typeof import('../../partials/balanceChart.js').BalanceChart | null} */
  _BalanceChart = null

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
      options.push(`<option value="${total}" ${selected}>${t('finances.seasonDayOption', {
        season: season + 1,
        day: gameDay + 1
      })}</option>`)
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
          <td >${t('finances.gameDayLabel', { day: logItem.game_day + 1 })}</td>
          <td></td>
          <td ></td>
        </tr>`
    }
    return `
      ${dividerRow}
      <tr class="table-warning">
        <td class="text-right ${logItem.value > 0 ? 'text-success' : 'text-danger'}">${logItem.value > 0 ? '+' : ''}${euroFormat.format(logItem.value)}</td>
        <td class="text-right">${euroFormat.format(logItem.balance)}</td>
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
          <i>${t('finances.sponsor')}</i>
        </div>
        <img class="card-img-top" src="${imagePath}" alt="${this.sponsor.name}">
        <div class="card-body">
          <h5 class="card-title">${this.sponsor.name}</h5>
          <p class="card-text">
            ${t('finances.sponsorSending', {
    name: this.sponsor.name,
    value: euroFormat.format(this.sponsor.value)
  })}
            <br>${t('finances.daysRemaining', { days: this.sponsor.remaining_days })}
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
            <i>${t('finances.sponsor')}</i>
          </div>
          <img class="card-img-top" src="${imagePath}" alt="${offer.name}">
          <div class="card-body">
            <h5 class="card-title">${offer.name}, ${t('finances.days', { duration: offer.duration })}</h5>
            <p class="card-text">
              ${t('finances.offerContract', {
    name: offer.name,
    duration: offer.duration
  })}
              ${t('finances.offerValue', { value: euroFormat.format(offer.value) })}
            </p>
            <button type="button" class="btn btn-primary">${t('finances.signContract')}</button>
          </div>
        </div>
      </div>
    `
  }
}
