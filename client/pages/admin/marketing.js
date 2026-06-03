import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'

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
      { value: 'LEVEL_UP_PLAYER_40', label: t('actionCards.type.basicPromotion') },
      { value: 'LEVEL_UP_PLAYER_70', label: t('actionCards.type.epicAdvancement') },
      { value: 'LEVEL_UP_PLAYER_100', label: t('actionCards.type.legendaryMastery') },
      { value: 'FRESHNESS_5', label: t('actionCards.type.quickRecovery') },
      { value: 'FRESHNESS_10', label: t('actionCards.type.energyBoost') },
      { value: 'FRESHNESS_20', label: t('actionCards.type.fullRecovery') },
      { value: 'NEW_YOUTH_PLAYER_1', label: t('actionCards.type.youthProspect1') },
      { value: 'NEW_YOUTH_PLAYER_2', label: t('actionCards.type.youthProspect2') },
      { value: 'NEW_YOUTH_PLAYER_3', label: t('actionCards.type.youthProspect3') },
      { value: 'BONUS_100K', label: t('actionCards.type.cashBonus') },
      { value: 'STAR_PLAYER', label: t('actionCards.type.starPlayer') },
      { value: 'MOTIVATING_SPEECH', label: t('actionCards.type.motivatingSpeech') }
    ]
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
