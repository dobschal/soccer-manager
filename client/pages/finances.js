import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { Balance } from '../partials/balance.js'
import { euroFormat } from '../lib/currency.js'
import { BalanceChart } from '../partials/balanceChart.js'

export class FinancesPage extends UIElement {
  sponsor = null
  offers = []
  financeLog = []

  get template () {
    return `
      <div>
        <h2>Finances</h2>
        <p>
          <b>Balance</b>: ${new Balance()}
          ${new BalanceChart(this.financeLog)}
        </p>
        <div class="${!this.sponsor ? 'hidden' : ''}">
          <h3>Sponsor</h3>
          <p>Here is your current sponsor:</p>
          <div class="row">
            ${this._renderSponsorCard()}
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

  async load () {
    const sponsorResponse = await server.getSponsor()
    this.sponsor = sponsorResponse.sponsor

    const offersResponse = await server.getSponsorOffers()
    this.offers = offersResponse.sponsors

    const logResponse = await server.getFinanceLog()
    this.financeLog = logResponse.log
    console.log('Finance: ', this.financeLog)
  }

  onMounted () {
    this._attachSponsorOfferHandlers()
  }

  _attachSponsorOfferHandlers () {
    this.offers.forEach((offer, idx) => {
      const btn = document.querySelector(`${this._elementQuery} [data-sponsor-offer="${idx}"] .btn-primary`)
      if (btn) {
        btn.addEventListener('click', async () => {
          try {
            await server.chooseSponsor({ sponsor: offer })
            toast(`You signed a sponsor contract with ${offer.name}`)
            await this.load()
            await this.update(true)
          } catch (e) {
            toast(e.message ?? 'Something went wrong', 'error')
          }
        })
      }
    })
  }

  _sortFinanceLog (logA, logB) {
    if (logB.season > logA.season) return 1
    if (logB.season < logA.season) return -1
    return logB.game_day - logA.game_day
  }

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

  _renderSponsorCard () {
    if (!this.sponsor) return ''
    return `
      <div class="col-12 col-md-6 mb-4">
        <div class="action-card card text-white bg-success">
          <div class="card-header">
            <i class="fa fa-magic" aria-hidden="true"></i>
            <i>Sponsor</i>
          </div>
          <img class="card-img-top" src="assets/stock-image-1.jpg" alt="Football">
          <div class="card-body">
            <h5 class="card-title">${this.sponsor.name}</h5>
            <p class="card-text">
              ${this.sponsor.name} is sending you ${euroFormat.format(this.sponsor.value)} per game day.
            </p>
          </div>
        </div>
      </div>
    `
  }

  _renderSponsorOfferCard (offer, index) {
    const classes = ['dark', 'success', 'info', 'warning']

    return `
      <div class="col-12 col-sm-6 col-md-3 mb-4" data-sponsor-offer="${index}">
        <div class="action-card card text-white bg-${classes[index]}">
          <div class="card-header">
            <i class="fa fa-magic" aria-hidden="true"></i>
            <i>Sponsor</i>
          </div>
          <img class="card-img-top" src="assets/stock-image-1.jpg" alt="Football">
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

// Backwards compatibility
export async function renderFinancesPage () {
  return new FinancesPage().toString()
}
