import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { euroFormat } from '../lib/currency.js'
import { StadiumCanvas } from '../partials/stadiumCanvas.js'

export class StadiumPage extends UIElement {
  stadium = {}
  team = {}
  constructionInfo = {}
  /** @type {StadiumCanvas|null} */
  _stadiumCanvas = null
  /** @type {boolean} */
  _hasValidConstruction = false

  /**
   * @returns {UIElementEvents}
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
    this._stadiumCanvas = new StadiumCanvas(this.stadium, this.team, 'stadium-canvas')
    return `
      <div>
        <h2>Your Stadium</h2>
        <p>Here is your beautiful stadium with ${this._stadiumCanvas.calculateTotalSeats()} seats:</p>
        <div class="mb-4" id="stadium-canvas-container">
          ${this._stadiumCanvas}
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
    const [stadiumResponse, teamResponse] = await Promise.all([
      server.getStadium(),
      server.getMyTeam()
    ])
    this.stadium = stadiumResponse.stadium
    this.constructionInfo = stadiumResponse.constructionInfo || {}
    this.team = teamResponse.team
    console.log('Stadium: ', this.stadium)
    console.log('Construction Info: ', this.constructionInfo)
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

    // Safety check - don't submit if no valid construction
    if (!this._hasValidConstruction) {
      toast('Please make changes and wait for cost calculation', 'error')
      return
    }

    try {
      const result = await server.buildStadium(this.stadium)
      this.constructionInfo = result.constructionInfo || {}
      toast('Construction has started!', 'success')
      // Reload and re-render to show construction status
      void this.update(false)
    } catch (e) {
      toast(e.message ?? 'Something went wrong', 'error')
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _updatePrice () {
    const submitBtn = el(`${this._elementQuery} #stadium-form button[type="submit"]`)

    try {
      const {
        totalPrice,
        constructionTimes
      } = await server.calculateStadiumPrice(this.stadium)
      const priceEl = el(`${this._elementQuery} #total-price`)
      if (priceEl) {
        priceEl.innerText = euroFormat.format(totalPrice)
      }

      // Display construction time preview
      const previewEl = el(`${this._elementQuery} #construction-time-preview`)
      let hasValidChanges = false

      if (previewEl && constructionTimes) {
        const previews = Object.entries(constructionTimes)
          .filter(([, info]) => info && !info.blocked)
          .map(([stand, info]) => {
            let details = `${info.days} gameday${info.days !== 1 ? 's' : ''}`
            if (info.addingRoof) details += ' (includes roof)'
            return `<li><strong>${stand}</strong>: ${details}</li>`
          })

        if (previews.length > 0 && totalPrice > 0) {
          previewEl.innerHTML = `
            <div class="alert alert-info">
              <strong>Construction Time Estimate:</strong>
              <ul class="mb-0">${previews.join('')}</ul>
            </div>
          `
          hasValidChanges = true
        } else {
          previewEl.innerHTML = ''
        }
      }

      // Enable/disable submit button based on valid changes
      this._hasValidConstruction = hasValidChanges
      if (submitBtn) {
        submitBtn.disabled = !hasValidChanges
      }
    } catch (e) {
      // Disable button on error
      this._hasValidConstruction = false
      if (submitBtn) {
        submitBtn.disabled = true
      }
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
    const formGroups = ['north', 'south', 'east', 'west'].map(name => {
      const standInfo = this.constructionInfo?.[name]
      const underConstruction = standInfo?.underConstruction
      const remaining = standInfo?.remainingGameDays

      const constructionBadge = underConstruction
        ? `<div class="alert alert-warning mt-2 py-2">
             <small>Under construction - ${remaining} gameday${remaining !== 1 ? 's' : ''} remaining</small>
           </div>`
        : ''

      const disabledAttr = underConstruction ? 'disabled' : ''

      return `
        <div class="col-6 col-sm-3 mb-4">
          <div class="form-group">
            <label>Seats on ${name} stand</label>
            <input data-size-input="${name}"
                   class="form-control"
                   type="number"
                   value="${this.stadium[name + '_stand_size']}"
                   ${disabledAttr}>
            <small class="form-text text-muted">Change the amount of seats here to expand your stadium.</small>
          </div>
          <div class="form-check">
            <label class="form-check-label">
              <input class="form-check-input"
                     data-roof-input="${name}"
                     type="checkbox"
                     ${this.stadium[name + '_stand_roof'] ? 'checked' : ''}
                     ${disabledAttr}>
                  Roof on ${name} stand?
            </label>
          </div>
          ${constructionBadge}
        </div>
      `
    }).join('')

    return `
      <div class="row">
        ${formGroups}
      </div>
      <p>
        Total Price for construction: <span id="total-price">0 €</span>
      </p>
      <div id="construction-time-preview" class="mb-3"></div>
      <button type="submit" class="btn btn-primary" disabled>Start Construction</button>
    `
  }

  /**
   * Called after component is mounted - initializes Three.js scene
   */
  onMounted () {
    if (this._stadiumCanvas) {
      this._stadiumCanvas.onMounted()
    }
  }

  /**
   * Called when component is unmounted - cleanup Three.js resources
   */
  onDestroy () {
    if (this._stadiumCanvas) {
      this._stadiumCanvas.onDestroy()
      this._stadiumCanvas = null
    }
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderStadiumPage () {
  return new StadiumPage().toString()
}
