import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { t } from '../i18n/index.js'
import { actionCardLabel } from '../lib/actionCardLabels.js'

/**
 * Admin-only panel on the team page: lists the unplayed action cards a team
 * holds (grouped by type) and lets an admin hand out or take away single
 * cards. Owns its own state so refreshing after a change re-renders just this
 * panel instead of the whole team page.
 *
 * Constructed with `{ teamId }` — the id is set by the UIElement constructor,
 * so it must not be re-declared as a class field (that would reset it).
 */
export class AdminTeamCards extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const { actionCards, types } = await server.adminGetTeamActionCards(this.teamId)
    this.cards = actionCards || []
    this.types = types || []
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="card mb-4">
        <div class="card-header text-white gradient-header">
          <h5 class="card-title mb-0">${t('team.adminActionCards')}</h5>
        </div>
        <div class="card-body">
          ${this._renderCardsTable()}
          <div class="input-group">
            <select class="form-select admin-card-select" aria-label="${t('team.adminAddCard')}">
              ${this.types.map(type => `<option value="${type}">${actionCardLabel(type)}</option>`).join('')}
            </select>
            <button class="btn btn-info admin-card-add" ${this._busy ? 'disabled' : ''}>
              <i class="fa fa-plus" aria-hidden="true"></i> ${t('team.adminAddCard')}
            </button>
          </div>
        </div>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional) .admin-card-add': {
        click: () => this._addCard()
      },
      '(optional) .admin-card-remove': {
        click: (event) => {
          const button = event.currentTarget
          this._removeCard(button.dataset.action, button.dataset.state)
        }
      }
    }
  }
  /** @type {Array<{action: string, state: string, count: number}>} */
  cards = []

  /** @type {Array<string>} */
  types = []

  /** @type {boolean} */
  _busy = false

  updateIndicator = true

  /**
   * @returns {string}
   * @private
   */
  _renderCardsTable () {
    if (this.cards.length === 0) {
      return `<p class="text-muted">${t('team.adminNoActionCards')}</p>`
    }
    const rows = this.cards.map(card => `
      <tr>
        <td>
          ${actionCardLabel(card.action)}
          ${card.state === 'pending' ? `<span class="badge bg-secondary ms-2">${t('team.adminCardPending')}</span>` : ''}
        </td>
        <td class="text-end">${card.count}&times;</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger admin-card-remove"
                  data-action="${card.action}" data-state="${card.state}"
                  title="${t('team.adminRemoveCard')}" ${this._busy ? 'disabled' : ''}>
            <i class="fa fa-minus" aria-hidden="true"></i>
          </button>
        </td>
      </tr>
    `).join('')
    return `
      <div class="horizontal-scrollable-table mb-3">
        <table class="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>${t('team.adminCardType')}</th>
              <th class="text-end">${t('team.adminCardCount')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   * @private
   */
  async _addCard () {
    if (this._busy) return
    const select = document.querySelector(`${this._elementQuery} .admin-card-select`)
    const action = select?.value
    if (!action) return
    await this._run(
      () => server.adminAddActionCard(this.teamId, action),
      t('team.adminCardAdded')
    )
  }

  /**
   * @param {string} action
   * @param {string} state
   * @returns {Promise<void>}
   * @private
   */
  async _removeCard (action, state) {
    if (this._busy || !action) return
    await this._run(
      () => server.adminRemoveActionCard(this.teamId, action, state),
      t('team.adminCardRemoved')
    )
  }

  /**
   * Run a mutating admin call, then refetch the panel's state.
   * @param {() => Promise<any>} call
   * @param {string} successMessage
   * @returns {Promise<void>}
   * @private
   */
  async _run (call, successMessage) {
    try {
      this._busy = true
      await this.update()
      await call()
      toast(successMessage, 'success')
    } catch (e) {
      console.error('Admin action card change failed:', e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    } finally {
      this._busy = false
      await this.update(true)
    }
  }
}
