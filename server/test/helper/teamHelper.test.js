import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

import { cleanupInactiveUsers } from '../../helper/teamHelper.js'
import { query } from '../../lib/database.js'
import { clearUserCache } from '../../lib/userCache.js'

describe('cleanupInactiveUsers', () => {
  it('should remove a user inactive for more than 10 days', async () => {
    query.mockResolvedValueOnce([
      { user_id: 42, team_id: 7 }
    ])
    // UPDATE team, DELETE news_comment, DELETE news_like, DELETE user
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})

    await cleanupInactiveUsers()

    // First call: the SELECT for inactive users
    expect(query).toHaveBeenCalledTimes(5)
    expect(query.mock.calls[1][0]).toContain('UPDATE team SET user_id = NULL')
    expect(query.mock.calls[1][1]).toEqual([7])
    expect(query.mock.calls[2][0]).toContain('DELETE FROM news_comment')
    expect(query.mock.calls[2][1]).toEqual([42])
    expect(query.mock.calls[3][0]).toContain('DELETE FROM news_like')
    expect(query.mock.calls[3][1]).toEqual([42])
    expect(query.mock.calls[4][0]).toContain('DELETE FROM user')
    expect(query.mock.calls[4][1]).toEqual([42])
    expect(clearUserCache).toHaveBeenCalledWith(42)
  })

  it('should remove multiple inactive users', async () => {
    query.mockResolvedValueOnce([
      { user_id: 1, team_id: 10 },
      { user_id: 2, team_id: 20 }
    ])
    // 4 queries per user
    for (let i = 0; i < 8; i++) {
      query.mockResolvedValueOnce({})
    }

    await cleanupInactiveUsers()

    // 1 SELECT + 4 per user = 9
    expect(query).toHaveBeenCalledTimes(9)
    expect(clearUserCache).toHaveBeenCalledWith(1)
    expect(clearUserCache).toHaveBeenCalledWith(2)

    // Verify both teams were set to bot
    expect(query.mock.calls[1][1]).toEqual([10])
    expect(query.mock.calls[5][1]).toEqual([20])
  })

  it('should not delete any users when none are inactive', async () => {
    query.mockResolvedValueOnce([])

    await cleanupInactiveUsers()

    // Only the initial SELECT query
    expect(query).toHaveBeenCalledTimes(1)
    expect(clearUserCache).not.toHaveBeenCalled()
  })

  it('should only select users inactive for more than 10 days via COALESCE(last_login, created_at)', () => {
    query.mockResolvedValueOnce([])

    cleanupInactiveUsers()

    const selectQuery = query.mock.calls[0][0]
    expect(selectQuery).toContain('COALESCE(u.last_login, u.created_at)')
    expect(selectQuery).toContain('INTERVAL 10 DAY')
    // Ensures the query joins user to team — only users with a team are affected
    expect(selectQuery).toContain('JOIN team t ON t.user_id = u.id')
  })

  it('should not touch teams or players — only dissociate the user', async () => {
    query.mockResolvedValueOnce([
      { user_id: 5, team_id: 99 }
    ])
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})
    query.mockResolvedValueOnce({})

    await cleanupInactiveUsers()

    const allSql = query.mock.calls.map(c => c[0])
    // Must NOT delete players, stadium, buildings, etc.
    expect(allSql.every(sql => !sql.includes('DELETE FROM player'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM stadium'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM building'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM action_card'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM sponsor'))).toBe(true)
  })
})
