import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import tracking from '../../routes/tracking.js'

describe('tracking route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('trackPageView', () => {
    it('inserts a page view with the user id and client id', async () => {
      query.mockResolvedValue({})
      const req = createMockRequest({ user: { id: 42 } })

      const result = await tracking.trackPageView('dashboard', 'client-abc', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO page_view (user_id, client_id, page) VALUES (?, ?, ?)',
        [42, 'client-abc', 'dashboard']
      )
    })

    it('records anonymous views with a null user id', async () => {
      query.mockResolvedValue({})
      const req = { user: null, body: {}, headers: {} }

      await tracking.trackPageView('login', 'client-xyz', req)

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO page_view (user_id, client_id, page) VALUES (?, ?, ?)',
        [null, 'client-xyz', 'login']
      )
    })

    it('ignores an empty page and does not insert', async () => {
      const req = { user: null, body: {}, headers: {} }

      const result = await tracking.trackPageView('', 'client-xyz', req)

      expect(result).toEqual({ success: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('truncates an overly long client id and page', async () => {
      query.mockResolvedValue({})
      const req = { user: null, body: {}, headers: {} }

      await tracking.trackPageView('p'.repeat(300), 'c'.repeat(100), req)

      const [, params] = query.mock.calls[0]
      expect(params[1]).toHaveLength(64)
      expect(params[2]).toHaveLength(255)
    })
  })

  describe('getPageViewStats', () => {
    it('rejects non-admin users', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })

      await expect(tracking.getPageViewStats(30, req)).rejects.toThrow()
      expect(query).not.toHaveBeenCalled()
    })

    it('returns per-page rows and a funnel for admins', async () => {
      query.mockResolvedValue([
        { page: 'dashboard', views: 100, clients: 40, users: 35 },
        { page: 'login', views: 60, clients: 50, users: 0 }
      ])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })

      const result = await tracking.getPageViewStats(30, req)

      expect(result.days).toBe(30)
      expect(result.pages).toHaveLength(2)
      // Funnel keeps the fixed order and pulls client counts from the page rows.
      const login = result.funnel.find(f => f.page === 'login')
      const dashboard = result.funnel.find(f => f.page === 'dashboard')
      expect(login.clients).toBe(50)
      expect(dashboard.clients).toBe(40)
      // A funnel page with no data reports zero rather than being omitted.
      expect(result.funnel.find(f => f.page === 'register').clients).toBe(0)
    })

    it('clamps the look-back window to a sane range', async () => {
      query.mockResolvedValue([])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })

      await tracking.getPageViewStats(9999, req)

      const [, params] = query.mock.calls[0]
      expect(params[0]).toBe(365)
    })
  })
})
