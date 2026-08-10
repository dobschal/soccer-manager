import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { generateId } from '../../lib/html.js'
import { t } from '../../i18n/index.js'
import { showConfirmDialog } from '../../partials/overlay.js'
import { actionCardLabel } from '../../lib/actionCardLabels.js'

const SUSPICIOUS_PAGE_SIZE = 10

export class UserManagementAdminPage extends UIElement {
  async load () {
    const [adminsRes, suspiciousRes, referralRes, reportsRes, blockedRes] = await Promise.all([
      server.getAdmins(),
      server.getSuspiciousActions(this._suspiciousPage, SUSPICIOUS_PAGE_SIZE, this._suspiciousType, this._suspiciousSearch),
      server.getReferralSettings(),
      server.getReportedUsers(),
      server.getBlockedEmails()
    ])
    this._admins = adminsRes.admins
    this._suspicious = suspiciousRes.rows
    this._suspiciousTotal = suspiciousRes.total
    this._suspiciousPageSize = suspiciousRes.pageSize
    this._suspiciousTypes = suspiciousRes.types || []
    this._referralAction = referralRes.action
    this._referralOptions = referralRes.options || []
    this._reports = reportsRes.reports || []
    this._blockedEmails = blockedRes.blocked || []
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

        ${this._renderReferralBenefit()}

        ${this._renderBlockedEmails()}

        ${this._renderReportedUsers()}

        ${this._renderSuspiciousActions()}
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
      },
      [`#${this._referralBenefitBtnId}`]: {
        click: () => this._saveReferralBenefit()
      },
      // Delegated: the pagination buttons live inside a container whose
      // innerHTML is swapped on every filter change, so listeners bound
      // directly to the buttons would not survive.
      [`#${this._suspiciousResultsId}`]: {
        click: (e) => {
          if (e.target.closest('.suspicious-prev-btn')) this._goToSuspiciousPage(this._suspiciousPage - 1)
          else if (e.target.closest('.suspicious-next-btn')) this._goToSuspiciousPage(this._suspiciousPage + 1)
        }
      },
      [`#${this._suspiciousTypeSelectId}`]: {
        change: (e) => this._applySuspiciousFilter({ type: e.target.value })
      },
      [`#${this._suspiciousSearchInputId}`]: {
        input: (e) => {
          const value = e.target.value
          clearTimeout(this._suspiciousSearchDebounce)
          this._suspiciousSearchDebounce = setTimeout(() => {
            this._applySuspiciousFilter({ search: value })
          }, 300)
        }
      },
      '(optional).report-resolve-btn': {
        click: (e) => this._resolveReport(e.currentTarget.dataset.reportId)
      },
      [`#${this._blockEmailBtnId}`]: {
        click: () => this._blockEmail()
      },
      '(optional).email-unblock-btn': {
        click: (e) => this._unblockEmail(e.currentTarget.dataset.email)
      }
    }
  }

  _renderBlockedEmails () {
    const rows = this._blockedEmails.map(b => `
      <tr>
        <td>${this._escape(b.email)}</td>
        <td>${b.username ? `<a href="#user?id=${b.user_id}">${this._escape(b.username)}</a>` : '—'}</td>
        <td>${this._escape(b.reason) || '—'}</td>
        <td>${new Date(b.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary email-unblock-btn" data-email="${this._escapeAttr(b.email)}">
            <i class="fa fa-unlock" aria-hidden="true"></i> ${t('admin.blockedEmailsUnblock')}
          </button>
        </td>
      </tr>
    `).join('')

    return `
      <div class="mb-4">
        <h4>${t('admin.blockedEmailsTitle')} (${this._blockedEmails.length})</h4>
        <p class="text-muted">${t('admin.blockedEmailsDescription')}</p>
        ${this._blockedEmails.length > 0
    ? `<div class="horizontal-scrollable-table mb-3">
              <table class="table table-sm table-hover mb-0">
                <thead><tr>
                  <th>${t('admin.blockedEmailsEmail')}</th>
                  <th>${t('admin.blockedEmailsAccount')}</th>
                  <th>${t('admin.blockedEmailsReason')}</th>
                  <th>${t('admin.suspiciousActionsTime')}</th>
                  <th></th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
    : `<p class="text-muted">${t('admin.blockedEmailsEmpty')}</p>`}
        <div class="mb-2">
          <input type="email" id="${this._blockEmailInputId}" class="form-control" placeholder="${t('admin.blockedEmailsEmailPlaceholder')}">
        </div>
        <div class="input-group">
          <input type="text" id="${this._blockEmailReasonId}" class="form-control" placeholder="${t('admin.blockedEmailsReasonPlaceholder')}">
          <button id="${this._blockEmailBtnId}" class="btn btn-danger">
            <i class="fa fa-ban" aria-hidden="true"></i> ${t('admin.blockedEmailsBlock')}
          </button>
        </div>
      </div>
    `
  }

  async _blockEmail () {
    const emailInput = document.getElementById(this._blockEmailInputId)
    const reasonInput = document.getElementById(this._blockEmailReasonId)
    const email = emailInput.value.trim()
    if (!email) return
    if (!(await showConfirmDialog(t('admin.blockedEmailsConfirm', { email }), t('admin.blockedEmailsBlock'), t('dialog.cancel')))) return
    const btn = document.getElementById(this._blockEmailBtnId)
    try {
      btn.disabled = true
      const result = await server.blockEmailAddress(email, reasonInput.value.trim())
      toast(t('admin.blockedEmailsBlocked', { email, count: result.affectedUsers.length }), 'success')
      emailInput.value = ''
      reasonInput.value = ''
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._blockEmailBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }

  async _unblockEmail (email) {
    if (!(await showConfirmDialog(t('admin.blockedEmailsUnblockConfirm', { email }), t('admin.blockedEmailsUnblock'), t('dialog.cancel')))) return
    try {
      await server.unblockEmailAddress(email)
      toast(t('admin.blockedEmailsUnblocked', { email }), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }
  _renderReportedUsers () {
    const rows = this._reports.map(r => `
      <tr class="${r.status === 'open' ? '' : 'text-muted'}">
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td><a href="#user?id=${r.reported_id}">${r.reported_username}</a></td>
        <td><a href="#user?id=${r.reporter_id}">${r.reporter_username}</a></td>
        <td>${this._escape(r.reason)}</td>
        <td>
          ${r.status === 'open'
    ? `<button class="btn btn-sm btn-outline-success report-resolve-btn" data-report-id="${r.id}"><i class="fa fa-check"></i> ${t('admin.reportResolve')}</button>`
    : `<span class="badge bg-secondary">${t('admin.reportResolved')}</span>`}
        </td>
      </tr>
    `).join('')

    return `
      <div class="mb-4">
        <h4>${t('admin.reportedUsersTitle')} (${this._reports.filter(r => r.status === 'open').length})</h4>
        <p class="text-muted">${t('admin.reportedUsersDescription')}</p>
        ${this._reports.length > 0
    ? `<div class="horizontal-scrollable-table">
              <table class="table table-sm table-hover mb-0">
                <thead><tr>
                  <th>${t('admin.suspiciousActionsTime')}</th>
                  <th>${t('admin.reportedUser')}</th>
                  <th>${t('admin.reportedBy')}</th>
                  <th>${t('admin.reportReason')}</th>
                  <th></th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`
    : `<p class="text-muted">${t('admin.reportedUsersEmpty')}</p>`}
      </div>
    `
  }

  _escape (text) {
    const div = document.createElement('div')
    div.textContent = text ?? ''
    return div.innerHTML
  }

  /**
   * Escape for use inside a double-quoted HTML attribute. `_escape` goes
   * through textContent, which leaves quotes untouched — fine for element
   * content, not for `data-*` values that come from admin free text.
   */
  _escapeAttr (text) {
    return this._escape(text).replaceAll('"', '&quot;')
  }

  async _resolveReport (reportId) {
    try {
      await server.resolveUserReport(Number(reportId))
      toast(t('admin.reportResolvedToast'), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    }
  }

  _renderReferralBenefit () {
    const options = this._referralOptions.map(value => {
      const label = actionCardLabel(value)
      const selected = value === this._referralAction ? ' selected' : ''
      return `<option value="${value}"${selected}>${label}</option>`
    }).join('')
    return `
      <div class="mb-4">
        <h4>${t('admin.referralBenefitTitle')}</h4>
        <p class="text-muted">${t('admin.referralBenefitDescription')}</p>
        <div class="input-group">
          <select id="${this._referralBenefitSelectId}" class="form-control">
            ${options}
          </select>
          <button id="${this._referralBenefitBtnId}" class="btn btn-info">
            <i class="fa fa-save" aria-hidden="true"></i> ${t('admin.referralBenefitSave')}
          </button>
        </div>
      </div>
    `
  }
  /**
   * Section wrapper. The filter controls live outside `#_suspiciousResultsId`
   * on purpose: filtering re-renders only the results container, so the search
   * input keeps its focus and caret while the admin types (#488).
   * @returns {string}
   */
  _renderSuspiciousActions () {
    return `
      <div class="mb-4">
        <h4>${t('admin.suspiciousActionsTitle')}</h4>
        <p class="text-muted">${t('admin.suspiciousActionsDescription')}</p>
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-5">
            <select id="${this._suspiciousTypeSelectId}" class="form-select form-select-sm">
              <option value="">${t('admin.suspiciousFilterAllTypes')}</option>
              ${this._suspiciousTypes.map(type => `
                <option value="${type}" ${type === this._suspiciousType ? 'selected' : ''}>${t('admin.suspiciousType.' + type)}</option>
              `).join('')}
            </select>
          </div>
          <div class="col-12 col-md-7">
            <input type="text" id="${this._suspiciousSearchInputId}" class="form-control form-control-sm"
                   placeholder="${t('admin.suspiciousFilterSearchPlaceholder')}" value="${this._suspiciousSearch}">
          </div>
        </div>
        <div id="${this._suspiciousResultsId}">${this._renderSuspiciousResults()}</div>
      </div>
    `
  }

  /**
   * The filtered result set: count, table and pagination.
   * @returns {string}
   */
  _renderSuspiciousResults () {
    const totalPages = Math.max(1, Math.ceil(this._suspiciousTotal / this._suspiciousPageSize))
    const currentPage = Math.min(this._suspiciousPage, totalPages)
    const isFirstPage = currentPage <= 1
    const isLastPage = currentPage >= totalPages

    const rows = this._suspicious.map(s => `
      <tr>
        <td>${new Date(s.time).toLocaleString()}</td>
        <td>${t(s.description_key, this._formatDescriptionParams(s.description_params))}</td>
        <td>${this._formatUser(s.user1)}</td>
        <td>${this._formatUser(s.user2)}</td>
      </tr>
    `).join('')

    if (this._suspicious.length === 0) {
      return `<p class="text-muted">${t('admin.suspiciousActionsEmpty')}</p>`
    }
    return `
      <p class="text-muted small">${t('admin.suspiciousActionsCount', { total: this._suspiciousTotal })}</p>
      <div class="horizontal-scrollable-table">
        <table class="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <th>${t('admin.suspiciousActionsTime')}</th>
              <th>${t('admin.suspiciousActionsDescriptionColumn')}</th>
              <th>${t('admin.suspiciousActionsUser1')}</th>
              <th>${t('admin.suspiciousActionsUser2')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="d-flex align-items-center justify-content-between mt-3">
        <button class="btn btn-sm btn-outline-secondary suspicious-prev-btn" ${isFirstPage ? 'disabled' : ''}>
          <i class="fa fa-chevron-left" aria-hidden="true"></i> ${t('admin.paginationPrev')}
        </button>
        <span class="text-muted">${t('admin.paginationPage', { page: currentPage, total: totalPages })}</span>
        <button class="btn btn-sm btn-outline-secondary suspicious-next-btn" ${isLastPage ? 'disabled' : ''}>
          ${t('admin.paginationNext')} <i class="fa fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `
  }

  /**
   * Apply a filter change and reload the results from page 1 — a narrowed set
   * makes the old page number meaningless.
   * @param {{type?: string, search?: string}} change
   * @returns {Promise<void>}
   */
  async _applySuspiciousFilter ({ type, search }) {
    if (type !== undefined) this._suspiciousType = type
    if (search !== undefined) this._suspiciousSearch = search
    this._suspiciousPage = 1
    await this._refreshSuspicious()
  }

  /**
   * Re-fetch the suspicious actions with the current filters and swap only the
   * results container, leaving the filter inputs (and their focus) untouched.
   * @returns {Promise<void>}
   */
  async _refreshSuspicious () {
    const res = await server.getSuspiciousActions(
      this._suspiciousPage, SUSPICIOUS_PAGE_SIZE, this._suspiciousType, this._suspiciousSearch
    )
    this._suspicious = res.rows
    this._suspiciousTotal = res.total
    this._suspiciousPageSize = res.pageSize
    this._suspiciousTypes = res.types || this._suspiciousTypes
    const container = document.getElementById(this._suspiciousResultsId)
    if (container) container.innerHTML = this._renderSuspiciousResults()
  }

  _formatUser (user) {
    if (!user) return '—'
    if (user.username) {
      const club = user.team_name ? ` (${user.team_name})` : ''
      return `${user.username}${club}`
    }
    if (user.team_name) return user.team_name
    return '—'
  }

  _formatDescriptionParams (params) {
    if (!params) return {}
    const formatted = {}
    for (const [k, v] of Object.entries(params)) {
      if ((k === 'price' || k === 'value' || k === 'total') && typeof v === 'number') {
        formatted[k] = this._formatMoney(v)
      } else {
        formatted[k] = v
      }
    }
    return formatted
  }

  _formatMoney (value) {
    const number = Number(value) || 0
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
      }).format(number)
    } catch {
      return `${number} €`
    }
  }

  async _goToSuspiciousPage (page) {
    const totalPages = Math.max(1, Math.ceil(this._suspiciousTotal / this._suspiciousPageSize))
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === this._suspiciousPage) return
    this._suspiciousPage = next
    await this._refreshSuspicious()
  }

  _deleteUsernameId = generateId()
  _deleteUserBtnId = generateId()
  _addAdminInputId = generateId()
  _addAdminBtnId = generateId()
  _sendEmailUsernameId = generateId()
  _sendEmailMessageId = generateId()
  _sendEmailBtnId = generateId()
  _referralBenefitSelectId = generateId()
  _referralBenefitBtnId = generateId()
  _suspiciousResultsId = generateId()
  _suspiciousTypeSelectId = generateId()
  _suspiciousSearchInputId = generateId()
  _suspiciousSearchDebounce = null
  _blockEmailInputId = generateId()
  _blockEmailReasonId = generateId()
  _blockEmailBtnId = generateId()
  _blockedEmails = []
  _admins = []
  _suspicious = []
  _suspiciousTotal = 0
  _suspiciousPage = 1
  _suspiciousPageSize = SUSPICIOUS_PAGE_SIZE
  _suspiciousTypes = []
  _suspiciousType = ''
  _suspiciousSearch = ''
  _referralAction = ''
  _referralOptions = []
  _reports = []

  async _saveReferralBenefit () {
    const select = document.getElementById(this._referralBenefitSelectId)
    const btn = document.getElementById(this._referralBenefitBtnId)
    if (!select || !btn) return
    const action = select.value
    const label = select.options[select.selectedIndex]?.textContent || action
    try {
      btn.disabled = true
      await server.setReferralBenefit(action)
      this._referralAction = action
      toast(t('admin.referralBenefitSaved', { card: label }), 'success')
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error')
    } finally {
      const refreshed = document.getElementById(this._referralBenefitBtnId)
      if (refreshed) refreshed.disabled = false
    }
  }

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
