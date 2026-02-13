import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { euroFormat } from '../lib/currency.js'
import { StadiumCanvas } from '../partials/stadiumCanvas.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'

export class StadiumPage extends UIElement {
  stadium = {}
  team = {}
  constructionInfo = {}
  attendanceData = []
  constructionHistory = []
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
        <h2>${t('stadium.yourStadium')}</h2>
        <p>${t('stadium.stadiumDesc', { seats: this._stadiumCanvas.calculateTotalSeats() })}</p>
        <div class="mb-4" id="stadium-canvas-container">
          ${this._stadiumCanvas}
        </div>
        <h3>${t('stadium.ticketPrices')}</h3>
        <p>${t('stadium.adjustPrices')}</p>
        <form class="pb-4 mb-4" id="price-form">
          ${this._renderPriceForm()}
        </form>
        <h3>${t('stadium.expandStadium')}</h3>
        <p>${t('stadium.expandDesc')}</p>
        <form class="pb-4 mb-4" id="stadium-form">
          ${this._renderExpandForm()}
        </form>
        <h3>${t('stadium.attendance')}</h3>
        <p>${t('stadium.attendanceDesc')}</p>
        ${this._renderAttendanceSection()}
        <h3>${t('stadium.constructionHistory')}</h3>
        <p>${t('stadium.constructionHistoryDesc')}</p>
        ${this._renderConstructionHistory()}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [stadiumResponse, teamResponse, attendanceResponse, historyResponse] = await Promise.all([
      server.getStadium(),
      server.getMyTeam(),
      server.getStadiumAttendance(),
      server.getConstructionHistory()
    ])
    this.stadium = stadiumResponse.stadium
    this.constructionInfo = stadiumResponse.constructionInfo || {}
    this.team = teamResponse.team
    this.attendanceData = attendanceResponse.attendance || []
    this.constructionHistory = historyResponse.history || []
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onPriceFormSubmit (event) {
    event.preventDefault()
    try {
      await server.updatePrices(this.stadium)
      toast(t('stadium.pricesUpdated'))
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
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
      toast(t('stadium.makeChangesFirst'), 'error')
      return
    }

    try {
      const result = await server.buildStadium(this.stadium)
      this.constructionInfo = result.constructionInfo || {}
      toast(t('stadium.constructionStarted'), 'success')
      // Reload and re-render to show construction status
      void this.update(true)
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
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
            let details = info.days === 1 ? t('stadium.gameDaysSingle', { days: info.days }) : t('stadium.gameDaysPlural', { days: info.days })
            if (info.addingRoof) details += ' ' + t('stadium.includesRoof')
            return `<li><strong>${stand}</strong>: ${details}</li>`
          })

        if (previews.length > 0 && totalPrice > 0) {
          previewEl.innerHTML = `
            <div class="alert alert-info">
              <strong>${t('stadium.constructionTimeEstimate')}</strong>
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
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
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
            ${t('stadium.priceFor', { stand: t('stadium.' + name) })}
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
      <button type="submit" class="btn btn-primary">${t('stadium.savePrices')}</button>
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
             <small>${t('stadium.constructionRemaining', { days: remaining })}</small>
           </div>`
        : ''

      const disabledAttr = underConstruction ? 'disabled' : ''

      return `
        <div class="col-6 col-sm-3 mb-4">
          <div class="form-group">
            <label>${t('stadium.seatsOnStand', { stand: t('stadium.' + name) })}</label>
            <input data-size-input="${name}"
                   class="form-control"
                   type="number"
                   value="${this.stadium[name + '_stand_size']}"
                   ${disabledAttr}>
            <small class="form-text text-muted">${t('stadium.changeSeatsHint')}</small>
          </div>
          <div class="form-check">
            <label class="form-check-label">
              <input class="form-check-input"
                     data-roof-input="${name}"
                     type="checkbox"
                     ${this.stadium[name + '_stand_roof'] ? 'checked' : ''}
                     ${disabledAttr}>
                  ${t('stadium.roofOnStand', { stand: t('stadium.' + name) })}
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
        ${t('stadium.totalPrice')} <span id="total-price">0 €</span>
      </p>
      <div id="construction-time-preview" class="mb-3"></div>
      <button type="submit" class="btn btn-primary" disabled>${t('stadium.startConstruction')}</button>
    `
  }

  /**
   * @returns {string}
   */
  _renderAttendanceSection () {
    if (!this.attendanceData || this.attendanceData.length === 0) {
      return `<p class="text-muted mb-4">${t('stadium.noAttendanceData')}</p>`
    }

    const stands = ['north', 'south', 'east', 'west']
    const headerCells = stands.map(s => `<th>${t('stadium.' + s)}</th>`).join('')
    const rows = this.attendanceData.map(row => {
      const standCells = stands.map(s => {
        const data = row.stands[s]
        return `<td>${data.guests.toLocaleString()} / ${data.size.toLocaleString()} (${data.percentage}%)</td>`
      }).join('')
      return `<tr><td>${t('stadium.seasonDay', {
        season: row.season,
        day: row.gameDay
      })}</td>${standCells}</tr>`
    }).join('')

    return `
      <div class="table-responsive mb-4">
        <table class="table table-sm table-striped">
          <thead><tr><th></th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderConstructionHistory () {
    if (!this.constructionHistory || this.constructionHistory.length === 0) {
      return `<p class="text-muted mb-4">${t('stadium.noConstructionHistory')}</p>`
    }

    const rows = this.constructionHistory.map(h => {
      const completedCol = h.completed_game_day != null
        ? t('stadium.seasonDay', {
          season: h.completed_season,
          day: h.completed_game_day
        })
        : `<span class="badge badge-warning">${t('stadium.inProgress')}</span>`
      return `<tr>
        <td>${t('stadium.' + h.stand)}</td>
        <td>${h.old_size.toLocaleString()}</td>
        <td>${h.new_size.toLocaleString()}</td>
        <td>${h.added_roof ? '✓' : '—'}</td>
        <td>${t('stadium.seasonDay', {
        season: h.started_season,
        day: h.started_game_day
      })}</td>
        <td>${completedCol}</td>
      </tr>`
    }).join('')

    return `
      <div class="table-responsive mb-4">
        <table class="table table-sm table-striped">
          <thead><tr>
            <th>${t('stadium.stand')}</th>
            <th>${t('stadium.oldSize')}</th>
            <th>${t('stadium.newSize2')}</th>
            <th>${t('stadium.roofAdded')}</th>
            <th>${t('stadium.started')}</th>
            <th>${t('stadium.completed')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  /**
   * Called after component is mounted - initializes Three.js scene
   */
  onMounted () {
    if (this._stadiumCanvas) {
      this._stadiumCanvas.onMounted()
    }
    void showTutorialIfNeeded('stadium', this)
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
