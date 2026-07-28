import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { generateId, el } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { onServerEvent, offServerEvent } from '../lib/websocket.js'
import { setQueryParams } from '../lib/router.js'
import { SERVER_EVENTS } from '../lib/serverEvents.js'

/**
 * Resolve the URL for a stored chat image filename.
 * @param {string} filename
 * @returns {string}
 */
function chatImageSrc (filename) {
  return `${window.__NATIVE_SERVER_URL || ''}/uploads/chat/${filename}`
}

/** Only one chat overlay may be open at a time. */
let _openOverlay = null

/**
 * Open the chat overlay for a conversation with `userId`. The overlay shows a
 * conversation selector on top and the selected conversation below, and lets
 * the user send text + images. Live-updates via NEW_CHAT_MESSAGE.
 * @param {number} userId - The partner to open the conversation with
 * @returns {Promise<void>}
 */
export async function showChatOverlay (userId) {
  if (_openOverlay) {
    // Already open — just switch to the requested conversation.
    if (userId) await _openOverlay.switchTo(Number(userId))
    return
  }
  const chat = new ChatController(Number(userId) || null)
  _openOverlay = chat
  await chat.open()
}

class ChatController {
  /**
   * @param {number|null} initialUserId
   */
  constructor (initialUserId) {
    this._activeUserId = initialUserId
    this._conversations = []
    this._partner = null
    this._messages = []
    this._pendingImage = null
    this._bodyId = generateId()
    this._onNewMessage = (data) => this._handleIncoming(data)
  }

  async open () {
    // Load the conversation list, and the active conversation if one was given.
    const convRes = await server.getConversations().catch(() => ({ conversations: [] }))
    this._conversations = convRes.conversations ?? []
    if (this._activeUserId) {
      await this._loadMessages(this._activeUserId, false)
    } else if (this._conversations.length > 0) {
      this._activeUserId = this._conversations[0].userId
      await this._loadMessages(this._activeUserId, false)
    }

    const overlay = showOverlay(t('chat.title'), '', `<div id="${this._bodyId}" class="chat-overlay"></div>`)
    this._overlay = overlay
    overlay.onClose(() => this._teardown())
    onServerEvent(SERVER_EVENTS.NEW_CHAT_MESSAGE.name, this._onNewMessage)
    this._render()
  }

  _teardown () {
    offServerEvent(SERVER_EVENTS.NEW_CHAT_MESSAGE.name, this._onNewMessage)
    setQueryParams({ chat_user: null })
    _openOverlay = null
  }

  /**
   * Switch the active conversation (used when the overlay is already open and
   * a new chat is requested via a deep link or a chat button).
   * @param {number} userId
   */
  async switchTo (userId) {
    this._activeUserId = userId
    await this._loadMessages(userId, false)
    this._render()
  }

  /**
   * Load the messages for a conversation (marks incoming ones read server-side).
   * @param {number} userId
   * @param {boolean} rerender - Re-render the overlay body afterwards
   */
  async _loadMessages (userId, rerender = true) {
    const res = await server.getChatMessages(userId)
    this._partner = res.partner
    this._messages = res.messages ?? []
    // Ensure the partner appears in the conversation list even for a brand-new chat.
    if (this._partner && !this._conversations.some(c => c.userId === this._partner.id)) {
      this._conversations.unshift({
        userId: this._partner.id,
        username: this._partner.username,
        avatar: this._partner.avatar,
        unread: 0
      })
    }
    if (rerender) this._render()
  }

