import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/clientLog.js'

describe('clientLog routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeReq (overrides = {}) {
    return {
      ip: '127.0.0.1',
      user: null,
      headers: { 'user-agent': 'TestBrowser/1.0' },
      connection: { remoteAddress: '127.0.0.1' },
      ...overrides
    }
  }

  describe('log', () => {
    it('stores a log entry without auth', async () => {
      query.mockResolvedValueOnce({ insertId: 1 })

      const req = makeReq()
      const result = await handlers.log('test message', 'info', 'http://localhost/#dashboard', 'web', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('INSERT INTO client_log SET ?', {
        level: 'info',
        message: 'test message',
        user_id: null,
        user_agent: 'TestBrowser/1.0',
        platform: 'web',
        url: 'http://localhost/#dashboard'
      })
    })

    it('stores user_id when authenticated', async () => {
      query.mockResolvedValueOnce({ insertId: 2 })

      const req = makeReq({ user: { id: 42, username: 'testuser' } })
      const result = await handlers.log('auth error', 'error', '/', 'ios', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('INSERT INTO client_log SET ?', expect.objectContaining({
        user_id: 42,
        level: 'error'
      }))
    })

    it('throws BadRequestError for empty message', async () => {
      const req = makeReq()
      await expect(handlers.log('', 'info', '/', 'web', req))
        .rejects.toMatchObject({ message: 'Message is required' })
    })

    it('throws BadRequestError for non-string message', async () => {
      const req = makeReq()
      await expect(handlers.log(null, 'info', '/', 'web', req))
        .rejects.toMatchObject({ message: 'Message is required' })
    })

    it('defaults invalid level to info', async () => {
      query.mockResolvedValueOnce({ insertId: 3 })

      const req = makeReq()
      await handlers.log('test', 'INVALID', '/', 'web', req)

      expect(query).toHaveBeenCalledWith('INSERT INTO client_log SET ?', expect.objectContaining({
        level: 'info'
      }))
    })

    it('truncates message longer than 4000 chars', async () => {
      query.mockResolvedValueOnce({ insertId: 4 })

      const longMessage = 'x'.repeat(5000)
      const req = makeReq()
      await handlers.log(longMessage, 'warn', '/', 'web', req)

      expect(query).toHaveBeenCalledWith('INSERT INTO client_log SET ?', expect.objectContaining({
        message: 'x'.repeat(4000)
      }))
    })

    it('enforces rate limit after 30 requests per IP', async () => {
      query.mockResolvedValue({ insertId: 1 })

      // Use a unique IP for this test to avoid interference from other tests
      const uniqueIp = '10.99.99.99'
      const req = makeReq({ ip: uniqueIp })

      // Send 30 requests — all should succeed
      for (let i = 0; i < 30; i++) {
        await handlers.log('msg', 'info', '/', 'web', req)
      }

      // 31st should be rate limited
      await expect(handlers.log('msg', 'info', '/', 'web', req))
        .rejects.toMatchObject({ message: 'Rate limit exceeded' })
    })

    it('allows requests from different IPs independently', async () => {
      query.mockResolvedValue({ insertId: 1 })

      const req1 = makeReq({ ip: '192.168.1.1' })
      const req2 = makeReq({ ip: '192.168.1.2' })

      await handlers.log('msg from ip1', 'info', '/', 'web', req1)
      await handlers.log('msg from ip2', 'info', '/', 'web', req2)

      expect(query).toHaveBeenCalledTimes(2)
    })

    it('handles null platform and url gracefully', async () => {
      query.mockResolvedValueOnce({ insertId: 5 })

      const req = makeReq()
      await handlers.log('test', 'info', null, null, req)

      expect(query).toHaveBeenCalledWith('INSERT INTO client_log SET ?', expect.objectContaining({
        platform: null,
        url: null
      }))
    })
  })
})
