import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('fs', () => ({
  default: { mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}))
vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../../lib/websocket.js', () => ({
  sendToUser: vi.fn()
}))
vi.mock('../../lib/pushNotification.js', () => ({
  sendPushNotifications: vi.fn().mockResolvedValue()
}))
vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))
// The real helper shells out to ffmpeg; this stand-in keeps its contract —
// containers iOS cannot decode come back as .m4a, the rest untouched (#541).
vi.mock('../../lib/audioTranscode.js', () => ({
  UNIVERSAL_AUDIO_EXTENSIONS: new Set(['m4a', 'mp3', 'aac']),
  ensurePlayableAudio: vi.fn(async (dir, name) => name.replace(/\.(webm|ogg)$/, '.m4a'))
}))

import { query } from '../../lib/database.js'
import { sendToUser } from '../../lib/websocket.js'
import { sendPushNotifications } from '../../lib/pushNotification.js'
import { ensurePlayableAudio } from '../../lib/audioTranscode.js'
import chat, { MAX_AUDIO_DURATION_SECONDS } from '../../routes/chat.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chat route', () => {
  describe('sendChatMessage', () => {
    it('inserts a text message and notifies the recipient (ws + push)', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
        if (sql.includes('INSERT INTO chat_message')) return { insertId: 500 }
        if (sql.includes('SELECT * FROM chat_message WHERE id=?')) return [{ id: 500, from_user_id: 1, to_user_id: 2, text: 'hi' }]
        return {}
      })
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })

      const result = await chat.sendChatMessage(2, 'hi', null, null, req)

      expect(result.success).toBe(true)
      expect(result.message.id).toBe(500)
      expect(sendToUser).toHaveBeenCalledWith(2, 'NEW_CHAT_MESSAGE', expect.objectContaining({ fromUserId: 1 }))
      expect(sendPushNotifications).toHaveBeenCalledWith(
        [2], 'Alice', 'hi', expect.objectContaining({ type: 'CHAT', deep_link: '#dashboard?chat_user=1' })
      )
    })

    it('rejects an empty message (no text, no image)', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
        return {}
      })
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })

      await expect(chat.sendChatMessage(2, '   ', null, null, req)).rejects.toThrow()
      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('rejects messaging yourself', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })
      await expect(chat.sendChatMessage(1, 'hi', null, null, req)).rejects.toThrow()
    })

    it('rejects an image larger than the 8MB limit', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
        return {}
      })
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })
      // 9MB of raw bytes → base64 data URL, over the 8MB cap.
      const bigBase64 = Buffer.alloc(9 * 1024 * 1024).toString('base64')
      const image = { type: 'image/png', data: `data:image/png;base64,${bigBase64}` }

      await expect(chat.sendChatMessage(2, '', image, null, req)).rejects.toThrow('Image too large')
      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('accepts an image up to the 8MB limit', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
        if (sql.includes('INSERT INTO chat_message')) return { insertId: 501 }
        if (sql.includes('SELECT * FROM chat_message WHERE id=?')) return [{ id: 501, from_user_id: 1, to_user_id: 2, image: 'x.png' }]
        return {}
      })
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })
      // 5MB of raw bytes — previously over the old 2MB cap, now allowed.
      const base64 = Buffer.alloc(5 * 1024 * 1024).toString('base64')
      const image = { type: 'image/png', data: `data:image/png;base64,${base64}` }

      const result = await chat.sendChatMessage(2, '', image, null, req)

      expect(result.success).toBe(true)
      expect(sendToUser).toHaveBeenCalled()
    })
  })

  describe('getChatMessages', () => {
    it('returns the conversation and marks incoming messages read', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id, username, avatar FROM user')) return [{ id: 2, username: 'Bob', avatar: null }]
        if (sql.includes('FROM chat_message') && sql.includes('ORDER BY created_at ASC')) {
          return [{ id: 1, from_user_id: 2, to_user_id: 1, text: 'yo' }]
        }
        return {}
      })
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })

      const result = await chat.getChatMessages(2, req)

      expect(result.partner.id).toBe(2)
      expect(result.messages).toHaveLength(1)
      // Marked their messages read.
      expect(query).toHaveBeenCalledWith(
        'UPDATE chat_message SET read_at=NOW() WHERE to_user_id=? AND from_user_id=? AND read_at IS NULL',
        [1, 2]
      )
    })
  })

  describe('getUnreadChatCount', () => {
    it('returns the unread count and the latest sender', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('COUNT(*)')) return [{ count: 3 }]
        if (sql.includes('ORDER BY created_at DESC LIMIT 1')) return [{ from_user_id: 7 }]
        return {}
      })
      const req = createMockRequest({ user: { id: 1 } })

      const result = await chat.getUnreadChatCount(req)

      expect(result.count).toBe(3)
      expect(result.latestUserId).toBe(7)
    })
  })

  describe('getConversations', () => {
    it('returns an empty list when there are no messages at all', async () => {
      query.mockResolvedValue([])
      const req = createMockRequest({ user: { id: 1 } })

      const result = await chat.getConversations(req)

      expect(result.conversations).toEqual([])
    })

    it('adds the last message preview, its timestamp and the unread count', async () => {
      const lastAt = '2026-08-11T10:00:00Z'
      query.mockImplementation(async (sql) => {
        if (sql.includes('GROUP BY partnerId')) {
          return [
            { partnerId: 2, lastAt, lastMessageId: 90, unread: '2' },
            { partnerId: 3, lastAt: '2026-08-10T09:00:00Z', lastMessageId: 80, unread: '0' }
          ]
        }
        if (sql.includes('SELECT id, username, avatar FROM user')) {
          return [
            { id: 2, username: 'Bob', avatar: 'b.jpg' },
            { id: 3, username: 'Carol', avatar: null }
          ]
        }
        if (sql.includes('SELECT id, from_user_id, text, image, audio, created_at')) {
          return [
            { id: 90, from_user_id: 2, text: 'Hey!', image: null, audio: null, created_at: lastAt },
            { id: 80, from_user_id: 1, text: null, image: null, audio: 'v.webm', created_at: '2026-08-10T09:00:00Z' }
          ]
        }
        return []
      })
      const req = createMockRequest({ user: { id: 1 } })

      const { conversations } = await chat.getConversations(req)

      expect(conversations).toHaveLength(2)
      expect(conversations[0]).toMatchObject({
        userId: 2,
        username: 'Bob',
        unread: 2,
        lastMessageAt: lastAt,
        lastMessage: { text: 'Hey!', hasImage: false, hasAudio: false, fromMe: false }
      })
      // A voice message the current user sent: no text, flagged as audio + own
      expect(conversations[1].lastMessage).toEqual({
        text: null, hasImage: false, hasAudio: true, fromMe: true
      })
      expect(conversations[1].unread).toBe(0)
    })
  })
})

