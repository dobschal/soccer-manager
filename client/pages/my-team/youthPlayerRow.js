import { UIElement } from '../../lib/UIElement.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { ProgressBar } from '../../partials/progressBar.js'
import { renderPositionBadge } from '../../partials/positionBadge.js'
import { t } from '../../i18n/index.js'
import { TRAINING_MODES } from './youthTrainingModes.js'

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
   *   to invoke promote / fire / mode-change flows that own overlays and
   *   toasts.
   */
  constructor (player, page) {
    super()
    this.player = player
    this.page = page
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
            <button class="btn btn-sm btn-danger youth-row-fire-btn"><i class="fa fa-times"></i> ${t('youthTeam.fire')}</button>
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
      '.youth-row-fire-btn': {
        click: (e) => {
          e.stopPropagation()
          this.page._showFireConfirm(this.player)
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
        if (this.player.training_mode === data.newMode) return
        this.player.training_mode = data.newMode
        this.update()
      }
    }
  }
  updateIndicator = true

  /**
   * @returns {string}
   * @private
   */
  _renderModeSelect () {
    const current = this.player.training_mode || ''
    const options = [
      `<option value="" ${current === '' ? 'selected' : ''}>${t('youthTeam.unassigned')}</option>`,
      ...TRAINING_MODES.map(m =>
        `<option value="${m.key}" ${current === m.key ? 'selected' : ''}>${this.page._getTrainingModeLabel(m.key)}</option>`
      )
    ].join('')
    return `<select class="form-select form-select-sm youth-mode-inline-select" title="${t('youthTeam.changeTrainingMode')}">${options}</select>`
  }
}
