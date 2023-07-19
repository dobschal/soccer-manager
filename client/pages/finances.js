import { server } from '../lib/gateway.js'
import { generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { toast } from '../partials/toast.js'
import { render } from '../lib/render.js'

let data

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
})

export async function renderFinancesPage () {
  data = await server.getMyTeam()
  const { sponsor } = await server.getSponsor()
  console.log('Sponsor: ', sponsor)
  const { sponsors: offers } = await server.getSponsorOffers()
  console.log('Offers: ', offers)
  const balance = euroFormat.format(data.team.balance)
  return `
    <h2>Finances</h2>
    <p>
      <b>Balance</b>: ${balance}
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
  `
}

function _renderSponsorCard (sponsor) {
  if (!sponsor) return ''
  return `
    <div class="col-4">
      <div class="action-card card text-white bg-success">
      <div class="card-header">
        <i class="fa fa-magic" aria-hidden="true"></i>
        <i>Action Card</i>
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
    <div class="col-3">
      <div class="action-card card text-white bg-${classes[index]}">
      <div class="card-header">
        <i class="fa fa-magic" aria-hidden="true"></i>
        <i>Action Card</i>
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