describe('chat voice messages (#541)', () => {
  /**
   * @param {number} bytes
   * @returns {string} a base64 data URL of the requested size
   */
  const audioData = (bytes) => `data:audio/webm;base64,${Buffer.alloc(bytes).toString('base64')}`

  /**
   * @param {object} [over]
   * @returns {object}
   */
  const audio = (over = {}) => ({ data: audioData(64), type: 'audio/webm', duration: 7, ...over })

  beforeEach(() => {
    vi.clearAllMocks()
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
      if (sql.includes('INSERT INTO chat_message')) return { insertId: 500 }
      if (sql.includes('SELECT * FROM chat_message WHERE id=?')) return [{ id: 500 }]
      return {}
    })
  })

  /**
   * @returns {object} the row handed to the INSERT
   */
  const insertedRow = () =>
    query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO chat_message'))[1]

  const req = () => createMockRequest({ user: { id: 1, username: 'Alice' } })

  it('stores a voice message with its duration', async () => {
    const result = await chat.sendChatMessage(2, '', null, audio(), req())

    expect(result.success).toBe(true)
    const row = insertedRow()
    expect(row.audio).toBeTruthy()
    expect(row.audio_duration).toBe(7)
    expect(row.text).toBe(null)
  })

  it('accepts the MP4 container Safari and iOS record', async () => {
    await chat.sendChatMessage(2, '', null, audio({ type: 'audio/mp4' }), req())
    expect(insertedRow().audio).toMatch(/\.m4a$/)
  })

  it('ignores the codec parameters Chrome appends to the type', async () => {
    await chat.sendChatMessage(2, '', null, audio({ type: 'audio/webm;codecs=opus' }), req())
    // Written as .webm, then normalised — what lands in the row is playable.
    expect(ensurePlayableAudio).toHaveBeenCalledWith('uploads/chat', expect.stringMatching(/\.webm$/))
  })

  it('stores the container every platform can play, not the recorded one (#541)', async () => {
    // A WebM recording from Chrome is unplayable on iOS, so the row must not
    // point at the WebM file.
    await chat.sendChatMessage(2, '', null, audio(), req())
    expect(ensurePlayableAudio).toHaveBeenCalledWith('uploads/chat', expect.stringMatching(/\.webm$/))
    expect(insertedRow().audio).toMatch(/\.m4a$/)
  })

  it('rejects a container we do not store', async () => {
    await expect(chat.sendChatMessage(2, '', null, audio({ type: 'audio/wav' }), req()))
      .rejects.toThrow('Unsupported audio type')
  })

  it('rejects a recording over the size cap', async () => {
    await expect(chat.sendChatMessage(2, '', null, audio({ data: audioData(5 * 1024 * 1024) }), req()))
      .rejects.toThrow('Voice message too large')
  })

  it('caps a duration claimed beyond the maximum', async () => {
    await chat.sendChatMessage(2, '', null, audio({ duration: 9999 }), req())
    expect(insertedRow().audio_duration).toBe(MAX_AUDIO_DURATION_SECONDS)
  })

  it('treats a missing or negative duration as zero', async () => {
    await chat.sendChatMessage(2, '', null, audio({ duration: undefined }), req())
    expect(insertedRow().audio_duration).toBe(0)

    vi.clearAllMocks()
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, username FROM user')) return [{ id: 2, username: 'Bob' }]
      if (sql.includes('INSERT INTO chat_message')) return { insertId: 501 }
      return [{ id: 501 }]
    })
    await chat.sendChatMessage(2, '', null, audio({ duration: -5 }), req())
    expect(insertedRow().audio_duration).toBe(0)
  })

  it('still rejects a message with nothing in it at all', async () => {
    await expect(chat.sendChatMessage(2, '', null, null, req()))
      .rejects.toThrow()
  })

  it('sends a voice-message push preview rather than the photo one', async () => {
    await chat.sendChatMessage(2, '', null, audio(), req())
    const [, , preview] = sendPushNotifications.mock.calls[0]
    expect(preview).toBe('chat.voiceMessage')
  })

  it('prefers the typed text over the voice preview when both are present', async () => {
    await chat.sendChatMessage(2, 'listen', null, audio(), req())
    const [, , preview] = sendPushNotifications.mock.calls[0]
    expect(preview).toBe('listen')
  })

  it('returns the audio columns when loading a conversation', async () => {
    const selects = []
    query.mockImplementation(async (sql) => {
      selects.push(String(sql))
      if (String(sql).includes('SELECT id, username, avatar FROM user')) return [{ id: 2, username: 'Bob' }]
      return []
    })
    await chat.getChatMessages(2, createMockRequest({ user: { id: 1 } }))

    expect(selects.some(sql => sql.includes('audio') && sql.includes('audio_duration'))).toBe(true)
  })
})
