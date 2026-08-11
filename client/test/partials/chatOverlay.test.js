import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({ server: { sendChatMessage: vi.fn() } }))
vi.mock('../../partials/overlay.js', () => ({ showOverlay: vi.fn() }))
vi.mock('../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({ t: (key) => key }))
vi.mock('../../lib/html.js', () => ({ generateId: () => 'id', el: () => null }))
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
