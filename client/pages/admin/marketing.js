import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { actionCardLabel } from '../../lib/actionCardLabels.js'

export class MarketingAdminPage extends UIElement {
  get template () {
    return `
      <div>
        <div class="mb-4">
          <h4>${t('admin.giftActionCardTitle')}</h4>
          <p class="text-muted">${t('admin.giftActionCardDescription')}</p>
          <div class="input-group">
            <select id="${this._giftCardSelectId}" class="form-control">
              ${this._giftableCardTypes.map(type => `
                <option value="${type.value}">${type.label}</option>
              `).join('')}
            </select>
            <button id="${this._giftCardBtnId}" class="btn btn-info">
              <i class="fa fa-gift" aria-hidden="true"></i> ${t('admin.giftActionCardButton')}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <h4>${t('admin.broadcastNotification')}</h4>
          <div class="mb-3">
            <label for="${this._broadcastEnId}" class="form-label">${t('admin.messageEn')}</label>
            <input type="text" id="${this._broadcastEnId}" class="form-control" placeholder="${t('admin.messageEnPlaceholder')}">
          </div>
          <div class="mb-3">
            <label for="${this._broadcastDeId}" class="form-label">${t('admin.messageDe')}</label>
            <input type="text" id="${this._broadcastDeId}" class="form-control" placeholder="${t('admin.messageDePlaceholder')}">
          </div>
          <button id="${this._broadcastBtnId}" class="btn btn-info">
            <i class="fa fa-bullhorn" aria-hidden="true"></i> ${t('admin.sendBroadcast')}
          </button>
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`#${this._giftCardBtnId}`]: {
        click: () => this._giftActionCard()
      },
      [`#${this._broadcastBtnId}`]: {
        click: () => this._sendBroadcast()
      }
    }
  }

  _giftCardSelectId = generateId()
  _giftCardBtnId = generateId()
  _broadcastEnId = generateId()
  _broadcastDeId = generateId()
  _broadcastBtnId = generateId()

  get _giftableCardTypes () {
    return [
      'LEVEL_UP_PLAYER_40',
      'LEVEL_UP_PLAYER_70',
      'LEVEL_UP_PLAYER_100',
      'FRESHNESS_5',
      'FRESHNESS_10',
      'FRESHNESS_20',
      'NEW_YOUTH_PLAYER_1',
      'NEW_YOUTH_PLAYER_2',
      'NEW_YOUTH_PLAYER_3',
      'BONUS_100K',
      'STAR_PLAYER',
      'MOTIVATING_SPEECH'
    ].map(value => ({ value, label: actionCardLabel(value) }))
  }

  async _giftActionCard () {
    const select = document.getElementById(this._giftCardSelectId)
    const action = select.value
    const label = select.options[select.selectedIndex]?.textContent || action
    if (!(await showConfirmDialog(t('admin.giftActionCardConfirm', { card: label }), t('admin.giftActionCardButton'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._giftCardBtnId)
    try {
      btn.disabled = true
      const result = await server.giftActionCardToAll(action)
      toast(t('admin.giftActionCardSent', { count: result.count }), 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.disabled = false
    }
  }

  async _sendBroadcast () {
    const messageEn = document.getElementById(this._broadcastEnId).value.trim()
    const messageDe = document.getElementById(this._broadcastDeId).value.trim()
    if (!messageEn || !messageDe) {
      toast(t('admin.broadcastBothRequired'), 'error')
      return
    }
    if (!(await showConfirmDialog(t('admin.broadcastConfirm'), t('admin.sendBroadcast'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._broadcastBtnId)
    try {
      btn.disabled = true
      const result = await server.broadcastNotification(messageEn, messageDe)
      toast(t('admin.broadcastSent', { sent: result.sent }), 'success')
      document.getElementById(this._broadcastEnId).value = ''
      document.getElementById(this._broadcastDeId).value = ''
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.disabled = false
    }
  }
}