  _render () {
    const container = el('#' + this._bodyId)
    if (!container) return

    if (this._conversations.length === 0 && !this._partner) {
      container.innerHTML = `<p class="text-muted mb-0">${t('chat.empty')}</p>`
      return
    }

    const selectId = generateId()
    const messagesId = generateId()
    const inputId = generateId()
    const sendId = generateId()
    const imageBtnId = generateId()
    const imageInputId = generateId()
    const previewId = generateId()

    const options = this._conversations.map(c => {
      const label = c.unread > 0 ? `${c.username} (${c.unread})` : c.username
      return `<option value="${c.userId}"${c.userId === this._activeUserId ? ' selected' : ''}>${label}</option>`
    }).join('')

    container.innerHTML = `
      <select id="${selectId}" class="form-select mb-3 chat-conversation-select">${options}</select>
      <div id="${messagesId}" class="chat-messages">${this._renderMessages()}</div>
      <div id="${previewId}" class="chat-image-preview"></div>
      <form class="chat-input-row d-flex align-items-end gap-2 mt-2">
        <button id="${imageBtnId}" type="button" class="btn btn-outline-secondary" title="${t('chat.addImage')}">
          <i class="fa fa-image"></i>
        </button>
        <input id="${imageInputId}" type="file" accept="image/*" class="d-none">
        <textarea id="${inputId}" class="form-control chat-text-input" rows="1" placeholder="${t('chat.placeholder')}"></textarea>
        <button id="${sendId}" type="button" class="btn btn-info"><i class="fa fa-paper-plane"></i></button>
      </form>
    `

    const messagesEl = el('#' + messagesId)
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight

    el('#' + selectId)?.addEventListener('change', (e) => {
      void this.switchTo(Number(e.target.value))
    })

    onClick('#' + imageBtnId, () => el('#' + imageInputId)?.click())
    el('#' + imageInputId)?.addEventListener('change', (e) => this._onImagePicked(e, previewId))
    onClick('#' + sendId, () => this._send(inputId, previewId))

    // Enter to send (Shift+Enter for newline).
    el('#' + inputId)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void this._send(inputId, previewId)
      }
    })
  }

  _renderMessages () {
    if (this._messages.length === 0) {
      return `<p class="text-muted small text-center mb-0">${t('chat.noMessages')}</p>`
    }
    const partnerId = this._partner?.id
    return this._messages.map(m => {
      const mine = m.from_user_id !== partnerId
      const imageHtml = m.image
        ? `<a href="${chatImageSrc(m.image)}" target="_blank"><img class="chat-message-image" src="${chatImageSrc(m.image)}" alt=""></a>`
        : ''
      const textHtml = m.text ? `<div class="chat-message-text">${_escape(m.text)}</div>` : ''
      return `
        <div class="chat-message ${mine ? 'chat-message--mine' : 'chat-message--theirs'}">
          <div class="chat-bubble">${imageHtml}${textHtml}</div>
        </div>
      `
    }).join('')
  }

  _onImagePicked (event, previewId) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      this._pendingImage = { data: reader.result, type: file.type }
      const preview = el('#' + previewId)
      if (preview) {
        preview.innerHTML = `<img class="chat-message-image" src="${reader.result}" alt=""> <button type="button" class="btn btn-sm btn-link text-danger chat-remove-image">${t('chat.removeImage')}</button>`
        preview.querySelector('.chat-remove-image')?.addEventListener('click', () => {
          this._pendingImage = null
          preview.innerHTML = ''
        })
      }
    }
    reader.readAsDataURL(file)
  }

  async _send (inputId, previewId) {
    const input = el('#' + inputId)
    const text = input?.value?.trim() ?? ''
    if (!text && !this._pendingImage) return
    if (!this._activeUserId) return
    try {
      const res = await server.sendChatMessage(this._activeUserId, text, this._pendingImage)
      this._messages.push(res.message)
      this._pendingImage = null
      if (input) input.value = ''
      const preview = el('#' + previewId)
      if (preview) preview.innerHTML = ''
      this._appendMessageDom(res.message)
    } catch (e) {
      toast(e.message ?? t('chat.sendFailed'), 'error')
    }
  }

  /**
   * Append a single message to the visible list without a full re-render, then
   * scroll to the bottom.
   * @param {Object} message
   */
  _appendMessageDom (message) {
    const container = el('#' + this._bodyId)
    const messagesEl = container?.querySelector('.chat-messages')
    if (!messagesEl) { this._render(); return }
    // Drop the "no messages yet" placeholder on first message.
    if (this._messages.length === 1) messagesEl.innerHTML = ''
    const partnerId = this._partner?.id
    const mine = message.from_user_id !== partnerId
    const imageHtml = message.image
      ? `<a href="${chatImageSrc(message.image)}" target="_blank"><img class="chat-message-image" src="${chatImageSrc(message.image)}" alt=""></a>`
      : ''
    const textHtml = message.text ? `<div class="chat-message-text">${_escape(message.text)}</div>` : ''
    messagesEl.insertAdjacentHTML('beforeend', `
      <div class="chat-message ${mine ? 'chat-message--mine' : 'chat-message--theirs'}">
        <div class="chat-bubble">${imageHtml}${textHtml}</div>
      </div>
    `)
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  /**
   * Handle an incoming NEW_CHAT_MESSAGE websocket event.
   * @param {{fromUserId: number, message: Object}} data
   */
  async _handleIncoming (data) {
    if (!data?.message) return
    if (data.fromUserId === this._activeUserId) {
      // Message for the open conversation — show it and mark it read.
      this._messages.push(data.message)
      this._appendMessageDom(data.message)
      void server.getChatMessages(this._activeUserId).catch(() => {})
    } else {
      // Message for another conversation — refresh the selector's unread badges.
      const res = await server.getConversations().catch(() => null)
      if (res) {
        this._conversations = res.conversations ?? []
        this._render()
      }
    }
  }
}

/**
 * Escape user text for safe insertion into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function _escape (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}
