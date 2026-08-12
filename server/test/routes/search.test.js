import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/search.js'

describe('search routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('searchPlayers', () => {
    it('returns empty arrays if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.searchPlayers('test', req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns empty arrays for short queries', async () => {
      const req = createMockRequest()

      const result = await handlers.searchPlayers('ab', req)

      expect(result).toEqual({ players: [], teams: [] })
      expect(query).not.toHaveBeenCalled()
    })

    it('searches players by name', async () => {
      const player = testData.player({ name: 'Test Player', team_id: 1 })
      const team = testData.team({ id: 1 })

      query
        .mockResolvedValueOnce([player])
        .mockResolvedValueOnce([team])

      const req = createMockRequest()
      const result = await handlers.searchPlayers('Test', req)

      expect(result.players).toHaveLength(1)
      expect(result.teams).toHaveLength(1)
      expect(query).toHaveBeenCalledWith(
        'SELECT p.* FROM player p JOIN team t ON t.id = p.team_id WHERE p.name LIKE ? AND t.is_system_team = 0 ORDER BY p.level DESC LIMIT 10',
        ['%Test%']
      )
    })

    it('returns empty teams if no players found', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.searchPlayers('nonexistent', req)

      expect(result).toEqual({ players: [], teams: [] })
    })
  })

  describe('searchTeams', () => {
    it('returns empty array if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.searchTeams('test', req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns empty array for short queries', async () => {
      const req = createMockRequest()

      const result = await handlers.searchTeams('ab', req)

      expect(result).toEqual({ teams: [] })
      expect(query).not.toHaveBeenCalled()
    })

    it('searches teams by name', async () => {
      const team = testData.team({ name: 'Test FC' })

      query.mockResolvedValueOnce([team])

      const req = createMockRequest()
      const result = await handlers.searchTeams('Test', req)

      expect(result.teams).toHaveLength(1)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM team WHERE name LIKE ? AND is_system_team = 0 ORDER BY level DESC LIMIT 10',
        ['%Test%']
      )
    })

    it('returns empty array if no teams found', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.searchTeams('nonexistent', req)

      expect(result).toEqual({ teams: [] })
    })
  })

  describe('searchUsers', () => {
    it('returns empty array if not authenticated', async () => {
      const req = createMockRequest()
      req.user = null

      await expect(handlers.searchUsers('test', req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('returns empty array for short queries', async () => {
      const req = createMockRequest()

      const result = await handlers.searchUsers('ab', req)

      expect(result).toEqual({ users: [] })
      expect(query).not.toHaveBeenCalled()
    })

    it('selects last_login and orders by it DESC', async () => {
      const lastLogin = '2026-05-26 12:00:00'
      query.mockResolvedValueOnce([
        { id: 1, username: 'alice', team_id: 7, team_name: 'FC Alice', last_login: lastLogin }
      ])

      const req = createMockRequest()
      const result = await handlers.searchUsers('alice', req)

      expect(result.users).toHaveLength(1)
      expect(result.users[0].last_login).toBe(lastLogin)
      expect(query).toHaveBeenCalledWith(
        'SELECT u.id, u.username, u.last_login, t.id AS team_id, t.name AS team_name FROM user u LEFT JOIN team t ON t.user_id = u.id WHERE u.username LIKE ? ORDER BY u.last_login DESC LIMIT 10',
        ['%alice%']
      )
    })
  })

  describe('browseAllUsers', () => {
    it('joins user_friend and selects league/is_friend fields', async () => {
      query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          { id: 2, username: 'bob', team_id: 5, team_name: 'FC Bob', team_level: 1, team_league: 0, last_login: null, is_friend: 1 }
        ])

      const req = createMockRequest()
      req.user = { id: 42 }
      const result = await handlers.browseAllUsers('', 0, 20, '', '', req)

      expect(result.users).toHaveLength(1)
      expect(result.users[0].is_friend).toBe(1)
      expect(result.users[0].team_level).toBe(1)

      const dataCall = query.mock.calls[1]
      expect(dataCall[0]).toContain('LEFT JOIN user_friend uf')
      expect(dataCall[0]).toContain('t.level AS team_level')
      expect(dataCall[0]).toContain('t.league AS team_league')
      expect(dataCall[0]).toContain('(uf.user_id IS NOT NULL) AS is_friend')
      expect(dataCall[1][0]).toBe(42)
    })

    it('orders by league level then sub-league when sortColumn=league', async () => {
      query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([])
      const req = createMockRequest()
      req.user = { id: 42 }
      await handlers.browseAllUsers('', 0, 20, 'league', 'ASC', req)
      expect(query.mock.calls[1][0]).toContain('ORDER BY t.level IS NULL, t.level ASC, t.league ASC')
    })

    it('orders by is_friend alias when sortColumn=is_friend', async () => {
      query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([])
      const req = createMockRequest()
      req.user = { id: 42 }
      await handlers.browseAllUsers('', 0, 20, 'is_friend', 'DESC', req)
      expect(query.mock.calls[1][0]).toContain('ORDER BY is_friend DESC, u.username ASC')
    })

    it('selects the registration date so the list can show it (#483)', async () => {
      query
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([
          { id: 2, username: 'bob', created_at: '2026-01-04T09:00:00Z', last_login: null }
        ])
      const req = createMockRequest()
      req.user = { id: 42 }

      const result = await handlers.browseAllUsers('', 0, 20, '', '', req)

      expect(query.mock.calls[1][0]).toContain('u.created_at')
      expect(result.users[0].created_at).toBe('2026-01-04T09:00:00Z')
    })

    it('allows sorting by the registration date (#483)', async () => {
      query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([])
      const req = createMockRequest()
      req.user = { id: 42 }
      await handlers.browseAllUsers('', 0, 20, 'created_at', 'ASC', req)
      expect(query.mock.calls[1][0]).toContain('ORDER BY u.created_at IS NULL, u.created_at ASC')
    })
  })
})
