import { server } from '../lib/gateway.js'
import { generateId, el } from '../lib/html.js'
import { onChange, onSubmit } from '../lib/htmlEventHandlers.js'
import { toast } from '../partials/toast.js'

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
})

export async function renderStadiumPage () {
  const { stadium } = await server.getStadium()
  console.log('Stadium: ', stadium)

  onSubmit('#stadium-form', async event => {
    event.preventDefault()
    try {
      await server.buildStadium({ stadium })
      toast('You got a new stadium')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  })

  onSubmit('#price-form', async event => {
    event.preventDefault()
    try {
      await server.updatePrices({ stadium })
      toast('Prices updated')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  })

  return `
    <h2>Your Stadium</h2>
    <p>Here is your beautiful stadium with ${calculateStadiumSize(stadium)} seats:</p>
    <div class="stadium-wrapper mb-4">
      <div class="stadium-canvas">
        <div class="scene">        
          <div class="floor"></div>
          <div class="green-field"></div>
          <div class="stands">
            ${_renderStands(stadium)}           
          </div>
        </div>
      </div>
    </div>
    <h3>Ticket Prices</h3>
    <p>Adjust the prices of your stadium tickets.</p>
    <form class="pb-4 mb-4" id="price-form">    
        ${_renderPriceForm(stadium)}
    </form>
    <h3>Expand Stadium</h3>
    <p>Add more seats to your stadium to get more fans excited.</p>
    <form class="pb-4 mb-4" id="stadium-form">    
        ${_renderExpandForm(stadium)}
    </form>
  `
}

function _renderPriceForm (stadium) {
  const formGroups = ['north', 'south', 'east', 'west'].map(name => {
    const inputItemId = generateId()

    onChange('#' + inputItemId, async (event) => {
      console.log('Value: ', event.target.value)
      try {
        stadium[name + '_stand_price'] = Number(event.target.value)
      } catch (e) {
        toast(e.message ?? 'Something went wrong', 'error')
      }
    })

    return `
      <div class="col-3 mb-2">
        <div class="form-group">
          <label for="${inputItemId}">
            Price for tickets on ${name} stand
          </label>                
          <div class="input-group">          
            <input id="${inputItemId}" 
                   class="form-control" 
                   type="number" 
                   value="${stadium[name + '_stand_price']}">
            <div class="input-group-append">
              <span class="input-group-text">,00 €</span>
            </div>
          </div>
        </div>
      </div>
    `
  }).join('')

  return `
    <div class="row">
      ${formGroups}
    </div>
    <button type="submit" class="btn btn-primary">Save Prices</button>
  `
}

async function _updatePrice (stadium, priceItemId) {
  try {
    const { totalPrice } = await server.calculateStadiumPrice({ stadium })
    console.log('Price: ', totalPrice)
    el('#' + priceItemId).innerText = euroFormat.format(totalPrice)
  } catch (e) {
    toast(e.message ?? 'Something went wrong', 'error')
  }
}

function _renderExpandForm (stadium) {
  const priceItemId = generateId()

  const formGroups = ['north', 'south', 'east', 'west'].map(name => {
    const inputItemId = generateId()
    const checkboxItemId = generateId()

    onChange('#' + inputItemId, async (event) => {
      stadium[name + '_stand_size'] = Number(event.target.value)
      await _updatePrice(stadium, priceItemId)
    })

    onChange('#' + checkboxItemId, async event => {
      stadium[name + '_stand_roof'] = event.target.checked ? 1 : 0
      await _updatePrice(stadium, priceItemId)
    })

    return `
      <div class="col-3 mb-4">
        <div class="form-group">
          <label>Seats on ${name} stand</label>
          <input id="${inputItemId}" class="form-control" type="number" value="${stadium[name + '_stand_size']}">
          <small class="form-text text-muted">Change the amount of seats here to expand your stadium.</small>
        </div>
        <div class="form-check">
          <label class="form-check-label">
            <input class="form-check-input"
                   id="${checkboxItemId}"                    
                   type="checkbox" 
                   ${stadium[name + '_stand_roof'] ? 'checked' : ''}>
                Roof on ${name} stand? 
          </label>
        </div>
      </div>
    `
  }).join('')

  return `
    <div class="row">
      ${formGroups}
    </div>
    <p>
      Total Price for construction: <span id="${priceItemId}">0 €</span>
    </p>
    <button type="submit" class="btn btn-primary">Expand Stadium</button>
  `
}

function calculateStadiumSize (stadium) {
  return ['north', 'south', 'east', 'west'].reduce((total, name) => total + stadium[name + '_stand_size'], 0)
}

/**
 * @param {StadiumType} stadium
 * @returns {string}
 */
function _renderStands (stadium) {
  const names = ['north', 'south', 'east', 'west']
  return names.map(name => {
    const size = stadium[name + '_stand_size']
    const sizeClass = size >= 20000 ? ' big' : (size < 5000 ? ' small' : '')
    const roofElement = stadium[name + '_stand_roof'] ? '<div class="roof"></div>' : ''
    return `
      <div class="stand-wrapper${sizeClass}">
        ${roofElement}
        <div class="stand"></div>
        <div class="rightwall-stand"></div>
        <div class="leftwall-stand"></div>
        <div class="backwall-stand"></div>          
      </div>
    `
  }).join('')
}
