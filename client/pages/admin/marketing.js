import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { actionCardLabel } from '../../lib/actionCardLabels.js'

const MAX_NOTIFICATION_IMAGE_SIZE = 4 * 1024 * 1024

export class MarketingAdminPage extends UIElement {
  async load () {
    try {
      const result = await server.getNotificationEmails()
      this._notificationEmails = result?.rows || []
    } catch (e) {
      console.error('Failed to load notification emails:', e)
      this._notificationEmails = []
    }
  }

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
          <div class="mb-3">
            <label for="${this._broadcastDeepLinkId}" class="form-label">${t('admin.broadcastDeepLink')}</label>
            <input type="text" id="${this._broadcastDeepLinkId}" class="form-control" placeholder="${t('admin.broadcastDeepLinkPlaceholder')}">
            <small class="text-muted">${t('admin.broadcastDeepLinkHint')}</small>
          </div>
          <button id="${this._broadcastBtnId}" class="btn btn-info">
            <i class="fa fa-bullhorn" aria-hidden="true"></i> ${t('admin.sendBroadcast')}
          </button>
        </div>

        <div class="mb-4">
          <h4>${t('admin.notificationEmailTitle')}</h4>
          <p class="text-muted">${t('admin.notificationEmailDescription')}</p>
          <div class="mb-3">
            <label for="${this._notifTitleId}" class="form-label">${t('admin.notificationEmailSubjectLabel')}</label>
            <input type="text" id="${this._notifTitleId}" class="form-control" placeholder="${t('admin.notificationEmailSubjectPlaceholder')}" maxlength="200">
          </div>
          <div class="mb-3">
            <label for="${this._notifBodyId}" class="form-label">${t('admin.notificationEmailBodyLabel')}</label>
            <textarea id="${this._notifBodyId}" class="form-control" rows="5" placeholder="${t('admin.notificationEmailBodyPlaceholder')}" maxlength="4000"></textarea>
          </div>
          <div class="mb-3">
            <label for="${this._notifImageId}" class="form-label">${t('admin.notificationEmailImageLabel')}</label>
            <input type="file" id="${this._notifImageId}" class="form-control" accept="image/png,image/jpeg,image/gif,image/webp">
            <div id="${this._notifPreviewId}" class="notification-email-preview"></div>
          </div>
          <button id="${this._notifSendBtnId}" class="btn btn-info">
            <i class="fa fa-envelope" aria-hidden="true"></i> ${t('admin.notificationEmailSendButton')}
          </button>
        </div>

        <div class="mb-4">
          <h5>${t('admin.notificationEmailHistoryTitle')}</h5>
          ${this._renderHistoryTable()}
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
      },
      [`#${this._notifImageId}`]: {
        change: (e) => this._onImageSelected(e)
      },
      [`#${this._notifSendBtnId}`]: {
        click: () => this._sendNotificationEmail()
      }
    }
  }

  _giftCardSelectId = generateId()
  _giftCardBtnId = generateId()
  _broadcastEnId = generateId()
  _broadcastDeId = generateId()
  _broadcastDeepLinkId = generateId()
  _broadcastBtnId = generateId()
  _notifTitleId = generateId()
  _notifBodyId = generateId()
  _notifImageId = generateId()
  _notifPreviewId = generateId()
  _notifSendBtnId = generateId()
  _pendingNotificationImage = null
  _notificationEmails = []

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

  _renderHistoryTable () {
    if (!this._notificationEmails || this._notificationEmails.length === 0) {
      return `<p class="text-muted">${t('admin.notificationEmailHistoryEmpty')}</p>`
    }
    return `
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>${t('admin.notificationEmailHistoryDate')}</th>
              <th>${t('admin.notificationEmailHistorySubject')}</th>
              <th>${t('admin.notificationEmailHistoryRecipients')}</th>
              <th>${t('admin.notificationEmailHistoryOpens')}</th>
            </tr>
          </thead>
          <tbody>
            ${this._notificationEmails.map(row => `
              <tr>
                <td>${new Date(row.created_at).toLocaleString()}</td>
                <td>${this._escape(row.title)}</td>
                <td>${row.recipient_count}</td>
                <td>${row.open_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  _escape (str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
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
    const deepLink = document.getElementById(this._broadcastDeepLinkId).value.trim()
    if (!messageEn || !messageDe) {
      toast(t('admin.broadcastBothRequired'), 'error')
      return
    }
    if (!(await showConfirmDialog(t('admin.broadcastConfirm'), t('admin.sendBroadcast'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._broadcastBtnId)
    try {
      btn.disabled = true
      const result = await server.broadcastNotification(messageEn, messageDe, deepLink)
      toast(t('admin.broadcastSent', { sent: result.sent }), 'success')
      document.getElementById(this._broadcastEnId).value = ''
      document.getElementById(this._broadcastDeId).value = ''
      document.getElementById(this._broadcastDeepLinkId).value = ''
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.disabled = false
    }
  }

  _onImageSelected (e) {
    const file = e.target.files && e.target.files[0]
    const preview = document.getElementById(this._notifPreviewId)
    if (!file) {
      this._pendingNotificationImage = null
      if (preview) preview.innerHTML = ''
      return
    }
    if (!file.type.startsWith('image/')) {
      toast(t('admin.notificationEmailImageInvalid'), 'error')
      e.target.value = ''
      return
    }
    if (file.size > MAX_NOTIFICATION_IMAGE_SIZE) {
      toast(t('admin.notificationEmailImageTooLarge'), 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      this._pendingNotificationImage = {
        data: reader.result,
        type: file.type
      }
      if (preview) {
        preview.innerHTML = `<img src="${reader.result}" alt="preview" class="notification-email-preview-img">`
      }
    }
    reader.readAsDataURL(file)
  }

  async _sendNotificationEmail () {
    const title = document.getElementById(this._notifTitleId).value.trim()
    const body = document.getElementById(this._notifBodyId).value.trim()
    if (!title || !body) {
      toast(t('admin.notificationEmailMissingFields'), 'error')
      return
    }
    if (!this._pendingNotificationImage) {
      toast(t('admin.notificationEmailImageMissing'), 'error')
      return
    }
    if (!(await showConfirmDialog(t('admin.notificationEmailConfirm'), t('admin.notificationEmailSendButton'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._notifSendBtnId)
    try {
      btn.disabled = true
      const result = await server.sendAdminNotificationEmail(
        title,
        body,
        this._pendingNotificationImage.data,
        this._pendingNotificationImage.type
      )
      toast(t('admin.notificationEmailSent', { sent: result.sent, recipients: result.recipients }), 'success')
      document.getElementById(this._notifTitleId).value = ''
      document.getElementById(this._notifBodyId).value = ''
      document.getElementById(this._notifImageId).value = ''
      const preview = document.getElementById(this._notifPreviewId)
      if (preview) preview.innerHTML = ''
      this._pendingNotificationImage = null
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.disabled = false
    }
  }
}
