import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { formatDate } from '../lib/date.js'
import { goTo, setQueryParams } from '../lib/router.js'

const PAGE_SIZE = 10

export class LogMessages extends UIElement {
  messages = []
  _pageIndex = 0
  _totalMessages = 0

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.log-messages-list': {
        click: async (event) => {
          const target = event.target

          // Handle delete button
          const deleteBtn = target.closest('[data-delete-message]')
          if (deleteBtn) {
            event.stopPropagation()
            const messageId = parseInt(deleteBtn.dataset.deleteMessage, 10)
            await this._deleteMessage(messageId)
            return
          }

          // Handle message action button
          const actionBtn = target.closest('[data-message-action]')
          if (actionBtn && !actionBtn.classList.contains('disabled')) {
            const action = actionBtn.dataset.messageAction
            const actionValue = actionBtn.dataset.messageActionValue
            this._performAction(action, actionValue)
          }
        }
      },
      '.log-messages-prev': {
        click: () => this._loadPage(this._pageIndex - 1)
      },
      '.log-messages-next': {
        click: () => this._loadPage(this._pageIndex + 1)
      },
      '.log-messages-pagination': {
        click: (event) => {
          const pageLink = event.target.closest('[data-page-index]')
          if (pageLink) {
            const pageIndex = parseInt(pageLink.dataset.pageIndex, 10)
            this._loadPage(pageIndex)
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>Messages</h3>
        <ul class="list-group log-messages-list">
          ${this.messages.length === 0
            ? '<li class="list-group-item text-muted">No messages yet...</li>'
            : this.messages.map(m => this._renderMessage(m)).join('')}
        </ul>
        ${this._renderPagination()}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [messagesResponse, countResponse] = await Promise.all([
      server.getLogMessages(this._pageIndex, PAGE_SIZE),
      server.getLogMessageCount()
    ])
    this.messages = messagesResponse
    this._totalMessages = countResponse.count
  }

  /**
   * @param {Object} message
   * @returns {string}
   */
  _renderMessage (message) {
    const isToday = formatDate('WORDY hh:mm', message.created_at).toLowerCase().includes('today')
    const hasAction = message.action
    const actionAttrs = hasAction
      ? `data-message-action="${message.action}" data-message-action-value="${message.action_value || ''}"`
      : ''
    const icon = message.icon || 'envelope'

    return `
      <li class="list-group-item d-flex justify-content-between align-items-center ${isToday ? 'text-primary' : 'text-muted'}">
        <div>
          <small>${formatDate('WORDY hh:mm', message.created_at)}</small><br>
          <i class="fa fa-${icon}" aria-hidden="true"></i> ${message.message}
        </div>
        <div class="d-flex">
          <button class="btn btn-sm btn-outline-info ms-2${hasAction ? '' : ' disabled'}" ${actionAttrs} title="Open">
            <i class="fa fa-external-link" aria-hidden="true"></i>
          </button>
          <button class="btn btn-sm btn-outline-dark ms-2" data-delete-message="${message.id}" title="Delete message">
            <i class="fa fa-trash" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    `
  }

  /**
   * @returns {string}
   */
  _renderPagination () {
    const totalPages = Math.ceil(this._totalMessages / PAGE_SIZE)
    if (totalPages <= 1) return ''

    const hasPrev = this._pageIndex > 0
    const hasNext = this._pageIndex < totalPages - 1

    const pageNumbers = Array.from({ length: totalPages }, (_, i) => {
      const isActive = i === this._pageIndex
      return `
        <li class="page-item ${isActive ? 'active' : ''}">
          <span class="page-link" style="cursor: pointer;" data-page-index="${i}">${i + 1}</span>
        </li>
      `
    }).join('')

    return `
      <nav class="mt-3 log-messages-pagination">
        <ul class="pagination pagination-sm justify-content-center flex-wrap">
          <li class="page-item ${hasPrev ? '' : 'disabled'}">
            <span class="page-link log-messages-prev" style="cursor: pointer;">Previous</span>
          </li>
          ${pageNumbers}
          <li class="page-item ${hasNext ? '' : 'disabled'}">
            <span class="page-link log-messages-next" style="cursor: pointer;">Next</span>
          </li>
        </ul>
      </nav>
    `
  }

  /**
   * @param {number} pageIndex
   * @returns {Promise<void>}
   */
  async _loadPage (pageIndex) {
    const totalPages = Math.ceil(this._totalMessages / PAGE_SIZE)
    if (pageIndex < 0 || pageIndex >= totalPages) return

    this._pageIndex = pageIndex
    this.messages = await server.getLogMessages(this._pageIndex, PAGE_SIZE)
    await this.update(false)
  }

  /**
   * @param {number} messageId
   * @returns {Promise<void>}
   */
  async _deleteMessage (messageId) {
    try {
      await server.deleteLogMessage(messageId)
      // Remove from DOM without full re-render
      const messageEl = document.querySelector(`[data-delete-message="${messageId}"]`)?.closest('li')
      if (messageEl) {
        messageEl.remove()
      }
      this.messages = this.messages.filter(m => m.id !== messageId)
      this._totalMessages--

      // Show empty state if no messages left on this page
      if (this.messages.length === 0 && this._totalMessages > 0) {
        // Load previous page if available
        await this._loadPage(Math.max(0, this._pageIndex - 1))
      } else if (this.messages.length === 0) {
        // Show empty state
        const list = document.querySelector('.log-messages-list')
        if (list) {
          list.innerHTML = '<li class="list-group-item text-muted">No messages yet...</li>'
        }
        // Remove pagination
        const pagination = document.querySelector('.log-messages-pagination')
        pagination?.remove()
      } else {
        // Update pagination if needed
        const totalPages = Math.ceil(this._totalMessages / PAGE_SIZE)
        if (totalPages <= 1) {
          const pagination = document.querySelector('.log-messages-pagination')
          pagination?.remove()
        }
      }
    } catch (e) {
      toast(e.message ?? 'Failed to delete message', 'error')
    }
  }

  /**
   * @param {string} action
   * @param {string} actionValue
   */
  _performAction (action, actionValue) {
    switch (action) {
      case 'OPEN_PLAYER':
        if (actionValue) {
          setQueryParams({ player_id: actionValue })
        }
        break
      case 'OPEN_MY_TEAM_PAGE':
        goTo('my-team')
        break
      case 'OPEN_TEAM_PAGE':
        if (actionValue) {
          goTo(`team?id=${actionValue}`)
        }
        break
      case 'OPEN_INCOMING_OFFERS':
        goTo('trades#incoming')
        break
      default:
        console.log('Unknown action:', action, actionValue)
    }
  }
}
