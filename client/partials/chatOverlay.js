import { server } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { canRecordAudio, formatDuration, startRecording } from '../lib/voiceRecorder.js'
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

/**
 * Window event dispatched whenever the chat overlay loads a conversation, which
 * marks its incoming messages read server-side. Listeners (e.g. the dashboard
 * unread-chat banner) refresh their unread count so stale badges disappear once
 * everything has been read.
 */
export const CHAT_MESSAGES_READ_EVENT = 'chat-messages-read'

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

export class ChatController {
  /**
   * @param {number|null} initialUserId
   */
  constructor (initialUserId) {
    this._activeUserId = initialUserId
    this._conversations = []
    this._partner = null
    this._messages = []
    this._pendingImage = null
    /** Active voice recording, or null when nothing is being recorded (#541). */
    this._recorder = null
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

    const overlay = showOverlay(
      t('chat.title'), '',
      `<div id="${this._bodyId}" class="chat-overlay"></div>`,
      { cardClass: 'chat-overlay-card' }
    )
    this._overlay = overlay
    overlay.onClose(() => this._teardown())
    onServerEvent(SERVER_EVENTS.NEW_CHAT_MESSAGE.name, this._onNewMessage)
    this._render()
  }

  _teardown () {
    // Closing the overlay mid-recording must release the microphone, otherwise
    // the OS keeps its recording indicator lit (#541).
    this._recorder?.cancel()
    this._recorder = null
    offServerEvent(SERVER_EVENTS.NEW_CHAT_MESSAGE.name, this._onNewMessage)
    this._closeImageLightbox()
    setQueryParams({ chat_user: null })
    _openOverlay = null
  }

  /**
   * Open a chat image full-screen in a lightbox overlay. Click anywhere (or the
   * close button) to dismiss. Mirrors the forum/wiki image overlay pattern.
   * @param {string} src
   */
  _openImageLightbox (src) {
    this._closeImageLightbox()
    const overlay = document.createElement('div')
    overlay.className = 'chat-image-overlay'
    overlay.innerHTML = `<img src="${src}" alt="">`
    overlay.addEventListener('click', () => this._closeImageLightbox())
    document.body.appendChild(overlay)
    this._imageLightbox = overlay
  }

  _closeImageLightbox () {
    this._imageLightbox?.remove()
    this._imageLightbox = null
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
    // Loading a conversation marks its incoming messages read server-side —
    // let the dashboard banner refresh its unread count so it disappears once
    // everything has been read.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHAT_MESSAGES_READ_EVENT))
    }
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
    const micId = generateId()
    const recordingId = generateId()

    const options = this._conversations.map(c => {
      const label = c.unread > 0 ? `${c.username} (${c.unread})` : c.username
      return `<option value="${c.userId}"${c.userId === this._activeUserId ? ' selected' : ''}>${label}</option>`
    }).join('')

    container.innerHTML = `
      <select id="${selectId}" class="form-select mb-3 chat-conversation-select">${options}</select>
      <div id="${messagesId}" class="chat-messages">${this._renderMessages()}</div>
      <div id="${previewId}" class="chat-image-preview"></div>
      <form class="chat-input-row d-flex align-items-end gap-2 mt-2">
        <button id="${imageBtnId}" type="button" class="btn btn-outline-secondary chat-attach-btn" title="${t('chat.addImage')}">
          <i class="fa fa-image"></i>
        </button>
        <input id="${imageInputId}" type="file" accept="image/*" class="d-none">
        ${canRecordAudio()
    ? `<button id="${micId}" type="button" class="btn btn-outline-secondary chat-mic-btn chat-attach-btn" title="${t('chat.recordVoice')}">
               <i class="fa fa-microphone"></i>
             </button>`
    : ''}
        <textarea id="${inputId}" class="form-control chat-text-input" rows="1" placeholder="${t('chat.placeholder')}"></textarea>
        <button id="${sendId}" type="button" class="btn btn-info"><i class="fa fa-paper-plane"></i></button>
      </form>
      <div id="${recordingId}" class="chat-recording d-none">
        <span class="chat-recording__dot"></span>
        <span class="chat-recording__time">0:00</span>
        <button type="button" class="btn btn-sm btn-link text-danger chat-recording__cancel">${t('chat.cancelRecording')}</button>
        <button type="button" class="btn btn-sm btn-info chat-recording__send">${t('chat.sendRecording')}</button>
      </div>
    `

    const messagesEl = el('#' + messagesId)
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight

