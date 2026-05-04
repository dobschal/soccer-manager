import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { toast } from '../../partials/toast.js'
import { euroFormat } from '../../lib/currency.js'
import { StadiumCanvas } from '../../partials/stadiumCanvas.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { t } from '../../i18n/index.js'
import { Table } from '../../partials/table.js'
import { showOverlay } from '../../partials/overlay.js'
import { onClick } from '../../lib/htmlEventHandlers.js'

export class StadiumSubPage extends UIElement {
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
   * @returns {string}
   */
  get template () {
    this._stadiumCanvas = new StadiumCanvas(this.stadium, this.team, 'stadium-canvas')
    const stadiumName = this.stadium.name || t('stadium.yourStadium')
    return `
      <div>
        <h2 class="stadium-name-header u-cursor-pointer" title="${t('stadium.clickToEditName')}">
          ${stadiumName} <i class="fa fa-pencil" aria-hidden="true"></i>
        </h2>
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
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.stadium-name-header': {
        click: () => this._showStadiumNameEditor()
      },
      '#price-form': {
        submit: this._onPriceFormSubmit.bind(this),
        input: (event) => {
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
        input: (event) => {
          const sizeInput = event.target.closest('[data-size-input]')
          const roofInput = event.target.closest('[data-roof-input]')

          if (sizeInput) {
            const name = sizeInput.dataset.sizeInput
            this.stadium[name + '_stand_size'] = Number(sizeInput.value)
          } else if (roofInput) {
            const name = roofInput.dataset.roofInput
            this.stadium[name + '_stand_roof'] = roofInput.checked ? 1 : 0
          } else {
            return
          }

          clearTimeout(this._updatePriceTimeout)
          this._updatePriceTimeout = setTimeout(() => this._updatePrice(), 500)
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
    clearTimeout(this._updatePriceTimeout)
    if (this._stadiumCanvas) {
      this._stadiumCanvas.onDestroy()
      this._stadiumCanvas = null
    }
  }
  stadium = {}

  team = {}

  constructionInfo = {}
  attendanceData = []
  constructionHistory = []
  /** @type {StadiumCanvas|null} */
  _stadiumCanvas = null
  /** @type {boolean} */
  _hasValidConstruction = false
  /** @type {ReturnType<typeof setTimeout>|null} */
  _updatePriceTimeout = null

  _showStadiumNameEditor () {
    const inputId = generateId()
    const saveBtnId = generateId()
    const escapeAttr = (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const currentName = this.stadium.name || ''
    const overlay = showOverlay(
      t('stadium.editStadiumName'),
      t('stadium.editStadiumNameDesc'),
      `
        <div class="form-group mb-3">
          <input id="${inputId}" type="text" class="form-control" maxlength="100" value="${escapeAttr(currentName)}">
        </div>
        <button id="${saveBtnId}" class="btn btn-primary w-100">${t('common.save')}</button>
      `
    )
    setTimeout(() => {
      const input = document.getElementById(inputId)
      if (input) input.focus()
    })
    onClick('#' + saveBtnId, async () => {
      const input = document.getElementById(inputId)
      if (!input) return
      const newName = input.value.trim()
      if (!newName) {
        toast(t('stadium.nameRequired'), 'error')
        return
      }
      try {
        await server.updateStadiumName(newName)
        this.stadium.name = newName
        toast(t('stadium.nameUpdated'), 'success')
        overlay.remove()
        await this.update()
      } catch (e) {
        toast(e.message ?? t('toast.somethingWentWrong'), 'error')
      }
    })
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
    btn.className = hasChange ? 'btn btn-primary' : 'btn btn-primary'
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
        submitBtn.className = hasValidChanges ? 'btn btn-primary' : 'btn btn-primary'
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

    return new Table({
      cols: [
        { name: '' },
        ...stands.map(s => ({ name: t('stadium.' + s) }))
      ],
      renderRow: (row) => [
        t('stadium.seasonDay', { season: row.season + 1, day: row.gameDay + 1 }),
        ...stands.map(s => {
          const data = row.stands[s]
          return `<span class="d-none d-sm-inline">${data.guests.toLocaleString()} / ${data.size.toLocaleString()} </span>${data.percentage}%`
        })
      ],
      data: this.attendanceData,
      classes: 'table-sm table-striped'
    }).template
  }

  /**
   * @returns {string}
   */
  _renderConstructionHistory () {
    if (!this.constructionHistory || this.constructionHistory.length === 0) {
      return `<p class="text-muted mb-4">${t('stadium.noConstructionHistory')}</p>`
    }

    return new Table({
      cols: [
        { name: t('stadium.stand') },
        { name: t('stadium.oldSize') },
        { name: t('stadium.newSize2') },
        { name: t('stadium.roofAdded') },
        { name: t('stadium.started') },
        { name: t('stadium.completed') }
      ],
      renderRow: (h) => [
        t('stadium.' + h.stand),
        h.old_size.toLocaleString(),
        h.new_size.toLocaleString(),
        h.added_roof ? '✓' : '—',
        t('stadium.seasonDay', { season: h.started_season + 1, day: h.started_game_day + 1 }),
        h.completed_game_day != null
          ? t('stadium.seasonDay', { season: h.completed_season + 1, day: h.completed_game_day + 1 })
          : `<span class="badge badge-warning">${t('stadium.inProgress')}</span>`
      ],
      data: this.constructionHistory,
      classes: 'table-sm table-striped'
    }).template
  }
  
}
