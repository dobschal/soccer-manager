import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'

export class UserManagementAdminPage extends UIElement {
  async load () {
    const adminsRes = await server.getAdmins()
    this._admins = adminsRes.admins
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

    return `
      <div>
        <div class="mb-4">
          <h4>${t('admin.deleteUser')}</h4>
          <div class="input-group">
            <input type="text" id="${this._deleteUsernameId}" class="form-control" placeholder="${t('admin.usernamePlaceholder')}">
            <button id="${this._deleteUserBtnId}" class="btn btn-danger">
              <i class="fa fa-trash" aria-hidden="true"></i> ${t('admin.delete')}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <h4>${t('admin.adminManagement')}</h4>
          <table class="table table-sm mb-3">
            <thead><tr><th>${t('admin.username')}</th><th></th></tr></thead>
            <tbody>${adminRows}</tbody>
          </table>
          <div class="input-group">
            <input type="text" id="${this._addAdminInputId}" class="form-control" placeholder="${t('admin.usernamePlaceholder')}">
            <button id="${this._addAdminBtnId}" class="btn btn-info">
              <i class="fa fa-shield" aria-hidden="true"></i> ${t('admin.addAdmin')}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <h4>${t('admin.sendUserEmailTitle')}</h4>
          <p class="text-muted">${t('admin.sendUserEmailDescription')}</p>
          <div class="mb-2">
            <input type="text" id="${this._sendEmailUsernameId}" class="form-control" placeholder="${t('admin.usernamePlaceholder')}">
          </div>
          <div class="mb-2">
            <textarea id="${this._sendEmailMessageId}" class="form-control" rows="5" placeholder="${t('admin.sendUserEmailMessagePlaceholder')}"></textarea>
          </div>
          <button id="${this._sendEmailBtnId}" class="btn btn-info">
            <i class="fa fa-envelope" aria-hidden="true"></i> ${t('admin.sendUserEmailButton')}
          </button>
        </div>
      </div>
    `
  }

  get events () {
    return {
      [`#${this._deleteUserBtnId}`]: {
        click: () => this._deleteUser()
      },
      [`#${this._addAdminBtnId}`]: {
        click: () => this._addAdmin()
      },
      '(optional).admin-remove-btn': {
        click: (e) => this._removeAdmin(e.currentTarget.dataset.username)
      },
      [`#${this._sendEmailBtnId}`]: {
        click: () => this._sendUserEmail()
      }
    }
  }

  _deleteUsernameId = generateId()
  _deleteUserBtnId = generateId()
  _addAdminInputId = generateId()
  _addAdminBtnId = generateId()
  _sendEmailUsernameId = generateId()
  _sendEmailMessageId = generateId()
  _sendEmailBtnId = generateId()
  _admins = []

  async _deleteUser () {
    const input = document.getElementById(this._deleteUsernameId)
    const username = input.value.trim()
    if (!username) return
    if (!(await showConfirmDialog(t('admin.deleteUserConfirm', { username }), t('admin.deleteUser'), t('dialog.cancel')))) return
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
    if (!(await showConfirmDialog(t('admin.addAdminConfirm', { username }), t('admin.addAdmin'), t('dialog.cancel')))) return
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
    if (!(await showConfirmDialog(t('admin.removeAdminConfirm', { username }), t('admin.removeAdmin'), t('dialog.cancel')))) return
    try {
      await server.removeAdmin(username)
      toast(t('admin.adminRemoved', { username }), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  async _sendUserEmail () {
    const usernameInput = document.getElementById(this._sendEmailUsernameId)
    const messageInput = document.getElementById(this._sendEmailMessageId)
    const username = usernameInput.value.trim()
    const message = messageInput.value.trim()
    if (!username || !message) {
      toast(t('admin.sendUserEmailMissing'), 'error')
      return
    }
    if (!(await showConfirmDialog(t('admin.sendUserEmailConfirm', { username }), t('admin.sendUserEmailButton'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._sendEmailBtnId)
    try {
      btn.disabled = true
      const result = await server.sendUserEmail(username, message)
      if (result.sent) {
        toast(t('admin.sendUserEmailSent', { username }), 'success')
      } else {
        toast(t('admin.sendUserEmailLogged'), 'warning')
      }
      usernameInput.value = ''
      messageInput.value = ''
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._sendEmailBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }
}
