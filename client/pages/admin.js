import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'

export class AdminPage extends UIElement {
  async load () {
    const [adminsRes, activeUsersRes] = await Promise.all([
      server.getAdmins(),
      server.getActiveUsers()
    ])
    this._admins = adminsRes.admins
    this._activeUsers = activeUsersRes.users
  }
  get template () {
    const adminRows = this._admins.map(a => `
      <tr>
        <td>${a.username}</td>
        <td>
          ${a.username !== 'Emmo' ? `<button class="btn btn-sm btn-outline-danger admin-remove-btn" data-username="${a.username}">
            <i class="fa fa-times" aria-hidden="true"></i> ${t('admin.removeAdmin')}
          </button>` : ''}
        </td>
      </tr>
    `).join('')

    const userRows = this._activeUsers.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.platform}</td>
        <td>${u.teamId ? `<a href="#team?id=${u.teamId}">${u.teamName}</a>` : '-'}</td>
        <td>${u.country || '??'}</td>
        <td>${new Date(u.lastLogin).toLocaleDateString()}</td>
      </tr>
    `).join('')

    return `
      <div>
        <h3>${t('admin.title')}</h3>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.gameDay')}</h5></div>
          <div class="card-body">
            <button id="${this._triggerBtnId}" class="btn btn-primary">
              <i class="fa fa-play" aria-hidden="true"></i> ${t('admin.triggerGameDay')}
            </button>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.pushNotification')}</h5></div>
          <div class="card-body">
            <div class="mb-3">
              <label for="${this._tokenInputId}" class="form-label">${t('admin.deviceToken')}</label>
              <input type="text" id="${this._tokenInputId}" class="form-control" placeholder="${t('admin.deviceToken')}">
            </div>
            <div class="mb-3">
              <label for="${this._messageInputId}" class="form-label">${t('admin.message')}</label>
              <input type="text" id="${this._messageInputId}" class="form-control" placeholder="${t('admin.message')}">
            </div>
            <button id="${this._sendBtnId}" class="btn btn-primary">
              <i class="fa fa-bell" aria-hidden="true"></i> ${t('admin.sendNotification')}
            </button>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.broadcastNotification')}</h5></div>
          <div class="card-body">
            <div class="mb-3">
              <label for="${this._broadcastEnId}" class="form-label">${t('admin.messageEn')}</label>
              <input type="text" id="${this._broadcastEnId}" class="form-control" placeholder="${t('admin.messageEnPlaceholder')}">
            </div>
            <div class="mb-3">
              <label for="${this._broadcastDeId}" class="form-label">${t('admin.messageDe')}</label>
              <input type="text" id="${this._broadcastDeId}" class="form-control" placeholder="${t('admin.messageDePlaceholder')}">
            </div>
            <button id="${this._broadcastBtnId}" class="btn btn-warning">
              <i class="fa fa-bullhorn" aria-hidden="true"></i> ${t('admin.sendBroadcast')}
            </button>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.deleteUser')}</h5></div>
          <div class="card-body">
            <div class="input-group">
              <input type="text" id="${this._deleteUsernameId}" class="form-control" placeholder="${t('admin.usernamePlaceholder')}">
              <button id="${this._deleteUserBtnId}" class="btn btn-danger">
                <i class="fa fa-trash" aria-hidden="true"></i> ${t('admin.delete')}
              </button>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.adminManagement')}</h5></div>
          <div class="card-body">
            <table class="table table-sm mb-3">
              <thead><tr><th>${t('admin.username')}</th><th></th></tr></thead>
              <tbody>${adminRows}</tbody>
            </table>
            <div class="input-group">
              <input type="text" id="${this._addAdminInputId}" class="form-control" placeholder="${t('admin.usernamePlaceholder')}">
              <button id="${this._addAdminBtnId}" class="btn btn-warning">
                <i class="fa fa-shield" aria-hidden="true"></i> ${t('admin.addAdmin')}
              </button>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header"><h5 class="mb-0">${t('admin.activeUsers')} (${this._activeUsers.length})</h5></div>
          <div class="card-body p-0">
            ${this._activeUsers.length > 0 ? `
            <table class="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>${t('admin.username')}</th>
                  <th>${t('admin.platform')}</th>
                  <th>${t('admin.team')}</th>
                  <th>${t('admin.country')}</th>
                  <th>${t('admin.lastLogin')}</th>
                </tr>
              </thead>
              <tbody>${userRows}</tbody>
            </table>
            ` : `<p class="p-3 mb-0 text-muted">${t('admin.noActiveUsers')}</p>`}
          </div>
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`#${this._triggerBtnId}`]: {
        click: () => this._triggerGameDay()
      },
      [`#${this._sendBtnId}`]: {
        click: () => this._sendNotification()
      },
      [`#${this._broadcastBtnId}`]: {
        click: () => this._sendBroadcast()
      },
      [`#${this._deleteUserBtnId}`]: {
        click: () => this._deleteUser()
      },
      [`#${this._addAdminBtnId}`]: {
        click: () => this._addAdmin()
      },
      '(optional).admin-remove-btn': {
        click: (e) => this._removeAdmin(e.currentTarget.dataset.username)
      }
    }
  }

  _triggerBtnId = generateId()
  _sendBtnId = generateId()
  _tokenInputId = generateId()
  _messageInputId = generateId()
  _deleteUsernameId = generateId()
  _deleteUserBtnId = generateId()
  _broadcastEnId = generateId()
  _broadcastDeId = generateId()
  _broadcastBtnId = generateId()
  _addAdminInputId = generateId()
  _addAdminBtnId = generateId()
  _admins = []
  _activeUsers = []

  async _triggerGameDay () {
    const btn = document.getElementById(this._triggerBtnId)
    try {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Running...'
      await server.triggerGameDay()
      toast('Game day completed', 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      btn.innerHTML = `<i class="fa fa-play" aria-hidden="true"></i> ${t('admin.triggerGameDay')}`
      btn.disabled = false
    }
  }

  async _sendNotification () {
    const token = document.getElementById(this._tokenInputId).value.trim()
    const message = document.getElementById(this._messageInputId).value.trim()
    if (!token || !message) {
      toast('Device token and message are required', 'error')
      return
    }
    const btn = document.getElementById(this._sendBtnId)
    try {
      btn.disabled = true
      const result = await server.testPushNotification(token, message)
      toast(`Sent: ${result.sent}, Failed: ${result.failed}${result.failureReason ? ' - ' + result.failureReason : ''}`, result.failed ? 'error' : 'success')
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
    if (!confirm(t('admin.broadcastConfirm'))) return
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

  async _deleteUser () {
    const input = document.getElementById(this._deleteUsernameId)
    const username = input.value.trim()
    if (!username) return
    if (!confirm(t('admin.deleteUserConfirm', { username }))) return
    try {
      await server.adminDeleteUser(username)
      toast(t('admin.userDeleted', { username }), 'success')
      input.value = ''
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  async _addAdmin () {
    const input = document.getElementById(this._addAdminInputId)
    const username = input.value.trim()
    if (!username) return
    if (!confirm(t('admin.addAdminConfirm', { username }))) return
    try {
      await server.addAdmin(username)
      toast(t('admin.adminAdded', { username }), 'success')
      input.value = ''
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  async _removeAdmin (username) {
    if (!confirm(t('admin.removeAdminConfirm', { username }))) return
    try {
      await server.removeAdmin(username)
      toast(t('admin.adminRemoved', { username }), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }
}
