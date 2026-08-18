import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onChange, onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { Table } from '../../partials/table.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { fire } from '../../lib/event.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { TRAINING_MODES, MAX_SLOTS_PER_MODE } from './youthTrainingModes.js'
import { YouthPlayerRow } from './youthPlayerRow.js'
import { euroFormat } from '../../lib/currency.js'
import { getNextGameDayDate } from '../../util/gameDayTime.js'

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
    this.academyLevel = data.academyLevel || 1
    this.slotsByMode = data.slotsByMode || {
      training: 2,
      friendly_match: 2,
      rest: MAX_SLOTS_PER_MODE
    }
    this.season = data.season
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('youthTeam.title')} ${wikiInfoIcon('youth-players')}</h3>

        <div class="mb-4" id="${this._modeSelectorContainerId}">
          ${this._renderModeSelectorContent()}
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
   * Event-based updates for the youth-team page.
   *
   * A mode change on any youth player only affects two things: the row of
   * the affected player (which subscribes on its own via `YouthPlayerRow`)
   * and the training-mode selector cards at the top (whose slot dropdowns
   * list every youth player with their current mode as a suffix). We mutate
   * the local player state in place — `YouthPlayerRow` holds the same
   * reference so its own subscribe callback is idempotent — and surgically
   * replace the mode-selector wrapper's innerHTML. The surrounding page and
   * the youth-player table are left alone, so no per-row UIElement is
   * unmounted and no visible flicker.
   *
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]: (data) => {
        if (!data || !Array.isArray(this.youthPlayers)) return
        const player = this.youthPlayers.find(p => p.id === data.youthPlayerId)
        if (!player) return
        player.training_mode = data.newMode
        this._refreshModeSelector()
      }
    }
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
   * Stable id for the top mode-selector container. When
   * `YOUTH_PLAYER_TRAINING_MODE_CHANGED` arrives we replace only this section's
   * innerHTML — the surrounding page + the youth-player table stay mounted so
   * per-row UIElements keep their server-event subscriptions.
   */
  _modeSelectorContainerId = generateId()

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
    timerEl.textContent = t('youthTeam.nextGameDayIn', { time: timeRemaining })
  }

  /**
   * Get formatted time until next game day (midnight or noon)
   * @returns {string} - Formatted time string HH:MM:SS
   */
  _getTimeUntilNextGameDay () {
    const now = new Date()
    // The boundary has to be derived in UTC (see `getNextGameDayDate`); the
    // resulting diff is an absolute duration, so it is correct in the user's
    // local time.
    const diffMs = getNextGameDayDate(now) - now
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
      return t('youthTeam.friendlyMatch')
    }
    return t('youthTeam.' + mode)
  }

  /**
   * Rebuild the top mode-selector section in place. Called from the
   * `YOUTH_PLAYER_TRAINING_MODE_CHANGED` server-event handler so the slot
   * cards + option suffixes reflect the fresh state without touching the
   * youth-player table below.
   * @returns {void}
   * @private
   */
  _refreshModeSelector () {
    const wrapper = document.getElementById(this._modeSelectorContainerId)
    if (!wrapper) return
    wrapper.innerHTML = this._renderModeSelectorContent()
  }

  /**
   * Content of the mode-selector wrapper: intro copy, the three mode cards,
   * and the countdown line. Kept separate from `template` so surgical
   * refreshes can reuse it.
   * @returns {string}
   * @private
   */
  _renderModeSelectorContent () {
    return `
      <p class="text-muted mb-1">${t('youthTeam.trainingModeDescPerPlayer')}</p>
      <p class="text-muted small mb-3">
        <i class="fa fa-graduation-cap"></i>
        ${t('youthTeam.academySlotsHint', {
    trainingSlots: this.slotsByMode.training,
    level: this.academyLevel
  })}
      </p>
      ${this._renderTrainingModeSelector()}
    `
  }

  /**
   * @returns {string}
   */
  _renderTrainingModeSelector () {
    this.timerId = generateId()

    return `
      <div class="d-flex flex-column flex-md-row gap-3 w-100">
        ${TRAINING_MODES.map(mode => this._renderModeCard(mode)).join('')}
      </div>
      <small id="${this.timerId}" class="text-muted d-block mt-2"><i class="fa fa-clock-o"></i> ...</small>
    `
  }

  /**
   * @param {{key: string, icon: string, effects: object}} mode
   * @returns {string}
   */
  _renderModeCard (mode) {
    const modeName = mode.key === 'friendly_match' ? 'friendlyMatch' : mode.key
    const assigned = (this.youthPlayers || []).filter(p => p.training_mode === mode.key)
    const modeLimit = this.slotsByMode[mode.key] ?? MAX_SLOTS_PER_MODE
    const slots = []
    for (let i = 0; i < MAX_SLOTS_PER_MODE; i++) {
      slots.push(assigned[i] || null)
    }
    const fillRatio = `${assigned.length}/${modeLimit}`

    return `
      <div class="card youth-mode-card flex-fill border-info bg-info-subtle">
        <div class="card-body">
          <div class="youth-mode-header">
            <i class="fa ${mode.icon}"></i>
            <strong>${t('youthTeam.' + modeName)}</strong>
            <span class="badge bg-info ms-auto">${fillRatio}</span>
          </div>
          <div class="youth-mode-effects">
            ${this._renderEffectRow(t('youthTeam.level'), mode.effects.level, false)}
            ${this._renderEffectRow(t('youthTeam.fitness'), mode.effects.fitness, false)}
            ${this._renderEffectRow(t('youthTeam.moral'), mode.effects.moral, false)}
          </div>
          <div class="youth-slot-list">
            ${slots.map((p, idx) => this._renderSlot(mode.key, idx, p, idx < modeLimit)).join('')}
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render a single select slot for the mode card.
   * @param {string} mode
   * @param {number} idx
   * @param {object|null} currentPlayer
   * @param {boolean} enabled - false → render locked/disabled slot (academy level too low)
   * @returns {string}
   */
  _renderSlot (mode, idx, currentPlayer, enabled) {
    if (!enabled) {
      return `
        <select class="form-select form-select-sm youth-slot-select" disabled title="${t('youthTeam.slotLocked')}">
          <option>${t('youthTeam.slotLocked')}</option>
        </select>
      `
    }

    const selectId = generateId()
    onChange('#' + selectId, (ev) => {
      const raw = ev.target.value
      const newPlayerId = raw === '' ? null : Number(raw)
      this._handleSlotChange(mode, currentPlayer, newPlayerId)
    })

    const options = (this.youthPlayers || []).map(p => {
      const selected = currentPlayer && currentPlayer.id === p.id ? 'selected' : ''
      let suffix = ''
      if (p.training_mode && p.training_mode !== mode) {
        suffix = ` · ${this._getTrainingModeLabel(p.training_mode)}`
      }
      const label = `${p.name} · Lv ${Number(p.level || 0).toFixed(1)} · ${p.age}y${suffix}`
      return `<option value="${p.id}" ${selected}>${label}</option>`
    }).join('')

    return `
      <select id="${selectId}" class="form-select form-select-sm youth-slot-select">
        <option value="">${t('youthTeam.slotEmpty')}</option>
        ${options}
      </select>
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
   * Apply a slot change: unassign the previous occupant, then assign the new
   * one. The server's per-player setter handles cross-mode moves naturally
   * and emits `YOUTH_PLAYER_TRAINING_MODE_CHANGED` for each affected player,
   * which drives the surgical refresh of this section + the affected row.
   * @param {string} mode
   * @param {object|null} prevPlayer
   * @param {number|null} newPlayerId
   * @returns {Promise<void>}
   */
  async _handleSlotChange (mode, prevPlayer, newPlayerId) {
    if (prevPlayer && newPlayerId === prevPlayer.id) return
    try {
      if (prevPlayer && (newPlayerId === null || prevPlayer.id !== newPlayerId)) {
        await server.setYouthPlayerTrainingMode(prevPlayer.id, null)
      }
      if (newPlayerId !== null) {
        await server.setYouthPlayerTrainingMode(newPlayerId, mode)
      }
      toast(t('youthTeam.trainingModeUpdated'), 'success')
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
        { name: t('youthTeam.marketValue'), align: 'right' },
        { name: t('youthTeam.moral') },
        { name: t('youthTeam.fitness') },
        { name: t('youthTeam.trainingMode') },
        { name: t('youthTeam.actions') }
      ],
      data: this.youthPlayers,
      classes: 'table-striped',
      // Each row is a UIElement so it can subscribe to
      // `YOUTH_PLAYER_TRAINING_MODE_CHANGED` and refresh its cells atomically
      // without redrawing the whole table.
      rowElement: (player) => new YouthPlayerRow(player, this)
    })
  }

  /**
   * Apply a training-mode change made from the player list. Assigns the
   * player to the chosen mode, taking the last free slot — or, when the mode
   * is full, freeing its last slot first. The affected rows + the mode
   * selector above update themselves off the server events emitted by each
   * `setYouthPlayerTrainingMode` call, so no full page re-render is needed.
   * @param {Object} player
   * @param {string} newMode - '' for unassigned, otherwise a training mode key
   * @returns {Promise<void>}
   */
  async _handlePlayerModeChange (player, newMode) {
    const target = newMode || null
    if ((player.training_mode || null) === target) return
    try {
      if (target === null) {
        await server.setYouthPlayerTrainingMode(player.id, null)
        toast(t('youthTeam.trainingModeUpdated'), 'success')
        return
      }
      const limit = this.slotsByMode?.[target] ?? MAX_SLOTS_PER_MODE
      const inMode = (this.youthPlayers || []).filter(p => p.training_mode === target && p.id !== player.id)
      let removed = null
      if (inMode.length >= limit) {
        // The mode is already full — free its last occupant so the new player
        // can take the slot, and warn the user which player was pushed out
        // instead of silently swapping (#517).
        removed = inMode[inMode.length - 1]
        await server.setYouthPlayerTrainingMode(removed.id, null)
      }
      await server.setYouthPlayerTrainingMode(player.id, target)
      if (removed) {
        toast(t('youthTeam.modeFullPlayerReplaced', {
          removed: removed.name,
          mode: this._getTrainingModeLabel(target)
        }), 'warning')
      } else {
        toast(t('youthTeam.trainingModeUpdated'), 'success')
      }
    } catch (e) {
      showServerError(e)
    }
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
  _showSellConfirm (player) {
    const confirmId = generateId()

    onClick(confirmId, async () => {
      try {
        const { value } = await server.sellYouthPlayer(player.id)
        toast(t('youthTeam.sold', { playerName: player.name, value: euroFormat.format(value) }), 'success')
        overlay.remove()
        await this.load()
        await this.update()
      } catch (e) {
        showServerError(e)
      }
    })

    const overlay = showOverlay(
      t('youthTeam.sellConfirm', { playerName: player.name }),
      t('youthTeam.sellConfirmText', {
        playerName: player.name,
        value: euroFormat.format(player.market_value ?? 0)
      }),
      `<button id="${confirmId}" class="btn btn-success w-100">${t('youthTeam.sell')}</button>`
    )
  }
}
