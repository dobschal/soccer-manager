import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))

import { query } from '../../lib/database.js'
import handlers from '../../routes/landing.js'

describe('landing routes (#455)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getLandingStats', () => {
    it('returns user counts and a featured user club', async () => {
      query
        .mockResolvedValueOnce([{ total_users: 1234 }])
        .mockResolvedValueOnce([{ new_users: 42 }])
        .mockResolvedValueOnce([{ id: 7, name: 'FC Test', emblem: '{}', color: '#fff', level: 0, league: 0 }])

      const result = await handlers.getLandingStats()

      expect(result.totalUsers).toBe(1234)
      expect(result.newUsers).toBe(42)
      expect(result.team.id).toBe(7)
      // new-users query uses a 21-day window
      expect(query.mock.calls[1][0]).toContain('21 DAY')
    })

    it('falls back to any team when no user club has an emblem', async () => {
      query
        .mockResolvedValueOnce([{ total_users: 5 }])
        .mockResolvedValueOnce([{ new_users: 0 }])
        .mockResolvedValueOnce([]) // no user-owned club with emblem
        .mockResolvedValueOnce([{ id: 9, name: 'Bot FC', emblem: '{}', color: '#000', level: 3, league: 1 }])

      const result = await handlers.getLandingStats()

      expect(result.team.id).toBe(9)
    })

    it('returns a null team when no team has an emblem', async () => {
      query
        .mockResolvedValueOnce([{ total_users: 0 }])
        .mockResolvedValueOnce([{ new_users: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await handlers.getLandingStats()

      expect(result.team).toBeNull()
    })
  })
})
