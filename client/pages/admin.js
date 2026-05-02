import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { generateId } from '../lib/html.js'
import { t } from '../i18n/index.js'

const STATISTICS_PAGE_SIZE = 20

export class AdminPage extends UIElement {
  async load () {
    const [adminsRes, statisticsRes] = await Promise.all([
      server.getAdmins(),
      server.getStatistics(this._statisticsPage, STATISTICS_PAGE_SIZE)
    ])
    this._admins = adminsRes.admins
    this._statistics = statisticsRes.rows
    this._statisticsTotal = statisticsRes.total
    this._statisticsPageSize = statisticsRes.pageSize
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

    const totalPages = Math.max(1, Math.ceil(this._statisticsTotal / this._statisticsPageSize))
    const currentPage = Math.min(this._statisticsPage, totalPages)
    const isFirstPage = currentPage <= 1
    const isLastPage = currentPage >= totalPages

    const statisticsRows = this._statistics.map(s => `
      <tr>
        <td>${new Date(s.created_at).toLocaleString()}</td>
        <td>${s.daily_active_users}</td>
        <td>${this._formatMoney(s.in_game_money)}</td>
        <td>${s.player_count}</td>
        <td>${Number(s.avg_player_level).toFixed(2)}</td>
        <td>${Number(s.avg_player_age).toFixed(2)}</td>
        <td>${s.action_card_count}</td>
      </tr>
    `).join('')

    return `
      <div>
        <h3>${t('admin.title')}</h3>

        <div class="mb-4">
          <h4>${t('admin.gameDay')}</h4>
          <button id="${this._triggerBtnId}" class="btn btn-primary">
            <i class="fa fa-play" aria-hidden="true"></i> ${t('admin.triggerGameDay')}
          </button>
        </div>

        <div class="mb-4">
          <h4>${t('admin.pushNotification')}</h4>
          <div class="mb-3">
            <label for="${this._tokenInputId}" class="form-label">${t('admin.deviceToken')}</label>
            <input type="text" id="${this._tokenInputId}" class="form-control" placeholder="${t('admin.deviceToken')}">
          </div>
          <div class="mb-3">
            <label for="${this._messageInputId}" class="form-label">${t('admin.message')}</label>
            <input type="text" id="${this._messageInputId}" class="form-control" placeholder="${t('admin.message')}">
          </div>
          <div class="mb-3">
            <label for="${this._platformSelectId}" class="form-label">Platform</label>
            <select id="${this._platformSelectId}" class="form-control">
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </div>
          <button id="${this._sendBtnId}" class="btn btn-primary">
            <i class="fa fa-bell" aria-hidden="true"></i> ${t('admin.sendNotification')}
          </button>
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
          <button id="${this._broadcastBtnId}" class="btn btn-warning">
            <i class="fa fa-bullhorn" aria-hidden="true"></i> ${t('admin.sendBroadcast')}
          </button>
        </div>

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
            <button id="${this._addAdminBtnId}" class="btn btn-warning">
              <i class="fa fa-shield" aria-hidden="true"></i> ${t('admin.addAdmin')}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h4 class="mb-0">${t('admin.statistics')} (${this._statisticsTotal})</h4>
            <button id="${this._collectBtnId}" class="btn btn-sm btn-outline-primary">
              <i class="fa fa-refresh" aria-hidden="true"></i> ${t('admin.statisticsCollectNow')}
            </button>
          </div>
          ${this._statistics.length > 0 ? `
          <div class="horizontal-scrollable-table">
            <table class="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>${t('admin.statisticsCreatedAt')}</th>
                  <th>${t('admin.statisticsDailyActiveUsers')}</th>
                  <th>${t('admin.statisticsInGameMoney')}</th>
                  <th>${t('admin.statisticsPlayerCount')}</th>
                  <th>${t('admin.statisticsAvgPlayerLevel')}</th>
                  <th>${t('admin.statisticsAvgPlayerAge')}</th>
                  <th>${t('admin.statisticsActionCardCount')}</th>
                </tr>
              </thead>
              <tbody>${statisticsRows}</tbody>
            </table>
          </div>
          <div class="d-flex align-items-center justify-content-between mt-3">
            <button id="${this._prevBtnId}" class="btn btn-sm btn-outline-secondary" ${isFirstPage ? 'disabled' : ''}>
              <i class="fa fa-chevron-left" aria-hidden="true"></i> ${t('admin.paginationPrev')}
            </button>
            <span class="text-muted">${t('admin.paginationPage', { page: currentPage, total: totalPages })}</span>
            <button id="${this._nextBtnId}" class="btn btn-sm btn-outline-secondary" ${isLastPage ? 'disabled' : ''}>
              ${t('admin.paginationNext')} <i class="fa fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          ` : `<p class="text-muted">${t('admin.statisticsEmpty')}</p>`}
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
      },
      [`(optional)#${this._collectBtnId}`]: {
        click: () => this._collectStatistics()
      },
      [`(optional)#${this._prevBtnId}`]: {
        click: () => this._goToPage(this._statisticsPage - 1)
      },
      [`(optional)#${this._nextBtnId}`]: {
        click: () => this._goToPage(this._statisticsPage + 1)
      }
    }
  }

  _triggerBtnId = generateId()
  _sendBtnId = generateId()
  _tokenInputId = generateId()
  _messageInputId = generateId()
  _platformSelectId = generateId()
  _deleteUsernameId = generateId()
  _deleteUserBtnId = generateId()
  _broadcastEnId = generateId()
  _broadcastDeId = generateId()
  _broadcastBtnId = generateId()
  _addAdminInputId = generateId()
  _addAdminBtnId = generateId()
  _collectBtnId = generateId()
  _prevBtnId = generateId()
  _nextBtnId = generateId()
  _admins = []
  _statistics = []
  _statisticsTotal = 0
  _statisticsPage = 1
  _statisticsPageSize = STATISTICS_PAGE_SIZE

  _formatMoney (value) {
    const number = Number(value) || 0
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(number)
    } catch {
      return `${number} €`
    }
  }

  async _goToPage (page) {
    const totalPages = Math.max(1, Math.ceil(this._statisticsTotal / this._statisticsPageSize))
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === this._statisticsPage) return
    this._statisticsPage = next
    await this.update(true)
  }

  async _collectStatistics () {
    const btn = document.getElementById(this._collectBtnId)
    try {
      btn.disabled = true
      await server.collectStatisticsNow()
      toast(t('admin.statisticsCollected'), 'success')
      this._statisticsPage = 1
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._collectBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }

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
    const platform = document.getElementById(this._platformSelectId).value
    if (!token || !message) {
      toast('Device token and message are required', 'error')
      return
    }
    const btn = document.getElementById(this._sendBtnId)
    try {
      btn.disabled = true
      const result = await server.testPushNotification(token, message, platform)
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
