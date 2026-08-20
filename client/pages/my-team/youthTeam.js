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
import { TRAINING_MODES, MAX_SLOTS_PER_MODE, DEFAULT_TRAINING_MODE, effectiveTrainingMode } from './youthTrainingModes.js'
import { YouthPlayerRow } from './youthPlayerRow.js'
import { euroFormat } from '../../lib/currency.js'
import { getNextGameDayDate } from '../../util/gameDayTime.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { shortenPlayerName } from '../../util/player.js'
import { StadiumCanvas } from '../../partials/stadiumCanvas.js'
import { BUILDING_BACKDROP_VIEWS } from '../../partials/clubBuildingsScene.js'
import { cachedBuildingStill, rememberBuildingStill } from '../../lib/buildingStill.js'

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
    // `rest` comes back as `null` — it is the default mode every unassigned
    // player falls into, so it can never be full.
    this.slotsByMode = data.slotsByMode || {
      training: 2,
      friendly_match: 2,
      rest: null
    }
    this.season = data.season
    await this._prepareAcademyBackdrop()
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>${t('youthTeam.title')} ${wikiInfoIcon('youth-players')}</h3>

        ${this._renderSquadPhoto()}

        ${this._renderYouthPlayerTable()}

        ${this._hasPlayerAtAge(18)
    ? `<div class="alert alert-warning mt-3">
          <i class="fa fa-exclamation-triangle"></i> ${t('youthTeam.retirementWarning')}
        </div>`
    : ''}

        <div class="mt-4" id="${this._modeSelectorContainerId}">
          ${this._renderModeSelectorContent()}
        </div>

        ${this._renderAcademyRenderCanvas()}
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
    this._loadSquadPhotoImages()
    void this._captureAcademyBackdrop()
    void showTutorialIfNeeded('youth', this)
  }
  /**
   * A promote/sell re-renders the whole page, so the squad photo needs its
   * portraits filled in again.
   * @returns {void}
   */
  onUpdate () {
    this._loadSquadPhotoImages()
    this._applyAcademyBackdrop()
  }
  /**
   * Called when component is removed from DOM
   * @returns {void}
   */
  onDestroy () {
    this._stopTimer()
    this._disposeAcademyCanvas()
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
    const assigned = this._playersInMode(mode.key)
    const modeLimit = this._slotLimit(mode.key)
    const fillRatio = modeLimit === Infinity ? `${assigned.length}` : `${assigned.length}/${modeLimit}`

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
            ${this._renderSlots(mode.key, assigned, modeLimit)}
          </div>
        </div>
      </div>
    `
  }

  /**
   * The youth players currently in a mode. A player without an own
   * `training_mode` rests, so they show up in the rest card.
   * @param {string} mode
   * @returns {Array<object>}
   * @private
   */
  _playersInMode (mode) {
    return (this.youthPlayers || []).filter(p => effectiveTrainingMode(p) === mode)
  }

  /**
   * How many players may stand in a mode. `rest` is the default every
   * unassigned player falls into, so it is unbounded — the server sends `null`
   * for it.
   * @param {string} mode
   * @returns {number}
   * @private
   */
  _slotLimit (mode) {
    if (mode === DEFAULT_TRAINING_MODE) return Infinity
    const limit = this.slotsByMode?.[mode]
    return typeof limit === 'number' ? limit : MAX_SLOTS_PER_MODE
  }

  /**
   * The selects of one mode card: one per assigned player plus a single spare
   * one below them, so there is always exactly one free slot to fill and no row
   * of empty selects. When the mode is full, that spare slot is the
   * locked "upgrade the academy" hint instead — and once the mode is maxed out
   * there is nothing left to show, so the extra select is dropped.
   * @param {string} mode
   * @param {Array<object>} assigned
   * @param {number} modeLimit
   * @returns {string}
   * @private
   */
  _renderSlots (mode, assigned, modeLimit) {
    const slots = assigned.map(player => this._renderSlot(mode, player, true))
    if (assigned.length < modeLimit) {
      // Only worth an empty select while there is somebody left to put in it.
      if (this._assignableTo(mode).length > 0) slots.push(this._renderSlot(mode, null, true))
    } else if (modeLimit < MAX_SLOTS_PER_MODE) {
      slots.push(this._renderSlot(mode, null, false))
    }
    return slots.join('')
  }

  /**
   * The players a mode's free slot can be filled with — everybody who is not
   * already in that mode.
   * @param {string} mode
   * @returns {Array<object>}
   * @private
   */
  _assignableTo (mode) {
    return (this.youthPlayers || []).filter(p => effectiveTrainingMode(p) !== mode)
  }

  /**
   * Render a single select slot for the mode card.
   * @param {string} mode
   * @param {object|null} currentPlayer
   * @param {boolean} enabled - false → render locked/disabled slot (academy level too low)
   * @returns {string}
   */
  _renderSlot (mode, currentPlayer, enabled) {
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

    // The slot's own player plus everybody who could take the slot over —
    // offering a player who already stands in this mode would do nothing.
    const options = (this.youthPlayers || []).filter(p =>
      (currentPlayer && currentPlayer.id === p.id) || effectiveTrainingMode(p) !== mode
    ).map(p => {
      const selected = currentPlayer && currentPlayer.id === p.id ? 'selected' : ''
      const playerMode = effectiveTrainingMode(p)
      const suffix = playerMode === mode ? '' : ` · ${this._getTrainingModeLabel(playerMode)}`
      const label = `${p.name} · Lv ${Number(p.level || 0).toFixed(1)} · ${p.age}y${suffix}`
      return `<option value="${p.id}" ${selected}>${label}</option>`
    }).join('')

    // Clearing a slot sends the player back to rest, so the rest card itself has
    // nothing to clear — its occupied slots only offer a swap.
    const canClear = !currentPlayer || mode !== DEFAULT_TRAINING_MODE
    return `
      <select id="${selectId}" class="form-select form-select-sm youth-slot-select">
        ${canClear ? `<option value="">${t('youthTeam.slotEmpty')}</option>` : ''}
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

  /** Portrait width in px. The SVG is sized in JS, so this cannot be CSS. */
  static SQUAD_PHOTO_PORTRAIT_SIZE = 84

  /**
   * Size of the academy still used as the photo's backdrop. Rendered at roughly
   * twice the frame's CSS width so it stays sharp on a 2x display — the photo is
   * as wide as the page, and a 960px still was visibly soft there.
   */
  static ACADEMY_STILL = Object.freeze({width: 1920, height: 800})

  /**
   * The youth squad as a team photo in front of the academy: two staggered rows
   * on the pitch, each player with their name and position (#563).
   *
   * Portraits are SVGs loaded over the network, so the markup only carries
   * placeholders here and `_loadSquadPhotoImages` fills them once the page is
   * in the DOM — the same approach the transfer market uses.
   * @returns {string}
   * @private
   */
  _renderSquadPhoto () {
    const players = this.youthPlayers || []
    if (players.length === 0) return ''

    const {back, front} = this._splitIntoPhotoRows(players)
    // Two centred rows land in each other's gaps as soon as their counts differ
    // by an odd number. When they differ by an even one the back row would sit
    // right on top of the front row, so it is nudged over by half a slot.
    const offset = (front.length - back.length) % 2 === 0 ? ' youth-squad-row--offset' : ''

    // A still that is already known goes straight into the markup, so a cached
    // backdrop is there on the first frame instead of one grey one. Inline
    // because a data URL cannot live in a stylesheet.
    const backdrop = this._academyStill ? ` style="background-image: url('${this._academyStill}')"` : ''

    return `
      <div class="youth-squad-photo mb-4"${backdrop} data-youth-squad-photo>
        <div class="youth-squad-scroller">
          <div class="youth-squad-rows">
            ${back.length ? `<div class="youth-squad-row youth-squad-row--back${offset}">${this._renderPhotoRow(back)}</div>` : ''}
            <div class="youth-squad-row youth-squad-row--front">${this._renderPhotoRow(front)}</div>
          </div>
        </div>
        <div class="youth-squad-photo-caption">${this._squadPhotoCaption()}</div>
      </div>
    `
  }

  /**
   * @param {Array<object>} row
   * @returns {string}
   * @private
   */
  _renderPhotoRow (row) {
    return row.map(p => `
      <figure class="youth-squad-member">
        <div class="youth-squad-portrait" data-youth-portrait="${p.id}"></div>
        <figcaption class="youth-squad-caption">
          <span class="youth-squad-name">${shortenPlayerName(p.name)}</span>
          ${renderPositionBadge(p.position)}
        </figcaption>
      </figure>
    `).join('')
  }

  /**
   * @returns {string}
   * @private
   */
  _squadPhotoCaption () {
    const teamName = this.parent?.data?.team?.name
    return [teamName, t('youthTeam.squadPhotoCaption', { season: (this.season ?? 0) + 1 })]
      .filter(Boolean)
      .join(' · ')
  }

  /**
   * Split the squad over the photo's two rows. The front row always takes one
   * more than half, so it is the wider one and the back row fits into its gaps:
   * 3 players stand 2 + 1, four 3 + 1, five 3 + 2, six 4 + 2, and so on. Up to
   * two players there is no back row at all.
   * @param {Array<object>} players
   * @returns {{back: Array<object>, front: Array<object>}}
   * @private
   */
  _splitIntoPhotoRows (players) {
    const frontCount = Math.floor(players.length / 2) + 1
    return {
      back: players.slice(frontCount),
      front: players.slice(0, frontCount)
    }
  }

  /**
   * Fill the squad photo's portrait placeholders. The shirt colour and emblem
   * come from the A-team the youth players belong to; without a parent page to
   * ask, `renderPlayerImage` falls back to a neutral grey shirt.
   * @returns {void}
   * @private
   */
  _loadSquadPhotoImages () {
    if (!this._isMounted) return
    const team = this.parent?.data?.team ?? null
    for (const player of this.youthPlayers || []) {
      const selector = `${this._elementQuery} [data-youth-portrait="${player.id}"]`
      const placeholder = document.querySelector(selector)
      if (!placeholder || placeholder.dataset.loaded) continue
      placeholder.dataset.loaded = '1'
      renderPlayerImage(player, team, YouthTeamPage.SQUAD_PHOTO_PORTRAIT_SIZE).then(image => {
        const target = document.querySelector(selector)
        if (target) target.innerHTML = image
      })
    }
  }

  /**
   * The photo's backdrop is the club's own academy, cropped out of the same 3D
   * scene the buildings page orbits — so the squad stands in front of the
   * building the player actually built, at the level they built it to.
   *
   * Rendering it means booting a WebGL scene, which is far too much for a
   * backdrop on every visit. So the still is shared through
   * `lib/buildingStill.js`: if the buildings page (or an earlier visit here)
   * already rendered this level, it costs nothing, and only otherwise is an
   * off-screen canvas put up — once per level and app session.
   * @returns {Promise<void>}
   * @private
   */
  async _prepareAcademyBackdrop () {
    this._academyStill = cachedBuildingStill('youth_academy', this.academyLevel)
    this._academyCanvas = null
    if (this._academyStill || (this.youthPlayers || []).length === 0) return

    // The scene needs the stadium and the team it belongs to; the academy level
    // comes from the youth data we already have.
    try {
      const stadiumResponse = await server.getStadium()
      this._academyCanvas = new StadiumCanvas(
        stadiumResponse?.stadium || {},
        this.parent?.data?.team || {},
        'youth-academy-still-canvas',
        {
          interactive: false,
          focus: 'buildings',
          buildings: [{type: 'youth_academy', level: this.academyLevel}]
        }
      )
    } catch {
      // No stadium, no scene — the painted fallback backdrop stays.
      this._academyCanvas = null
    }
  }

  /**
   * The off-screen host for the academy still. Only rendered when a still has
   * to be taken; `_captureAcademyBackdrop` tears it down again right after.
   * @returns {string}
   * @private
   */
  _renderAcademyRenderCanvas () {
    if (!this._academyCanvas) return ''
    return `<div class="youth-academy-still" aria-hidden="true">${this._academyCanvas}</div>`
  }

  /**
   * @returns {Promise<void>}
   * @private
   */
  async _captureAcademyBackdrop () {
    const canvas = this._academyCanvas
    if (!canvas) {
      this._applyAcademyBackdrop()
      return
    }
    try {
      canvas.onMounted()
      if (!(await canvas.whenReady())) return
      const {width, height} = YouthTeamPage.ACADEMY_STILL
      const still = canvas.captureBuilding('youth_academy', {
        level: this.academyLevel,
        width,
        height,
        // Not the portrait framing the buildings page uses: that looks down on
        // the whole plot, which would put the squad on the roof.
        view: BUILDING_BACKDROP_VIEWS.youth_academy
      })
      if (!still) return
      rememberBuildingStill('youth_academy', this.academyLevel, still)
      this._academyStill = still
      this._applyAcademyBackdrop()
    } finally {
      this._disposeAcademyCanvas()
    }
  }

  /**
   * Paint the still onto the photo. Set on the element rather than in the
   * template because a re-render would drop the WebGL context that produced it,
   * and because a data URL cannot live in a stylesheet.
   * @returns {void}
   * @private
   */
  _applyAcademyBackdrop () {
    if (!this._academyStill) return
    const photo = document.querySelector(`${this._elementQuery} [data-youth-squad-photo]`)
    if (photo) photo.style.backgroundImage = `url("${this._academyStill}")`
  }

  /**
   * Give the WebGL context back and take the off-screen canvas out of the page.
   * @returns {void}
   * @private
   */
  _disposeAcademyCanvas () {
    if (!this._academyCanvas) return
    this._academyCanvas.onDestroy()
    this._academyCanvas = null
    document.querySelector(`${this._elementQuery} .youth-academy-still`)?.remove()
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
   * @param {string} newMode - a training mode key; falsy falls back to rest
   * @returns {Promise<void>}
   */
  async _handlePlayerModeChange (player, newMode) {
    const target = newMode || DEFAULT_TRAINING_MODE
    if (effectiveTrainingMode(player) === target) return
    try {
      const limit = this._slotLimit(target)
      const inMode = this._playersInMode(target).filter(p => p.id !== player.id)
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
