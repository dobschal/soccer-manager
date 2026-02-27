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
        'SELECT * FROM player WHERE name LIKE ? AND team_id IS NOT NULL ORDER BY level DESC LIMIT 10',
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
})
