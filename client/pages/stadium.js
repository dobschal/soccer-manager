import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { el, generateId } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { euroFormat } from '../lib/currency.js'
import { StadiumCanvas } from '../partials/stadiumCanvas.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { t } from '../i18n/index.js'
import { BuildingsPage } from './stadium/buildingsPage.js'
import { FinancesPage } from '../pages/finances.js'

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
  _subPageCache = {}
  _subPageContainerId = generateId()

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    if (this.subPage === 'buildings' || this.subPage === 'finances') {
      return {}
    }
    return {
      '#price-form': {
        submit: this._onPriceFormSubmit.bind(this),
        change: (event) => {
          const input = event.target.closest('[data-price-input]')
          if (input) {
            const name = input.dataset.priceInput
            this.stadium[name + '_stand_price'] = Number(input.value)
            this._updatePriceButton()
          }
        },
        click: (event) => {
          if (event.target.closest('#cancel-prices-btn')) {
            event.preventDefault()
            this._resetPrices()
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
        },
        click: (event) => {
          if (event.target.closest('#cancel-expand-btn')) {
            event.preventDefault()
            this._resetExpand()
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const key = this.subPage || 'stadium'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        <nav class="nav nav-pills mb-2">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#stadium">${t('stadium.tabStadium')}</a>
          <a class="nav-link ${this.subPage === 'buildings' ? 'active' : ''}" href="#stadium?sub_page=buildings">${t('stadium.tabBuildings')}</a>
          <a class="nav-link ${this.subPage === 'finances' ? 'active' : ''}" href="#stadium?sub_page=finances">${t('stadium.tabFinances')}</a>
        </nav>
        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  _getOrCreateSubPage () {
    const key = this.subPage || 'stadium'
    if (key === 'stadium') {
      // Stadium tab has Three.js canvas — always recreate
      return this._renderStadiumPage()
    }
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    return this._subPageCache[key]
  }

  _createSubPage (key) {
    switch (key) {
      case 'buildings': return new BuildingsPage(this)
      case 'finances': return new FinancesPage()
      default: return this._renderStadiumPage()
    }
  }

  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return
    const key = this.subPage || 'stadium'

    // Cleanup Three.js when leaving stadium tab
    if (this._stadiumCanvas) {
      this._stadiumCanvas.onDestroy()
      this._stadiumCanvas = null
    }

    container.querySelectorAll('[data-subpage]').forEach(w => { w.style.display = 'none' })

    // Stadium tab: always recreate (Three.js needs fresh canvas)
    if (key === 'stadium') {
      const oldWrapper = container.querySelector('[data-subpage="stadium"]')
      if (oldWrapper) oldWrapper.remove()
      const subPage = this._renderStadiumPage()
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-subpage', 'stadium')
      wrapper.insertAdjacentHTML('afterbegin', String(subPage))
      container.appendChild(wrapper)
      this._stadiumCanvas.onMounted()
      return
    }

    const existing = container.querySelector(`[data-subpage="${key}"]`)
    if (existing) {
      existing.style.display = ''
      const cached = this._subPageCache[key]
      if (cached?.silentUpdate) cached.silentUpdate()
      return
    }

    const subPage = this._getOrCreateSubPage()
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-subpage', key)
    wrapper.insertAdjacentHTML('afterbegin', String(subPage))
    container.appendChild(wrapper)
  }

  _updateNav () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href')
      const isActive = this.subPage
        ? href === `#stadium?sub_page=${this.subPage}`
        : href === '#stadium'
      link.classList.toggle('active', isActive)
    })
  }

  /**
   * @returns {string}
   */
  _renderStadiumPage () {
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
    this._originalPrices = {
      north: this.stadium.north_stand_price,
      south: this.stadium.south_stand_price,
      east: this.stadium.east_stand_price,
      west: this.stadium.west_stand_price
    }
    this._originalExpand = {
      north_size: this.stadium.north_stand_size,
      south_size: this.stadium.south_stand_size,
      east_size: this.stadium.east_stand_size,
      west_size: this.stadium.west_stand_size,
      north_roof: this.stadium.north_stand_roof,
      south_roof: this.stadium.south_stand_roof,
      east_roof: this.stadium.east_stand_roof,
      west_roof: this.stadium.west_stand_roof
    }
    this.constructionInfo = stadiumResponse.constructionInfo || {}
    this.team = teamResponse.team
    this.attendanceData = attendanceResponse.attendance || []
    this.constructionHistory = historyResponse.history || []
  }

  /**
   * @param {Object} params
   * @param {string} params.sub_page
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ sub_page: subPage }) {
    const newSubPage = subPage || null
    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      this._switchSubPage()
      this._updateNav()
    }
  }

  /**
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async _onPriceFormSubmit (event) {
    event.preventDefault()
    try {
      await server.updatePrices(this.stadium)
      this._originalPrices = {
        north: this.stadium.north_stand_price,
        south: this.stadium.south_stand_price,
        east: this.stadium.east_stand_price,
        west: this.stadium.west_stand_price
      }
      this._updatePriceButton()
      toast(t('stadium.pricesUpdated'), 'success')
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  _updatePriceButton () {
    const btn = el(`${this._elementQuery} #save-prices-btn`)
    const cancelBtn = el(`${this._elementQuery} #cancel-prices-btn`)
    if (!btn) return
    const hasChange = ['north', 'south', 'east', 'west'].some(
      name => this.stadium[name + '_stand_price'] !== this._originalPrices[name]
    )
    btn.disabled = !hasChange
    btn.className = hasChange ? 'btn btn-success' : 'btn btn-primary'
    if (cancelBtn) cancelBtn.className = hasChange ? 'btn btn-secondary ml-2' : 'btn btn-secondary ml-2 d-none'
  }

  _resetPrices () {
    for (const name of ['north', 'south', 'east', 'west']) {
      this.stadium[name + '_stand_price'] = this._originalPrices[name]
      const input = el(`${this._elementQuery} [data-price-input="${name}"]`)
      if (input) input.value = this._originalPrices[name]
    }
    this._updatePriceButton()
  }

  _resetExpand () {
    for (const name of ['north', 'south', 'east', 'west']) {
      this.stadium[name + '_stand_size'] = this._originalExpand[name + '_size']
      this.stadium[name + '_stand_roof'] = this._originalExpand[name + '_roof']
      const sizeInput = el(`${this._elementQuery} [data-size-input="${name}"]`)
      if (sizeInput) sizeInput.value = this._originalExpand[name + '_size']
      const roofInput = el(`${this._elementQuery} [data-roof-input="${name}"]`)
      if (roofInput) roofInput.checked = !!this._originalExpand[name + '_roof']
    }
    this._hasValidConstruction = false
    const submitBtn = el(`${this._elementQuery} #start-construction-btn`)
    const cancelBtn = el(`${this._elementQuery} #cancel-expand-btn`)
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.className = 'btn btn-primary'
    }
    if (cancelBtn) cancelBtn.className = 'btn btn-secondary ml-2 d-none'
    const priceEl = el(`${this._elementQuery} #total-price`)
    if (priceEl) priceEl.innerText = '0 €'
    const previewEl = el(`${this._elementQuery} #construction-time-preview`)
    if (previewEl) previewEl.innerHTML = ''
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
    const submitBtn = el(`${this._elementQuery} #start-construction-btn`)
    const cancelBtn = el(`${this._elementQuery} #cancel-expand-btn`)

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
        submitBtn.className = hasValidChanges ? 'btn btn-success' : 'btn btn-primary'
      }
      if (cancelBtn) cancelBtn.className = hasValidChanges ? 'btn btn-secondary ml-2' : 'btn btn-secondary ml-2 d-none'
    } catch (e) {
      // Disable button on error
      this._hasValidConstruction = false
      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.className = 'btn btn-primary'
      }
      if (cancelBtn) cancelBtn.className = 'btn btn-secondary ml-2 d-none'
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
      <button type="submit" class="btn btn-primary" id="save-prices-btn" disabled>${t('stadium.savePrices')}</button>
      <button type="button" class="btn btn-secondary ml-2 d-none" id="cancel-prices-btn">${t('stadium.cancel')}</button>
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
             <small>${remaining > 0 ? t('stadium.constructionRemaining', { days: remaining }) : t('stadium.constructionCompletesToday')}</small>
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
      <button type="submit" class="btn btn-primary" id="start-construction-btn" disabled>${t('stadium.startConstruction')}</button>
      <button type="button" class="btn btn-secondary ml-2 d-none" id="cancel-expand-btn">${t('stadium.cancel')}</button>
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
        season: row.season + 1,
        day: row.gameDay + 1
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
          season: h.completed_season + 1,
          day: h.completed_game_day + 1
        })
        : `<span class="badge badge-warning">${t('stadium.inProgress')}</span>`
      return `<tr>
        <td>${t('stadium.' + h.stand)}</td>
        <td>${h.old_size.toLocaleString()}</td>
        <td>${h.new_size.toLocaleString()}</td>
        <td>${h.added_roof ? '✓' : '—'}</td>
        <td>${t('stadium.seasonDay', {
        season: h.started_season + 1,
        day: h.started_game_day + 1
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
    if (this._stadiumCanvas && !this.subPage) {
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
