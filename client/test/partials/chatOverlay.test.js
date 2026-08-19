import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({ server: { sendChatMessage: vi.fn() } }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }))
let idCounter = 0
vi.mock('../../lib/html.js', () => ({
  generateId: () => `gen${++idCounter}`,
  el: (selector) => document.querySelector(selector)
}))
vi.mock('../../lib/htmlEventHandlers.js', () => ({ onClick: vi.fn() }))
vi.mock('../../lib/websocket.js', () => ({ onServerEvent: vi.fn(), offServerEvent: vi.fn() }))
vi.mock('../../lib/router.js', () => ({ setQueryParams: vi.fn() }))

import { ChatController, renderReadReceipt } from '../../partials/chatOverlay.js'

/**
 * @param {object} [partner]
 * @returns {ChatController}
 */
function controller (partner = { id: 2 }) {
  const c = new ChatController(2)
  c._partner = partner
  return c
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChatController._renderMessage voice messages (#541)', () => {
  it('renders an audio player and the duration for a voice message', () => {
    const html = controller()._renderMessage({
      from_user_id: 1, audio: 'abc.webm', audio_duration: 65
    })
    expect(html).toContain('chat-message-audio')
    expect(html).toContain('abc.webm')
    expect(html).toContain('1:05')
  })

  it('does not render an audio player for a plain text message', () => {
    const html = controller()._renderMessage({ from_user_id: 1, text: 'hello' })
    expect(html).not.toContain('chat-message-audio')
    expect(html).toContain('hello')
  })

  it('marks a message from the partner as theirs', () => {
    const html = controller()._renderMessage({ from_user_id: 2, audio: 'a.webm', audio_duration: 3 })
    expect(html).toContain('chat-message--theirs')
  })

  it('marks my own message as mine', () => {
    const html = controller()._renderMessage({ from_user_id: 1, audio: 'a.webm', audio_duration: 3 })
    expect(html).toContain('chat-message--mine')
  })

  it('can carry a voice message and text in the same bubble', () => {
    const html = controller()._renderMessage({
      from_user_id: 1, audio: 'a.webm', audio_duration: 8, text: 'listen'
    })
    expect(html).toContain('chat-message-audio')
    expect(html).toContain('listen')
  })

  it('escapes text next to an attachment', () => {
    const html = controller()._renderMessage({
      from_user_id: 1, image: 'p.jpg', text: '<script>x</script>'
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows a missing duration as 0:00 rather than NaN', () => {
    const html = controller()._renderMessage({ from_user_id: 1, audio: 'a.webm' })
    expect(html).toContain('0:00')
    expect(html).not.toContain('NaN')
  })

  it('loads audio lazily so opening a chat does not fetch every recording', () => {
    const html = controller()._renderMessage({ from_user_id: 1, audio: 'a.webm', audio_duration: 4 })
    expect(html).toContain('preload="none"')
  })
})

describe('ChatController input row focus (#541)', () => {
  /**
   * Render the controller into a real container so the focus wiring can run.
   * @param {{withMic?: boolean}} [options]
   * @returns {ChatController}
   */
  function render ({ withMic = false } = {}) {
    if (withMic) {
      window.MediaRecorder = class {}
      navigator.mediaDevices = { getUserMedia: vi.fn() }
    }
    const c = controller()
    c._conversations = [{ userId: 2, username: 'Bob', unread: 0 }]
    c._messages = []
    document.body.innerHTML = `<div id="${c._bodyId}"></div>`
    c._render()
    return c
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    delete window.MediaRecorder
    delete navigator.mediaDevices
  })

  it('marks the image button as collapsible', () => {
    render()
    const buttons = document.querySelectorAll('.chat-attach-btn')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].querySelector('.fa-image')).toBeTruthy()
  })

  it('marks the microphone button as collapsible too', () => {
    render({ withMic: true })
    expect(document.querySelectorAll('.chat-attach-btn')).toHaveLength(2)
  })

  it('folds the buttons away while the text field has focus', () => {
    render()
    const form = document.querySelector('.chat-input-row')
    const input = document.querySelector('.chat-text-input')

    expect(form.classList.contains('chat-input-row--typing')).toBe(false)
    input.dispatchEvent(new window.FocusEvent('focus'))
    expect(form.classList.contains('chat-input-row--typing')).toBe(true)
  })

  it('brings them back when the field loses focus', () => {
    render()
    const form = document.querySelector('.chat-input-row')
    const input = document.querySelector('.chat-text-input')

    input.dispatchEvent(new window.FocusEvent('focus'))
    input.dispatchEvent(new window.FocusEvent('blur'))

    expect(form.classList.contains('chat-input-row--typing')).toBe(false)
  })

  it('leaves the send button alone — it stays reachable while typing', () => {
    render()
    const send = document.querySelector('.chat-input-row .btn-info')
    expect(send.classList.contains('chat-attach-btn')).toBe(false)
  })
})

