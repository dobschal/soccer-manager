import { server, showServerError } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'

export class YouthTeamPage extends UIElement {
  /**
   * @param {UIElement} parent - Parent component to trigger updates
   */
  constructor (parent) {
    super()
    this.parent = parent
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('youthTeam.title')}</h3>

        <div class="card mb-4 border-0">
          <div class="card-header text-white" style="background: linear-gradient(136deg, #222 0%, #333 100%);">
            <h5 class="card-title mb-0">${t('youthTeam.trainingMode')}</h5>
          </div>
          <div class="card-body">
            <p class="text-muted">${t('youthTeam.trainingModeDesc')}</p>
            <p class="text-muted small"><i class="fa fa-lightbulb-o"></i> ${t('youthTeam.idealRhythm')}</p>
            ${this._renderTrainingModeSelector()}
          </div>
        </div>

        ${this._renderYouthPlayerTable()}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const data = await server.getYouthTeam()
    this.youthPlayers = data.youthPlayers
    this.trainingMode = data.trainingMode
    this.season = data.season
  }

  /**
   * @returns {string}
   */
  _renderTrainingModeSelector () {
    const modes = [
      { key: 'training', icon: 'fa-dumbbell' },
      { key: 'friendly_match', icon: 'fa-futbol-o' },
      { key: 'rest', icon: 'fa-bed' }
    ]

    return `
      <div class="btn-group w-100" role="group">
        ${modes.map(mode => {
          const id = generateId()
          const isActive = this.trainingMode === mode.key
          onClick(id, () => this._setTrainingMode(mode.key))
          return `
            <button
              id="${id}"
              class="btn ${isActive ? 'btn-primary' : 'btn-outline-secondary'}"
              style="flex: 1;"
            >
              <i class="fa ${mode.icon}"></i><br>
              <strong>${t('youthTeam.' + (mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key))}</strong><br>
              <small class="text-muted">${t('youthTeam.' + (mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key) + 'Desc')}</small>
            </button>
          `
        }).join('')}
      </div>
    `
  }

  /**
   * @param {string} mode
   * @returns {Promise<void>}
   */
  async _setTrainingMode (mode) {
    try {
      await server.setYouthTrainingMode(mode)
      this.trainingMode = mode
      toast(t('youthTeam.trainingModeUpdated'), 'success')
      await this.update()
    } catch (e) {
      showServerError(e)
    }
  }

  /**
   * @returns {string}
   */
  _renderYouthPlayerTable () {
    if (!this.youthPlayers || this.youthPlayers.length === 0) {
      return `
        <div class="alert alert-info">
          <i class="fa fa-info-circle"></i> ${t('youthTeam.noYouthPlayers')}
        </div>
      `
    }

    return `
      <div class="table-responsive">
        <table class="table table-striped">
          <thead>
            <tr>
              <th>${t('youthTeam.name')}</th>
              <th>${t('youthTeam.position')}</th>
              <th>${t('youthTeam.age')}</th>
              <th>${t('youthTeam.level')}</th>
              <th>${t('youthTeam.moral')}</th>
              <th>${t('youthTeam.fitness')}</th>
              <th>${t('youthTeam.actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${this.youthPlayers.map(player => this._renderYouthPlayerRow(player)).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  /**
   * @param {Object} player
   * @returns {string}
   */
  _renderYouthPlayerRow (player) {
    const promoteId = generateId()
    const fireId = generateId()
    const canPromote = player.age >= 16

    onClick(promoteId, () => this._showPromoteConfirm(player))
    onClick(fireId, () => this._showFireConfirm(player))

    return `
      <tr>
        <td>${player.name}</td>
        <td><span class="badge bg-secondary">${player.position}</span></td>
        <td>${player.age}</td>
        <td>${player.level.toFixed(2)}</td>
        <td>${this._renderProgressBar(player.moral, 'warning')}</td>
        <td>${this._renderProgressBar(player.fitness, 'success')}</td>
        <td>
          <button
            id="${promoteId}"
            class="btn btn-sm btn-success me-1"
            ${!canPromote ? 'disabled' : ''}
            title="${!canPromote ? t('youthTeam.playerTooYoung') : ''}"
          >
            <i class="fa fa-arrow-up"></i> ${t('youthTeam.promote')}
          </button>
          <button id="${fireId}" class="btn btn-sm btn-danger">
            <i class="fa fa-times"></i> ${t('youthTeam.fire')}
          </button>
        </td>
      </tr>
    `
  }

  /**
   * @param {number} value - Value between 0 and 1
   * @param {string} colorClass - Bootstrap color class (success, warning, danger, etc.)
   * @returns {string}
   */
  _renderProgressBar (value, colorClass) {
    const percentage = Math.round(value * 100)
    return `
      <div class="progress" style="height: 20px; min-width: 80px;">
        <div
          class="progress-bar bg-${colorClass}"
          role="progressbar"
          style="width: ${percentage}%"
          aria-valuenow="${percentage}"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          ${percentage}%
        </div>
      </div>
    `
  }

  /**
   * @param {Object} player
   * @returns {void}
   */
  _showPromoteConfirm (player) {
    const confirmId = generateId()
    const level = Math.max(1, Math.round(player.level))

    onClick(confirmId, async () => {
      try {
        await server.promoteYouthPlayer(player.id)
        toast(t('youthTeam.promoted', { playerName: player.name }), 'success')
        overlay.remove()
        await this.load()
        await this.update()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('youthTeam.promoteConfirm', { playerName: player.name }),
      t('youthTeam.promoteConfirmText', { playerName: player.name, level }),
      `<button id="${confirmId}" class="btn btn-success w-100">${t('youthTeam.promote')}</button>`
    )
  }

  /**
   * @param {Object} player
   * @returns {void}
   */
  _showFireConfirm (player) {
    const confirmId = generateId()

    onClick(confirmId, async () => {
      try {
        await server.fireYouthPlayer(player.id)
        toast(t('youthTeam.fired', { playerName: player.name }), 'success')
        overlay.remove()
        await this.load()
        await this.update()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('youthTeam.fireConfirm', { playerName: player.name }),
      t('youthTeam.fireConfirmText', { playerName: player.name }),
      `<button id="${confirmId}" class="btn btn-danger w-100">${t('youthTeam.fire')}</button>`
    )
  }
}
