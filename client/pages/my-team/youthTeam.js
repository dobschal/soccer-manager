import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { ProgressBar } from '../../partials/progressBar.js'
import { Table } from '../../partials/table.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { fire } from '../../lib/event.js'

export class YouthTeamPage extends UIElement {
  /**
   * @param {UIElement} parent - Parent component to trigger updates
   */
  constructor (parent) {
    super()
    this.parent = parent
    this.timerInterval = null
    this.timerId = null
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('youthTeam.title')}</h3>

        <div class="mb-4">
          <p class="text-muted">${t('youthTeam.trainingModeDesc')}</p>
          ${this._renderTrainingModeSelector()}
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
   * Called when component is mounted to DOM
   * @returns {void}
   */
  onMounted () {
    this._startTimer()
    void showTutorialIfNeeded('youth', this)
  }

  /**
   * Called when component is unmounted from DOM
   * @returns {void}
   */
  onUnmounted () {
    this._stopTimer()
  }

  /**
   * Start the countdown timer
   * @returns {void}
   */
  _startTimer () {
    this._stopTimer()
    this._updateTimer()
    this.timerInterval = setInterval(() => this._updateTimer(), 1000)
  }

  /**
   * Stop the countdown timer
   * @returns {void}
   */
  _stopTimer () {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  /**
   * Update the timer display
   * @returns {void}
   */
  _updateTimer () {
    if (!this.timerId) return
    const timerEl = el(this.timerId)
    if (!timerEl) return

    const timeRemaining = this._getTimeUntilNextGameDay()
    const modeLabel = this._getTrainingModeLabel(this.trainingMode)
    timerEl.textContent = t('youthTeam.nextTrainingIn', {
      mode: modeLabel,
      time: timeRemaining
    })
  }

  /**
   * Get formatted time until next game day (midnight or noon)
   * @returns {string} - Formatted time string HH:MM:SS
   */
  _getTimeUntilNextGameDay () {
    const now = new Date()
    const hours = now.getHours()

    // Next game day is at midnight (0:00) or noon (12:00)
    let nextGameDay = new Date(now)
    if (hours < 12) {
      // Next is noon today
      nextGameDay.setHours(12, 0, 0, 0)
    } else {
      // Next is midnight tomorrow
      nextGameDay.setDate(nextGameDay.getDate() + 1)
      nextGameDay.setHours(0, 0, 0, 0)
    }

    const diffMs = nextGameDay - now
    const diffSeconds = Math.floor(diffMs / 1000)
    const h = Math.floor(diffSeconds / 3600)
    const m = Math.floor((diffSeconds % 3600) / 60)
    const s = diffSeconds % 60

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * Get the display label for a training mode
   * @param {string} mode
   * @returns {string}
   */
  _getTrainingModeLabel (mode) {
    if (mode === 'friendly_match') {
      return t('youthTeam.friendlyMatch').toLowerCase()
    }
    return t('youthTeam.' + mode).toLowerCase()
  }

  /**
   * @returns {string}
   */
  _renderTrainingModeSelector () {
    const modes = [
      {
        key: 'training',
        icon: 'fa-bolt'
      },
      {
        key: 'friendly_match',
        icon: 'fa-futbol-o'
      },
      {
        key: 'rest',
        icon: 'fa-bed'
      }
    ]

    // Generate timer ID for the active mode
    this.timerId = generateId()

    return `
      <div class="d-flex flex-column flex-md-row gap-2 w-100" role="group">
        ${modes.map(mode => {
      const id = generateId()
      const isActive = this.trainingMode === mode.key
      onClick(id, () => this._setTrainingMode(mode.key))
      return `
            <button
              id="${id}"
              class="btn ${isActive ? 'btn-primary' : 'btn-outline-secondary'} flex-fill"
            >
              <i class="fa ${mode.icon}"></i><br>
              <strong>${t('youthTeam.' + (mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key))}</strong><br>
              <small>${t('youthTeam.' + (mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key) + 'Desc')}</small>
              ${isActive ? `<br><small id="${this.timerId}" class="text-light opacity-75"><i class="fa fa-clock-o"></i> ...</small>` : ''}
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

    return new Table({
      cols: [
        { name: t('youthTeam.name') },
        { name: t('youthTeam.position') },
        { name: t('youthTeam.age') },
        { name: t('youthTeam.level') },
        { name: t('youthTeam.moral') },
        { name: t('youthTeam.fitness') },
        { name: t('youthTeam.actions') }
      ],
      data: this.youthPlayers,
      classes: 'table-striped',
      renderRow: (player) => this._renderYouthPlayerRow(player)
    })
  }

  /**
   * @param {Object} player
   * @returns {string}
   */
  _renderYouthPlayerRow (player) {
    const promoteId = generateId()
    const fireId = generateId()
    const isOldEnough = player.age >= 16
    const canPromote = isOldEnough

    onClick(promoteId, () => this._showPromoteConfirm(player))
    onClick(fireId, () => this._showFireConfirm(player))

    let disabledReason = ''
    if (!isOldEnough) {
      disabledReason = t('youthTeam.playerTooYoung')
    }

    return [
      `<span style="white-space:nowrap">${player.name}</span>`,
      `<span class="badge bg-secondary">${player.position}</span>`,
      `${player.age}`,
      `${player.level.toFixed(2)}`,
      `${new ProgressBar(player.moral)}`,
      `${new ProgressBar(player.fitness)}`,
      `<span style="white-space:nowrap"><button
            id="${promoteId}"
            class="btn btn-sm btn-primary me-1"
            ${!canPromote ? 'disabled' : ''}
            title="${disabledReason}"
          ><i class="fa fa-arrow-up"></i> ${t('youthTeam.promote')}</button><button id="${fireId}" class="btn btn-sm btn-danger"><i class="fa fa-times"></i> ${t('youthTeam.fire')}</button></span>`
    ]
  }

  /**
   * @param {Object} player
   * @returns {void}
   */
  _showPromoteConfirm (player) {
    const confirmId = generateId()
    const level = Math.floor(player.level)

    onClick(confirmId, async () => {
      try {
        await server.promoteYouthPlayer(player.id)
        toast(t('youthTeam.promoted', { playerName: player.name }), 'success')
        overlay.remove()
        fire('YOUTH_PLAYER_PROMOTED')
        await this.load()
        await this.update()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('youthTeam.promoteConfirm', { playerName: player.name }),
      t('youthTeam.promoteConfirmText', {
        playerName: player.name,
        level
      }),
      `<button id="${confirmId}" class="btn btn-primary w-100">${t('youthTeam.promote')}</button>`
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
