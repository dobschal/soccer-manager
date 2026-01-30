import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { euroFormat } from '../lib/currency.js'

export class StadiumPage extends UIElement {
  stadium = {}

  /**
   * @returns {Object}
   */
  get events () {
    return {
      '#price-form': {
        submit: this._onPriceFormSubmit.bind(this),
        change: (event) => {
          const input = event.target.closest('[data-price-input]')
          if (input) {
            const name = input.dataset.priceInput
            this.stadium[name + '_stand_price'] = Number(input.value)
          }
        }
      },
      '#stadium-form': {
        submit: this._onStadiumFormSubmit.bind(this),
        change: async (event) => {
          const sizeInput = event.target.closest('[data-size-input]')
          const roofInput = event.target.closest('[data-roof-input]')

          if (sizeInput) {
            const name = sizeInput.dataset.sizeInput
            this.stadium[name + '_stand_size'] = Number(sizeInput.value)
            await this._updatePrice()
          } else if (roofInput) {
            const name = roofInput.dataset.roofInput
            this.stadium[name + '_stand_roof'] = roofInput.checked ? 1 : 0
            await this._updatePrice()
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
        <h2>Your Stadium</h2>
        <p>Here is your beautiful stadium with ${this._calculateStadiumSize()} seats:</p>
        <div class="stadium-wrapper mb-4">
          <div class="stadium-canvas">
            <div class="scene">
              <div class="floor"></div>
              <div class="green-field"></div>
              <div class="stands">
                ${this._renderStands()}
              </div>
            </div>
          </div>
        </div>
        <h3>Ticket Prices</h3>
        <p>Adjust the prices of your stadium tickets.</p>
        <form class="pb-4 mb-4" id="price-form">
          ${this._renderPriceForm()}
        </form>
        <h3>Expand Stadium</h3>
        <p>Add more seats to your stadium to get more fans excited.</p>
        <form class="pb-4 mb-4" id="stadium-form">
          ${this._renderExpandForm()}
        </form>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getStadium()
    this.stadium = response.stadium
    console.log('Stadium: ', this.stadium)
  }


  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onPriceFormSubmit (event) {
    event.preventDefault()
    try {
      await server.updatePrices(this.stadium)
      toast('Prices updated')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onStadiumFormSubmit (event) {
    event.preventDefault()
    try {
      await server.buildStadium(this.stadium)
      toast('You got a new stadium', 'success')
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _updatePrice () {
    try {
      const { totalPrice } = await server.calculateStadiumPrice(this.stadium)
      const priceEl = el(`${this._elementQuery} #total-price`)
      if (priceEl) {
        priceEl.innerText = euroFormat.format(totalPrice)
      }
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @returns {string}
   */
  _renderPriceForm () {
    const formGroups = ['north', 'south', 'east', 'west'].map(name => `
      <div class="col-6 col-sm-3 mb-2">
        <div class="form-group">
          <label>
            Price for tickets on ${name} stand
          </label>
          <div class="input-group">
            <input data-price-input="${name}"
                   class="form-control"
                   type="number"
                   value="${this.stadium[name + '_stand_price']}">
            <div class="input-group-append">
              <span class="input-group-text">,00 €</span>
            </div>
          </div>
        </div>
      </div>
    `).join('')

    return `
      <div class="row">
        ${formGroups}
      </div>
      <button type="submit" class="btn btn-primary">Save Prices</button>
    `
  }

  /**
   * @returns {string}
   */
  _renderExpandForm () {
    const formGroups = ['north', 'south', 'east', 'west'].map(name => `
      <div class="col-6 col-sm-3 mb-4">
        <div class="form-group">
          <label>Seats on ${name} stand</label>
          <input data-size-input="${name}" class="form-control" type="number" value="${this.stadium[name + '_stand_size']}">
          <small class="form-text text-muted">Change the amount of seats here to expand your stadium.</small>
        </div>
        <div class="form-check">
          <label class="form-check-label">
            <input class="form-check-input"
                   data-roof-input="${name}"
                   type="checkbox"
                   ${this.stadium[name + '_stand_roof'] ? 'checked' : ''}>
                Roof on ${name} stand?
          </label>
        </div>
      </div>
    `).join('')

    return `
      <div class="row">
        ${formGroups}
      </div>
      <p>
        Total Price for construction: <span id="total-price">0 €</span>
      </p>
      <button type="submit" class="btn btn-primary">Expand Stadium</button>
    `
  }

  /**
   * @returns {number}
   */
  _calculateStadiumSize () {
    return ['north', 'south', 'east', 'west'].reduce(
      (total, name) => total + (this.stadium[name + '_stand_size'] || 0),
      0
    )
  }

  /**
   * @returns {string}
   */
  _renderStands () {
    return ['north', 'south', 'east', 'west'].map(name => {
      const size = this.stadium[name + '_stand_size'] || 0
      const sizeClass = size >= 20000 ? ' big' : (size < 5000 ? ' small' : '')
      const roofElement = this.stadium[name + '_stand_roof'] ? '<div class="roof"></div>' : ''
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
}

/**
 * @returns {Promise<string>}
 */
export async function renderStadiumPage () {
  return new StadiumPage().toString()
}
