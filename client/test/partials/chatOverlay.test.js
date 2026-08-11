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

import { ChatController } from '../../partials/chatOverlay.js'

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
