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

import { query } from '../../lib/database.js'
import { sendToUser } from '../../lib/websocket.js'
import { sendPushNotifications } from '../../lib/pushNotification.js'
import chat from '../../routes/chat.js'

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

      const result = await chat.sendChatMessage(2, 'hi', null, req)

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

      await expect(chat.sendChatMessage(2, '   ', null, req)).rejects.toThrow()
      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('rejects messaging yourself', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'Alice' } })
      await expect(chat.sendChatMessage(1, 'hi', null, req)).rejects.toThrow()
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

      await expect(chat.sendChatMessage(2, '', image, req)).rejects.toThrow('Image too large')
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

      const result = await chat.sendChatMessage(2, '', image, req)

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
})
