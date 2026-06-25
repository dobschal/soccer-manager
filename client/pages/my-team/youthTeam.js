import { server, showServerError } from '../../lib/gateway.js'
import { el, generateId } from '../../lib/html.js'
import { onChange, onClick } from '../../lib/htmlEventHandlers.js'
import { UIElement } from '../../lib/UIElement.js'
import { toast } from '../../partials/toast.js'
import { showOverlay } from '../../partials/overlay.js'
import { t } from '../../i18n/index.js'
import { ProgressBar } from '../../partials/progressBar.js'
import { Table } from '../../partials/table.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { showTutorialIfNeeded } from '../../partials/tutorialOverlay.js'
import { fire } from '../../lib/event.js'

const TRAINING_MODES = [
  {
    key: 'training',
    icon: 'fa-bolt',
    effects: {
      level: 2,
      fitness: 1,
      moral: -1
    }
  },
  {
    key: 'friendly_match',
    icon: 'fa-futbol-o',
    effects: {
      level: 1,
      fitness: -1,
      moral: 1
    }
  },
  {
    key: 'rest',
    icon: 'fa-bed',
    effects: {
      level: 0,
      fitness: 2,
      moral: 1
    }
  }
]

const MAX_SLOTS_PER_MODE = 4

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
        <h3>${t('youthTeam.title')}</h3>

        <div class="mb-4">
          <p class="text-muted mb-1">${t('youthTeam.trainingModeDescPerPlayer')}</p>
          <p class="text-muted small mb-3">
            <i class="fa fa-graduation-cap"></i>
            ${t('youthTeam.academySlotsHint', {
    trainingSlots: this.slotsByMode.training,
    level: this.academyLevel
  })}
          </p>
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
    timerEl.textContent = t('youthTeam.nextGameDayIn', { time: timeRemaining })
  }

  /**
   * Get formatted time until next game day (midnight or noon)
   * @returns {string} - Formatted time string HH:MM:SS
   */
  _getTimeUntilNextGameDay () {
    const now = new Date()
    // Game days run on the server (CRON) at 00:00 and 12:00 UTC. We must
    // compute the next boundary in UTC, otherwise the remaining time is wrong
    // for every user outside the UTC timezone (#448). The resulting diff is an
    // absolute duration, so it is correct in the user's local time.
    const hours = now.getUTCHours()

    const nextGameDay = new Date(now)
    if (hours < 12) {
      // Next is noon (12:00 UTC) today
      nextGameDay.setUTCHours(12, 0, 0, 0)
    } else {
      // Next is midnight (00:00 UTC) tomorrow
      nextGameDay.setUTCDate(nextGameDay.getUTCDate() + 1)
      nextGameDay.setUTCHours(0, 0, 0, 0)
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
      return t('youthTeam.friendlyMatch')
    }
    return t('youthTeam.' + mode)
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
      <div class="card youth-mode-card flex-fill bg-info-subtle">
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
   * one. The server's per-player setter handles cross-mode moves naturally.
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
    await this.load()
    await this.update()
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
        { name: t('youthTeam.trainingMode') },
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

    const modeBadgeId = generateId()
    onClick(modeBadgeId, () => this._showModeSelect(modeBadgeId, player))
    const modeBadgeClass = player.training_mode ? 'bg-info' : 'bg-secondary'
    const modeLabel = player.training_mode ? this._getTrainingModeLabel(player.training_mode) : t('youthTeam.unassigned')
    const modeBadge = `<span id="${modeBadgeId}" class="badge ${modeBadgeClass} youth-mode-badge u-cursor-pointer" title="${t('youthTeam.changeTrainingMode')}">${modeLabel} <i class="fa fa-caret-down"></i></span>`

    return [
      `<span class="u-nowrap">${player.name}</span>`,
      renderPositionBadge(player.position),
      `${player.age}`,
      `${player.level.toFixed(2)}`,
      `${new ProgressBar(player.moral)}`,
      `${new ProgressBar(player.fitness)}`,
      modeBadge,
      `<span class="u-nowrap"><button
            id="${promoteId}"
            class="btn btn-sm btn-primary me-1"
            ${!canPromote ? 'disabled' : ''}
            title="${disabledReason}"
          ><i class="fa fa-arrow-up"></i> ${t('youthTeam.promote')}</button><button id="${fireId}" class="btn btn-sm btn-danger"><i class="fa fa-times"></i> ${t('youthTeam.fire')}</button></span>`
    ]
  }

  /**
   * Swap the clicked training-mode badge for an inline select so the user can
   * change the player's mode straight from the list (#youth).
   * @param {string} badgeId
   * @param {Object} player
   * @returns {void}
   */
  _showModeSelect (badgeId, player) {
    const badge = el('#' + badgeId)
    if (!badge) return
    const selectId = generateId()
    const current = player.training_mode || ''
    const options = [
      `<option value="" ${current === '' ? 'selected' : ''}>${t('youthTeam.unassigned')}</option>`,
      ...TRAINING_MODES.map(m =>
        `<option value="${m.key}" ${current === m.key ? 'selected' : ''}>${this._getTrainingModeLabel(m.key)}</option>`
      )
    ].join('')
    badge.outerHTML = `<select id="${selectId}" class="form-select form-select-sm youth-mode-inline-select">${options}</select>`
    onChange('#' + selectId, (ev) => this._handlePlayerModeChange(player, ev.target.value))
    const sel = el('#' + selectId)
    if (sel) {
      sel.focus()
      try { sel.showPicker?.() } catch { /* not supported everywhere */ }
    }
  }

  /**
   * Apply a training-mode change made from the player list. Assigns the player
   * to the chosen mode, taking the last free slot — or, when the mode is full,
   * freeing its last slot first (#youth). Reloads so the slot cards on top
   * reflect the new assignment.
   * @param {Object} player
   * @param {string} newMode - '' for unassigned, otherwise a training mode key
   * @returns {Promise<void>}
   */
  async _handlePlayerModeChange (player, newMode) {
    const target = newMode || null
    if ((player.training_mode || null) === target) {
      await this.update() // revert the inline select back to the badge
      return
    }
    try {
      if (target === null) {
        await server.setYouthPlayerTrainingMode(player.id, null)
      } else {
        const limit = this.slotsByMode?.[target] ?? MAX_SLOTS_PER_MODE
        const inMode = (this.youthPlayers || []).filter(p => p.training_mode === target && p.id !== player.id)
        if (inMode.length >= limit) {
          // No free slot — free the last one so the player can take it.
          await server.setYouthPlayerTrainingMode(inMode[inMode.length - 1].id, null)
        }
        await server.setYouthPlayerTrainingMode(player.id, target)
      }
      toast(t('youthTeam.trainingModeUpdated'), 'success')
    } catch (e) {
      showServerError(e)
    }
    await this.load()
    await this.update()
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