describe('ChatController conversation selector placement', () => {
  /**
   * Render with both the header slot and the body present, the way the real
   * overlay does.
   * @returns {ChatController}
   */
  function render () {
    const c = controller()
    c._conversations = [
      { userId: 2, username: 'Bob', unread: 0 },
      { userId: 3, username: 'Alice', unread: 2 }
    ]
    c._messages = []
    document.body.innerHTML = `
      <div class="card-header overlay-header">
        <div class="overlay-header__title"><h3>chat.title</h3></div>
        <div class="overlay-header__slot"><div id="${c._headerSlotId}" class="chat-select-slot"></div></div>
        <span class="overlay-close-btn"></span>
      </div>
      <div id="${c._bodyId}"></div>`
    c._render()
    return c
  }

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the selector into the card header, not the sheet body', () => {
    const c = render()
    expect(document.querySelector('.overlay-header .chat-conversation-select')).toBeTruthy()
    expect(document.querySelector(`#${c._bodyId} .chat-conversation-select`)).toBeNull()
  })

  it('keeps the header on one row: title, selector and close button are siblings', () => {
    render()
    const header = document.querySelector('.overlay-header')
    expect(header.querySelector('.overlay-header__title')).toBeTruthy()
    expect(header.querySelector('.overlay-header__slot')).toBeTruthy()
    expect(header.querySelector('.overlay-close-btn')).toBeTruthy()
  })

  it('lists every conversation with its unread count', () => {
    render()
    const select = document.querySelector('.chat-conversation-select')
    expect(select.options).toHaveLength(2)
    expect(select.options[1].textContent).toBe('Alice (2)')
  })

  it('preselects the active conversation', () => {
    render()
    expect(document.querySelector('.chat-conversation-select').value).toBe('2')
  })

  it('clears the header selector when there is nothing to chat about', () => {
    const c = controller(null)
    c._conversations = []
    document.body.innerHTML = `
      <div class="overlay-header"><div id="${c._headerSlotId}"></div></div>
      <div id="${c._bodyId}"></div>`
    c._render()
    expect(document.querySelector('.chat-conversation-select')).toBeNull()
    expect(document.querySelector(`#${c._headerSlotId}`).innerHTML).toBe('')
  })

  it('still renders the sheet body when no header slot exists', () => {
    const c = controller()
    c._conversations = [{ userId: 2, username: 'Bob', unread: 0 }]
    c._messages = []
    document.body.innerHTML = `<div id="${c._bodyId}"></div>`
    c._render()
    expect(document.querySelector('.chat-messages')).toBeTruthy()
  })
})

describe('read receipts', () => {
  it('shows a single tick on my own unread message', () => {
    const html = controller()._renderMessage({ id: 9, from_user_id: 1, text: 'hi', read_at: null })
    expect(html).toContain('chat-ticks')
    expect(html).not.toContain('chat-ticks--read')
    expect(html.match(/fa-check/g)).toHaveLength(1)
    expect(html).toContain('chat.messageSent')
  })

  it('shows two ticks once the partner has read it', () => {
    const html = controller()._renderMessage({
      id: 9, from_user_id: 1, text: 'hi', read_at: '2026-08-19T10:00:00Z'
    })
    expect(html).toContain('chat-ticks--read')
    expect(html.match(/fa-check/g)).toHaveLength(2)
    expect(html).toContain('chat.messageRead')
  })

  it('never puts a receipt on the partner\'s message', () => {
    const html = controller()._renderMessage({ id: 9, from_user_id: 2, text: 'hi', read_at: null })
    expect(html).not.toContain('chat-ticks')
  })

  it('accepts the plain read flag the conversation list carries', () => {
    expect(renderReadReceipt({ read: true })).toContain('chat-ticks--read')
    expect(renderReadReceipt({ read: false })).not.toContain('chat-ticks--read')
  })

  describe('CHAT_MESSAGES_READ', () => {
    /**
     * @returns {ChatController}
     */
    function withOpenConversation () {
      const c = controller()
      c._messages = [
        { id: 1, from_user_id: 1, text: 'mine', read_at: null },
        { id: 2, from_user_id: 2, text: 'theirs', read_at: null }
      ]
      document.body.innerHTML = `<div id="${c._bodyId}"><div class="chat-messages">` +
        c._messages.map(m => c._renderMessage(m)).join('') + '</div></div>'
      return c
    }

    it('turns my ticks into the read state in place', () => {
      const c = withOpenConversation()

      c._handleMessagesRead({ byUserId: 2 })

      const mine = document.querySelector('[data-message-id="1"] .chat-ticks')
      expect(mine.classList.contains('chat-ticks--read')).toBe(true)
      expect(c._messages[0].read_at).toBeTruthy()
    })

    it('leaves the partner\'s own messages untouched', () => {
      const c = withOpenConversation()

      c._handleMessagesRead({ byUserId: 2 })

      expect(document.querySelector('[data-message-id="2"] .chat-ticks')).toBeNull()
      expect(c._messages[1].read_at).toBeNull()
    })

    it('ignores a read event from another conversation', () => {
      const c = withOpenConversation()

      c._handleMessagesRead({ byUserId: 99 })

      expect(c._messages[0].read_at).toBeNull()
      expect(document.querySelector('[data-message-id="1"] .chat-ticks').classList.contains('chat-ticks--read')).toBe(false)
    })
  })
})
