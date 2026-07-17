import { UIElement } from '../lib/UIElement.js'
import { renderLevelBadge } from './levelBadge.js'
import { renderPlayerImage } from './playerImage.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'
import { t } from '../i18n/index.js'
import { server, showServerError } from '../lib/gateway.js'
import { toast } from './toast.js'

/**
 * A single bench slot (GK, DEF, MID, ATT). Owns its own `<div class="bench-slot">`
 * so a `BENCH_CHANGED` event for this position can swap the player in place
 * without re-rendering the whole bench row (which would tear down the sibling
 * slots' player images and substitution-mode selects).
 */
export class BenchSlot extends UIElement {
  /**
   * @param {string} benchPosition - one of BENCH_GK / BENCH_DEF / BENCH_MID / BENCH_ATT
   * @param {string} label - i18n label shown when the slot is empty
   * @param {PlayerType|null} player - Current occupant, or null for empty.
   * @param {TeamType} team - Shared reference (only used for player-image rendering).
   */
  constructor (benchPosition, label, player, team) {
    super()
    this.benchPosition = benchPosition
    this.label = label
    this.player = player
    this.team = team
  }

  /**
   * @returns {string}
   */
  get template () {
    if (!this.player) {
      return `
        <div class="bench-slot bench-slot--empty u-cursor-pointer" data-bench-position="${this.benchPosition}">
          <div class="bench-slot__label">${this.label}</div>
        </div>
      `
    }
    const player = this.player
    const freshnessPercentage = Math.round(player.freshness * 100)
    const freshnessClass = freshnessPercentage >= 80
      ? 'freshness-success'
      : freshnessPercentage >= 60
        ? 'freshness-warning'
        : freshnessPercentage >= 40
          ? 'freshness-orange'
          : 'freshness-danger'
    const displayName = player.name.includes(' ')
      ? player.name.split(' ')[0][0] + ' ' + (player.name.split(' ')[1] ?? '')
      : player.name
    return `
      <div class="bench-slot ${player.position} u-cursor-pointer" data-bench-position="${this.benchPosition}" data-player-id="${player.id}">
        <div class="bench-slot__image"></div>
        <div class="bench-slot__info">
          <span class="bench-slot__name">${player.is_suspended ? '🚫 ' : ''}${player.is_injured ? '<i class="fa fa-medkit"></i> ' : ''}${displayName}</span>
          <span class="position-badge ${player.position}">${player.position}</span>
          ${renderLevelBadge(player.level)}
          <span class="bench-slot__freshness ${freshnessClass}">${freshnessPercentage}%</span>
        </div>
        ${this._renderSubstitutionModeSelect(player)}
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).bench-substitution-mode': {
        change: async (e) => {
          const playerId = Number(e.target.dataset.playerId)
          const mode = e.target.value
          if (!playerId) return
          try {
            await server.updateBenchSubstitutionMode(playerId, mode)
            if (this.player) this.player.bench_substitution_mode = mode
            toast(t('myTeam.benchSubModeUpdated'), 'success')
          } catch (err) {
            showServerError(err)
          }
        }
      }
    }
  }
  /**
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.BENCH_CHANGED.name]: (data) => {
        if (!data) return
        if (data.benchPosition === this.benchPosition) {
          // Direct assignment to this slot — take the new occupant (may be null).
          this.player = data.player ?? null
          this.update()
          return
        }
        // Any other slot got a new occupant. If it's OUR current player being
        // moved to a different slot, we lose them.
        if (this.player && data.player?.id === this.player.id) {
          this.player = null
          this.update()
        }
      }
    }
  }

  onMounted () {
    this._loadImage()
  }

  onUpdate () {
    this._loadImage()
  }

  /**
   * @private
   */
  _loadImage () {
    if (!this.player) return
    renderPlayerImage(this.player, this.team, 100).then(image => {
      const imgEl = document.querySelector(`${this._elementQuery} .bench-slot__image`)
      if (imgEl) imgEl.innerHTML = image
    })
  }

  /**
   * @param {PlayerType} player
   * @returns {string}
   * @private
   */
  _renderSubstitutionModeSelect (player) {
    const modes = ['always', 'injury_only', 'leading', 'trailing']
    const current = player.bench_substitution_mode || 'injury_only'
    return `
      <select class="form-select form-select-sm bench-substitution-mode" data-player-id="${player.id}" title="${t('myTeam.benchSubMode')}">
        ${modes.map(mode => `<option value="${mode}" ${mode === current ? 'selected' : ''}>${t('myTeam.benchSubMode.' + mode)}</option>`).join('')}
      </select>
    `
  }
}
