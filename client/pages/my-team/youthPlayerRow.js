import { UIElement } from '../../lib/UIElement.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { ProgressBar } from '../../partials/progressBar.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { t } from '../../i18n/index.js'
import { TRAINING_MODES, DEFAULT_TRAINING_MODE, effectiveTrainingMode } from './youthTrainingModes.js'
import { euroFormat } from '../../lib/currency.js'

/**
 * A single `<tr>` inside the youth-players table. Owns its own DOM subtree so
 * it can subscribe to `YOUTH_PLAYER_TRAINING_MODE_CHANGED` and refresh
 * atomically without redrawing the whole youth-team page.
 */
export class YouthPlayerRow extends UIElement {
  /**
   * @param {Object} player - The youth player rendered in this row. The row
   *   mutates `player.training_mode` in place when the server event arrives,
   *   so the parent page (which holds the same reference in its
   *   `youthPlayers` array) stays consistent for later re-renders.
   * @param {import('./youthTeam.js').YouthTeamPage} page - Parent page. Used
   *   to invoke promote / sell / mode-change flows that own overlays and
   *   toasts.
   */
  constructor (player, page) {
    super()
    this.player = player
    this.page = page
    // The training_mode this row currently *shows* on screen. Tracked
    // separately from `player.training_mode` because the page-level handler for
    // `YOUTH_PLAYER_TRAINING_MODE_CHANGED` shares this exact player object and
    // mutates that field before our own handler runs (it mounts first, so it is
    // dispatched first). Using the shared field to decide "did anything change?"
    // would make our guard short-circuit against a value that was already
    // updated for us — leaving a freed slot's `<select>` stale. See the
    // server-event handler below.
    this._renderedMode = effectiveTrainingMode(player)
  }

  /**
   * @returns {string}
   */
  get template () {
    const player = this.player
    const isOldEnough = player.age >= 16
    const disabledReason = isOldEnough ? '' : t('youthTeam.playerTooYoung')
    return `
      <tr data-youth-player-id="${player.id}">
        <td><span class="u-nowrap">${player.name}</span></td>
        <td>${renderPositionBadge(player.position)}</td>
        <td>${player.age}</td>
        <td>${player.level.toFixed(2)}</td>
        <td class="text-end u-nowrap">${euroFormat.format(player.market_value ?? 0)}</td>
        <td>${new ProgressBar(player.moral)}</td>
        <td>${new ProgressBar(player.fitness)}</td>
        <td>${this._renderModeSelect()}</td>
        <td>
          <span class="u-nowrap">
            <button
              class="btn btn-sm btn-primary me-1 youth-row-promote-btn"
              ${!isOldEnough ? 'disabled' : ''}
              title="${disabledReason}"
            ><i class="fa fa-arrow-up"></i> ${t('youthTeam.promote')}</button>
            <button class="btn btn-sm btn-success youth-row-sell-btn"><i class="fa fa-money"></i> ${t('youthTeam.sell')}</button>
          </span>
        </td>
      </tr>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.youth-row-promote-btn': {
        click: (e) => {
          e.stopPropagation()
          this.page._showPromoteConfirm(this.player)
        }
      },
      '.youth-row-sell-btn': {
        click: (e) => {
          e.stopPropagation()
          this.page._showSellConfirm(this.player)
        }
      },
      '.youth-mode-inline-select': {
        change: (e) => {
          e.stopPropagation()
          this.page._handlePlayerModeChange(this.player, e.target.value)
        }
      }
    }
  }
  /**
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      [SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]: (data) => {
        if (!data || data.youthPlayerId !== this.player.id) return
        this.player.training_mode = data.newMode || null
        // A player without an own mode rests, so that is what the row shows.
        const newMode = data.newMode || DEFAULT_TRAINING_MODE
        // Re-render only when the row does not already display this mode. We
        // compare against `_renderedMode` (what we last drew), NOT
        // `this.player.training_mode`: the page-level handler for the same event
        // shares this player object and may have overwritten that field before
        // we run, which would make an object-based guard skip a still-needed
        // re-render (freed slot's select stayed stale).
        if (this._renderedMode === newMode) return
        this.update()
      }
    }
  }
  /**
   * Keep `_renderedMode` in sync with what the template just drew, on both the
   * initial mount and every subsequent surgical update.
   * @returns {void}
   */
  onMounted () {
    this._renderedMode = effectiveTrainingMode(this.player)
  }
  /**
   * @returns {void}
   */
  onUpdate () {
    this._renderedMode = effectiveTrainingMode(this.player)
  }
  updateIndicator = true

  /**
   * @returns {string}
   * @private
   */
  _renderModeSelect () {
    // No empty option: a youth player is always in one of the three modes, and
    // one without an own `training_mode` rests.
    const current = effectiveTrainingMode(this.player)
    const options = TRAINING_MODES.map(m =>
      `<option value="${m.key}" ${current === m.key ? 'selected' : ''}>${this.page._getTrainingModeLabel(m.key)}</option>`
    ).join('')
    return `<select class="form-select form-select-sm youth-mode-inline-select" title="${t('youthTeam.changeTrainingMode')}">${options}</select>`
  }
}
