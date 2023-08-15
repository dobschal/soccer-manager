import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { toast } from '../partials/toast.js'
import { render } from '../lib/render.js'
import { balanceSpan } from '../partials/balance.js'
import { euroFormat } from '../util/currency.js'
import { drawBalanceChart } from '../partials/balanceChart.js'

export async function renderFinancesPage () {
  const { sponsor } = await server.getSponsor()
  const { sponsors: offers } = await server.getSponsorOffers()
  const { log: financeLog } = await server.getFinanceLog()
  const balance = await balanceSpan()
  return `
    <h2>Finances</h2>
    <p>
      <b>Balance</b>: ${balance}
      ${drawBalanceChart(financeLog)}
    </p>
    <div class="${!sponsor ? 'hidden' : ''}">
      <h3>Sponsor</h3>
      <p>Here is your current sponsor:</p>
      <div class="row">
        ${_renderSponsorCard(sponsor)}
      </div>
    </div>
    <div class="${sponsor ? 'hidden' : ''}">
      <h3>Choose Sponsor</h3>
      <p>The following sponsor would help you out with some money.</p>
      <div class="row">
        ${offers.map(_renderSponsorOfferCard).join('')}
      </div>
    </div>
    <div>
        <h3>Transactions</h3>
        <table class="table table-hover">
          <tbody>
            ${financeLog.sort(_sortFinanceLog).map(_renderFinanceLog).join('')}
          </tbody>
        </table>
    </div>
  `
}

/**
 * @param {FinanceLogType} logA
 * @param {FinanceLogType} logB
 * @private
 */
function _sortFinanceLog (logA, logB) {
  if (logB.season > logA.season) return -1
  if (logB.season < logA.season) return 1
  return logB.game_day - logA.game_day
}

/**
 * @param {FinanceLogType} logItem
 * @param {number} index
 * @param {FinanceLogType[]} array
 * @private
 */
function _renderFinanceLog (logItem, index, array) {
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

function _renderSponsorCard (sponsor) {
  if (!sponsor) return ''
  return `
    <div class="col-12 col-md-6 mb-4">
      <div class="action-card card text-white bg-success">
      <div class="card-header">
        <i class="fa fa-magic" aria-hidden="true"></i>
        <i>Sponsor</i>
      </div>
        <img class="card-img-top" src="assets/stock-image-1.jpg" alt="Football">
        <div class="card-body">
          <h5 class="card-title">${sponsor.name}</h5>
          <p class="card-text">
            ${sponsor.name} is sending you ${euroFormat.format(sponsor.value)} per game day.
          </p>
        </div>
      </div>
    </div>
  `
}

function _renderSponsorOfferCard (offer, index) {
  const id = generateId()

  onClick('#' + id, async () => {
    try {
      await server.chooseSponsor({ sponsor: offer })
      toast(`You signed a sponsor contract with ${offer.name}`)
      render('#page', await renderFinancesPage())
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  })

  const classes = ['dark', 'success', 'info', 'warning']

  return `
    <div class="col-12 col-sm-6 col-md-3 mb-4">
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
          <button id="${id}" type="button" class="btn btn-primary">Sign Contract</button>
        </div>
      </div>
    </div>
  `
}
