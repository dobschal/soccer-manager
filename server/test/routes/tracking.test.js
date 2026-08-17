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

  describe('trackFunnelEvent', () => {
    it('inserts a funnel event with the explicit client id', async () => {
      query.mockResolvedValue({})
      const req = { user: null, body: {}, headers: {} }

      const result = await tracking.trackFunnelEvent('register-abort', 'email-invalid', 'client-abc', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'INSERT INTO funnel_event (user_id, client_id, event, detail) VALUES (?, ?, ?, ?)',
        [null, 'client-abc', 'register-abort', 'email-invalid']
      )
    })

    it('falls back to the X-Client-Id header when no id is passed', async () => {
      query.mockResolvedValue({})
      const req = { user: null, body: {}, headers: { 'x-client-id': 'header-id' } }

      await tracking.trackFunnelEvent('register-abort', null, undefined, req)

      const [, params] = query.mock.calls[0]
      expect(params[1]).toBe('header-id')
      expect(params[3]).toBeNull()
    })

    it('ignores an empty event and does not insert', async () => {
      const req = { user: null, body: {}, headers: {} }

      const result = await tracking.trackFunnelEvent('', null, 'client-abc', req)

      expect(result).toEqual({ success: false })
      expect(query).not.toHaveBeenCalled()
    })

    it('never propagates a database failure to the caller', async () => {
      query.mockRejectedValue(new Error('db down'))
      const req = { user: null, body: {}, headers: {} }
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(tracking.trackFunnelEvent('register-abort', null, 'c', req))
        .resolves.toEqual({ success: true })

      consoleSpy.mockRestore()
    })
  })

  describe('getPageViewStats', () => {
    it('rejects non-admin users', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })

      await expect(tracking.getPageViewStats(30, req)).rejects.toThrow()
      expect(query).not.toHaveBeenCalled()
    })

    it('builds the funnel from page views and funnel events', async () => {
      // Order matches the Promise.all in the route: pages, events, reg errors, login errors.
      query
        .mockResolvedValueOnce([
          { page: 'login', views: 400, clients: 200, users: 4 },
          { page: 'dashboard', views: 1000, clients: 50, users: 48 },
          { page: 'choose-team', views: 80, clients: 60, users: 60 }
        ])
        .mockResolvedValueOnce([
          { event: 'register-attempt', views: 120, clients: 100 },
          { event: 'register-success', views: 70, clients: 70 }
        ])
        .mockResolvedValueOnce([{ reason: 'username-taken', count: 30, clients: 25 }])
        .mockResolvedValueOnce([])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })

      const result = await tracking.getPageViewStats(30, req)

      expect(result.days).toBe(30)
      expect(result.funnel.map(f => f.key)).toEqual([
        'login', 'register-attempt', 'register-success', 'choose-team', 'dashboard'
      ])
      expect(result.funnel.map(f => f.clients)).toEqual([200, 100, 70, 60, 50])
      expect(result.registrationErrors).toEqual([{ reason: 'username-taken', count: 30, clients: 25 }])
    })

    it('reports drop-off against the preceding step', async () => {
      query
        .mockResolvedValueOnce([{ page: 'login', views: 400, clients: 200, users: 0 }])
        .mockResolvedValueOnce([{ event: 'register-attempt', views: 60, clients: 50 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })

      const { funnel } = await tracking.getPageViewStats(30, req)

      // First step has nothing to lose against.
      expect(funnel[0].dropOff).toBe(0)
      expect(funnel[0].dropOffPercent).toBe(0)
      // 200 visitors saw the landing page, 50 tried to register → 150 lost (75%).
      expect(funnel[1].dropOff).toBe(150)
      expect(funnel[1].dropOffPercent).toBe(75)
    })

    it('reports zero for a funnel step that has no data yet', async () => {
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })

      const { funnel } = await tracking.getPageViewStats(30, req)

      expect(funnel).toHaveLength(5)
      expect(funnel.every(f => f.clients === 0 && f.dropOff === 0)).toBe(true)
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
