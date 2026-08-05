import {UIElement} from '../../lib/UIElement.js'
import {server} from '../../lib/gateway.js'
import {el, generateId} from '../../lib/html.js'
import {toast} from '../../partials/toast.js'
import {StadiumCanvas} from '../../partials/stadiumCanvas.js'
import {showStadiumExpandModal} from '../../partials/stadiumExpandModal.js'
import {showTutorialIfNeeded} from '../../partials/tutorialOverlay.js'
import {t} from '../../i18n/index.js'
import {wikiInfoIcon} from '../../partials/wikiInfoIcon.js'
import {Table} from '../../partials/table.js'
import {showOverlay} from '../../partials/overlay.js'
import {onClick} from '../../lib/htmlEventHandlers.js'

const STANDS = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']

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
    this._originalPrices = this._snapshotPrices()
    this.constructionInfo = stadiumResponse.constructionInfo || {}
    this.team = teamResponse.team
    this.attendanceData = attendanceResponse.attendance || []
    this.constructionHistory = historyResponse.history || []
  }

  /**
   * @returns {string}
   */
  get template () {
    // Starts as a showcase: camera orbits on its own, the toggle in the canvas
    // corner hands the controls over to the user.
    this._stadiumCanvas = new StadiumCanvas(this.stadium, this.team, 'stadium-canvas', {
      interactive: false,
      autoRotate: true,
      controlsToggle: true
    })
    const stadiumName = this.stadium.name || t('stadium.yourStadium')
    return `
      <div>
        <h2 class="stadium-name-header u-cursor-pointer" title="${t('stadium.clickToEditName')}">
          ${stadiumName} <i class="fa fa-pencil" aria-hidden="true"></i> ${wikiInfoIcon('stadium')}
        </h2>
        <p>${t('stadium.stadiumDesc', {seats: this._stadiumCanvas.calculateTotalSeats()})}</p>
        <div class="mb-4" id="stadium-canvas-container">
          ${this._stadiumCanvas}
        </div>
        <h3>${t('stadium.ticketPrices')}</h3>
        <p>${t('stadium.adjustPrices')}</p>
        <form class="pb-4 mb-4" id="price-form">
          ${this._renderPriceForm()}
        </form>
        <h3>${t('stadium.attendance')}</h3>
        <p>${t('stadium.attendanceDesc')}</p>
        ${this._renderAttendanceSection()}
        <h3 class="mt-4">${t('stadium.constructionHistory')}</h3>
        <p>${t('stadium.constructionHistoryDesc')}</p>
        <button type="button" class="btn btn-info mb-4" id="open-expand-modal-btn">
          ${t('stadium.expandStadiumAction')}
        </button>
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
      '#open-expand-modal-btn': {
        click: () => this._showExpandModal()
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

  /**
   * Opens the expand-stadium overlay. The overlay owns the whole plan → price
   * → build flow; the page only has to refresh once a build was commissioned.
   */
  _showExpandModal () {
    showStadiumExpandModal(
      this.stadium,
      this.team,
      this.constructionInfo,
      () => void this.update(true)
    )
  }

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
      this._originalPrices = this._snapshotPrices()
      this._updatePriceButton()
      toast(t('stadium.pricesUpdated'), 'success')
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  /**
   * @returns {Object<string, number>}
   */
  _snapshotPrices () {
    const prices = {}
    for (const name of STANDS) {
      prices[name] = this.stadium[name + '_stand_price']
    }
    return prices
  }

  _updatePriceButton () {
    const btn = el(`${this._elementQuery} #save-prices-btn`)
    const cancelBtn = el(`${this._elementQuery} #cancel-prices-btn`)
    if (!btn) return
    const hasChange = STANDS.some(
      name => this.stadium[name + '_stand_price'] !== this._originalPrices[name]
    )
    btn.disabled = !hasChange
    btn.className = hasChange ? 'btn btn-primary' : 'btn btn-primary'
    if (cancelBtn) cancelBtn.className = hasChange ? 'btn btn-secondary ml-2' : 'btn btn-secondary ml-2 d-none'
  }

  _resetPrices () {
    for (const name of STANDS) {
      this.stadium[name + '_stand_price'] = this._originalPrices[name]
      const input = el(`${this._elementQuery} [data-price-input="${name}"]`)
      if (input) input.value = this._originalPrices[name]
    }
    this._updatePriceButton()
  }

  /**
   * @returns {string}
   */
  _renderPriceForm () {
    const formGroups = STANDS.map(name => `
      <div class="col-6 col-sm-3 mb-2">
        <div class="form-group">
          <label>
            ${t('stadium.priceFor', {stand: t('stadium.' + name)})}
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
  _renderAttendanceSection () {
    if (!this.attendanceData || this.attendanceData.length === 0) {
      return `<p class="text-muted mb-4">${t('stadium.noAttendanceData')}</p>`
    }

    const stands = STANDS

    return new Table({
      cols: [
        {name: ''},
        ...stands.map(s => ({name: t('stadium.' + s)}))
      ],
      renderRow: (row) => [
        t('stadium.seasonDay', {
          season: row.season + 1,
          day: row.gameDay + 1
        }),
        ...stands.map(s => {
          const data = row.stands[s] || {guests: 0, size: 0, percentage: 0}
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
        {name: t('stadium.stand')},
        {name: t('stadium.oldSize')},
        {name: t('stadium.newSize2')},
        {name: t('stadium.roofAdded')},
        {name: t('stadium.started')},
        {name: t('stadium.completed')}
      ],
      renderRow: (h) => [
        t('stadium.' + h.stand),
        h.old_size.toLocaleString(),
        h.new_size.toLocaleString(),
        h.added_roof ? '✓' : '—',
        t('stadium.seasonDay', {
          season: h.started_season + 1,
          day: h.started_game_day + 1
        }),
        h.completed_game_day != null
          ? t('stadium.seasonDay', {
            season: h.completed_season + 1,
            day: h.completed_game_day + 1
          })
          : `<span class="badge bg-warning text-dark">${t('stadium.inProgress')}</span>`
      ],
      data: this.constructionHistory,
      classes: 'table-sm table-striped'
    }).template
  }

}
