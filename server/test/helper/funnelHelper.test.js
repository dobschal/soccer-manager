import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import { FUNNEL_STEPS, getClientIdFromRequest, recordFunnelEvent } from '../../helper/funnelHelper.js'

describe('funnelHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({})
  })

  describe('FUNNEL_STEPS', () => {
    it('only references routes that actually exist', () => {
      // The landing page is served by the `login` route and registration is a
      // mode of that form — there is no `landing` and no `register` route, so
      // those keys would always report zero (#498).
      const pageKeys = FUNNEL_STEPS.filter(s => s.source === 'page').map(s => s.key)
      expect(pageKeys).toEqual(['login', 'choose-team', 'dashboard'])
      expect(pageKeys).not.toContain('landing')
      expect(pageKeys).not.toContain('register')
    })

    it('covers the registration attempt and its outcome as events', () => {
      const eventKeys = FUNNEL_STEPS.filter(s => s.source === 'event').map(s => s.key)
      expect(eventKeys).toEqual(['register-attempt', 'register-success'])
    })
  })

  describe('getClientIdFromRequest', () => {
    it('reads the X-Client-Id header', () => {
      expect(getClientIdFromRequest({ headers: { 'x-client-id': 'abc' } })).toBe('abc')
    })

    it('returns null when the header is missing or empty', () => {
      expect(getClientIdFromRequest({ headers: {} })).toBeNull()
      expect(getClientIdFromRequest({ headers: { 'x-client-id': '' } })).toBeNull()
      expect(getClientIdFromRequest(undefined)).toBeNull()
    })

    it('truncates an overly long header value to the column width', () => {
      const id = getClientIdFromRequest({ headers: { 'x-client-id': 'c'.repeat(200) } })
      expect(id).toHaveLength(64)
    })
  })

  describe('recordFunnelEvent', () => {
    it('inserts the event with the user id from the request', async () => {
      await recordFunnelEvent('register-attempt', null, {
        user: { id: 7 },
        headers: { 'x-client-id': 'visitor-1' }
      })

      expect(query).toHaveBeenCalledWith(
        'INSERT INTO funnel_event (user_id, client_id, event, detail) VALUES (?, ?, ?, ?)',
        [7, 'visitor-1', 'register-attempt', null]
      )
    })

    it('prefers an explicitly passed user id over req.user', async () => {
      await recordFunnelEvent('register-success', null, { user: null, headers: {} }, { userId: 99 })

      const [, params] = query.mock.calls[0]
      expect(params[0]).toBe(99)
    })

    it('prefers an explicitly passed client id over the header', async () => {
      await recordFunnelEvent('register-abort', 'email-invalid', {
        headers: { 'x-client-id': 'from-header' }
      }, { clientId: 'explicit' })

      const [, params] = query.mock.calls[0]
      expect(params[1]).toBe('explicit')
      expect(params[3]).toBe('email-invalid')
    })

    it('truncates event and detail to the column width', async () => {
      await recordFunnelEvent('e'.repeat(200), 'd'.repeat(200), { headers: {} })

      const [, params] = query.mock.calls[0]
      expect(params[2]).toHaveLength(64)
      expect(params[3]).toHaveLength(64)
    })

    it('ignores an empty event', async () => {
      await recordFunnelEvent('', null, { headers: {} })
      expect(query).not.toHaveBeenCalled()
    })

    describe('when the database fails', () => {
      let consoleSpy

      beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      })

      afterEach(() => {
        consoleSpy.mockRestore()
      })

      it('swallows the error so analytics can never break registration', async () => {
        query.mockRejectedValue(new Error('table missing'))

        await expect(recordFunnelEvent('register-attempt', null, { headers: {} }))
          .resolves.toBeUndefined()
        expect(consoleSpy).toHaveBeenCalled()
      })
    })
  })
})
