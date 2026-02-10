import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn()
  }
}))

// Mock ws module with a proper class
vi.mock('ws', () => {
  return {
    WebSocketServer: class MockWebSocketServer {
      constructor () {
        this.clients = new Set()
      }

      on () {}
    }
  }
})

import { query } from '../../lib/database.js'
import { sendToUser, sendToTeam, initWebSocket } from '../../lib/websocket.js'

describe('websocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initWebSocket', () => {
    it('initializes without error', () => {
      const mockServer = {}
      expect(() => initWebSocket(mockServer)).not.toThrow()
    })
  })

  describe('sendToUser', () => {
    it('returns false when user is not connected', () => {
      const result = sendToUser(999, 'TEST_EVENT', { data: 'test' })
      expect(result).toBe(false)
    })
  })

  describe('sendToTeam', () => {
    it('returns false when team has no user', async () => {
      query.mockResolvedValue([{ user_id: null }])
      const result = await sendToTeam(1, 'TEST_EVENT', { data: 'test' })
      expect(result).toBe(false)
    })

    it('returns false when team not found', async () => {
      query.mockResolvedValue([])
      const result = await sendToTeam(1, 'TEST_EVENT', { data: 'test' })
      expect(result).toBe(false)
    })

    it('queries team by id', async () => {
      query.mockResolvedValue([{ user_id: 123 }])
      await sendToTeam(5, 'TEST_EVENT')
      expect(query).toHaveBeenCalledWith('SELECT user_id FROM team WHERE id=? LIMIT 1', [5])
    })
  })
})
