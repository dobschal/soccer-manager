import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { ProgressBar } from '../../partials/progressBar.js'
import { Table } from '../../partials/table.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
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
  get template () {
    return `
      <div>
        <h3>${t('youthTeam.title')}</h3>

        <div class="mb-4">
          <p class="text-muted">${t('youthTeam.trainingModeDesc')}</p>
          ${this._renderTrainingModeSelector()}
        </div>

        ${this._renderYouthPlayerTable()}

        ${this._hasPlayerAtAge(18)
    ? `<div class="alert alert-warning mt-3">
          <i class="fa fa-exclamation-triangle"></i> ${t('youthTeam.retirementWarning')}
        </div>`
    : ''}
      </div>
    `
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
   * Called when component is removed from DOM
   * @returns {void}
   */
  onDestroy () {
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
        icon: 'fa-bolt',
        effects: { level: 2, fitness: 1, moral: -1 }
      },
      {
        key: 'friendly_match',
        icon: 'fa-futbol-o',
        effects: { level: 1, fitness: -1, moral: 1 }
      },
      {
        key: 'rest',
        icon: 'fa-bed',
        effects: { level: 0, fitness: 2, moral: 1 }
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
    const modeName = mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key
    return `
            <button
              id="${id}"
              class="btn ${isActive ? 'btn-primary' : 'btn-outline-secondary'} flex-fill youth-mode-btn"
            >
              <div class="youth-mode-header">
                <i class="fa ${mode.icon}"></i>
                <strong>${t('youthTeam.' + modeName)}</strong>
              </div>
              <div class="youth-mode-effects">
                ${this._renderEffectRow(t('youthTeam.level'), mode.effects.level, isActive)}
                ${this._renderEffectRow(t('youthTeam.fitness'), mode.effects.fitness, isActive)}
                ${this._renderEffectRow(t('youthTeam.moral'), mode.effects.moral, isActive)}
              </div>
              ${isActive ? `<small id="${this.timerId}" class="text-light opacity-75"><i class="fa fa-clock-o"></i> ...</small>` : ''}
            </button>
          `
  }).join('')}
      </div>
    `
  }

  /**
   * Render a single effect row with +/- icons
   * @param {string} label - Effect name (Level, Fitness, Moral)
   * @param {number} value - Effect strength (-2 to +2)
   * @param {boolean} isActive - Whether this mode is currently selected
   * @returns {string}
   */
  _renderEffectRow (label, value, isActive) {
    if (value === 0) return ''
    const isPositive = value > 0
    const colorClass = isPositive
      ? (isActive ? 'youth-effect-positive-active' : 'youth-effect-positive')
      : (isActive ? 'youth-effect-negative-active' : 'youth-effect-negative')
    const icon = isPositive ? 'fa-plus' : 'fa-minus'
    const count = Math.abs(value)
    const icons = Array(count).fill(`<i class="fa ${icon}"></i>`).join('')
    return `
      <div class="youth-mode-effect">
        <span class="youth-effect-label">${label}</span>
        <span class="${colorClass}">${icons}</span>
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
   * @param {number} age
   * @returns {boolean}
   */
  _hasPlayerAtAge (age) {
    return Array.isArray(this.youthPlayers) && this.youthPlayers.some(p => p.age === age)
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
      `<span class="u-nowrap">${player.name}</span>`,
      renderPositionBadge(player.position),
      `${player.age}`,
      `${player.level.toFixed(2)}`,
      `${new ProgressBar(player.moral)}`,
      `${new ProgressBar(player.fitness)}`,
      `<span class="u-nowrap"><button
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