    // Open chat images in a full-screen lightbox instead of a hard link.
    // Delegated so it also covers messages appended live after this render.
    messagesEl?.addEventListener('click', (e) => {
      const img = e.target.closest?.('.chat-message-image')
      if (img) this._openImageLightbox(img.src)
    })

    el('#' + selectId)?.addEventListener('change', (e) => {
      void this.switchTo(Number(e.target.value))
    })

    if (canRecordAudio()) this._wireRecording(micId, recordingId)

    onClick('#' + imageBtnId, () => el('#' + imageInputId)?.click())
    el('#' + imageInputId)?.addEventListener('change', (e) => this._onImagePicked(e, previewId))
    onClick('#' + sendId, () => this._send(inputId, previewId))

    // While the user is typing, fold the attachment buttons away so the text
    // field gets the whole row — they come back as soon as the field loses
    // focus. `blur` cannot fire before a click on those buttons (they are
    // collapsed and unclickable while typing), so no click is swallowed.
    const inputEl = el('#' + inputId)
    const formEl = inputEl?.closest('.chat-input-row')
    inputEl?.addEventListener('focus', () => formEl?.classList.add('chat-input-row--typing'))
    inputEl?.addEventListener('blur', () => formEl?.classList.remove('chat-input-row--typing'))

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
    return this._messages.map(m => this._renderMessage(m)).join('')
  }

  /**
   * One message row. Shared by the full render and the live append so a new
   * message always looks exactly like a reloaded one.
   * @param {Object} message
   * @returns {string}
   */
  _renderMessage (message) {
    const mine = message.from_user_id !== this._partner?.id
    const imageHtml = message.image
      ? `<img class="chat-message-image" src="${chatImageSrc(message.image)}" alt="">`
      : ''
    const audioHtml = message.audio
      ? `<div class="chat-message-audio">
           <audio controls preload="none" src="${chatImageSrc(message.audio)}"></audio>
           <span class="chat-audio-duration">${formatDuration(message.audio_duration)}</span>
         </div>`
      : ''
    const textHtml = message.text ? `<div class="chat-message-text">${_escape(message.text)}</div>` : ''
    return `
      <div class="chat-message ${mine ? 'chat-message--mine' : 'chat-message--theirs'}">
        <div class="chat-bubble">${imageHtml}${audioHtml}${textHtml}</div>
      </div>
    `
  }

  /**
   * Wire the microphone button and the recording bar (#541). Recording runs
   * until the user sends or cancels, or until the two-minute cap trips.
   * @param {string} micId
   * @param {string} recordingId
   */
  _wireRecording (micId, recordingId) {
    const bar = el('#' + recordingId)
    const timeEl = bar?.querySelector('.chat-recording__time')

    const close = () => {
      this._recorder = null
      bar?.classList.add('d-none')
      if (timeEl) timeEl.textContent = '0:00'
    }

    onClick('#' + micId, async () => {
      if (this._recorder) return
      try {
        this._recorder = await startRecording({
          onTick: (seconds) => { if (timeEl) timeEl.textContent = formatDuration(seconds) },
          // The cap is enforced by sending what has been recorded so far, not
          // by silently dropping it.
          onAutoStop: () => { void send() }
        })
        bar?.classList.remove('d-none')
      } catch (e) {
        // Almost always a denied microphone permission.
        console.warn('[chat] recording failed to start', e)
        toast(t('chat.micDenied'), 'error')
        close()
      }
    })

    const send = async () => {
      const recorder = this._recorder
      if (!recorder) return
      close()
      try {
        const audio = await recorder.stop()
        if (!audio) return
        await this._sendPayload({ audio })
      } catch (e) {
        toast(e?.message ?? t('chat.sendFailed'), 'error')
      }
    }

    bar?.querySelector('.chat-recording__send')?.addEventListener('click', () => { void send() })
    bar?.querySelector('.chat-recording__cancel')?.addEventListener('click', () => {
      this._recorder?.cancel()
      close()
    })
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
    await this._sendPayload({ text, image: this._pendingImage })
    if (input) input.value = ''
    this._pendingImage = null
    const preview = el('#' + previewId)
    if (preview) preview.innerHTML = ''
  }

  /**
   * Post one message and show it straight away. Text, image and voice all go
   * through here so they cannot drift apart.
   * @param {{text?: string, image?: object|null, audio?: object|null}} payload
   * @returns {Promise<void>}
   */
  async _sendPayload ({ text = '', image = null, audio = null }) {
    if (!this._activeUserId) return
    try {
      const res = await server.sendChatMessage(this._activeUserId, text, image, audio)
      this._messages.push(res.message)
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
    messagesEl.insertAdjacentHTML('beforeend', this._renderMessage(message))
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
