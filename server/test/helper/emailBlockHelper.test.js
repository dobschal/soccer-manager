import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

import {
  normalizeEmail,
  isEmailBlocked,
  userHasBlockedEmail,
  blockEmail,
  unblockEmail,
  listBlockedEmails,
  invalidateUserSessions
} from '../../helper/emailBlockHelper.js'
import { query } from '../../lib/database.js'
import { clearUserCache } from '../../lib/userCache.js'

beforeEach(() => {
  vi.clearAllMocks()
  query.mockReset()
  query.mockResolvedValue([])
})

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Foo@Example.COM ')).toBe('foo@example.com')
  })

  it('returns an empty string for non-strings', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
    expect(normalizeEmail(42)).toBe('')
  })
})

describe('isEmailBlocked', () => {
  it('is false for empty addresses without hitting the database', async () => {
    expect(await isEmailBlocked(null)).toBe(false)
    expect(await isEmailBlocked('')).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('looks the address up normalized', async () => {
    query.mockResolvedValue([{ id: 1 }])
    expect(await isEmailBlocked('  Blocked@Example.com ')).toBe(true)
    expect(query.mock.calls[0][1]).toEqual(['blocked@example.com'])
  })

  it('is false when nothing matches', async () => {
    query.mockResolvedValue([])
    expect(await isEmailBlocked('fine@example.com')).toBe(false)
  })
})

describe('userHasBlockedEmail', () => {
  it('is false for users without any address', async () => {
    expect(await userHasBlockedEmail({ email: null, pending_email: null })).toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('is false for a missing user', async () => {
    expect(await userHasBlockedEmail(null)).toBe(false)
  })

  it('checks the verified and the pending address together', async () => {
    query.mockResolvedValue([{ id: 7 }])
    const blocked = await userHasBlockedEmail({ email: 'A@x.de', pending_email: 'B@x.de' })
    expect(blocked).toBe(true)
    expect(query.mock.calls[0][1]).toEqual(['a@x.de', 'b@x.de'])
  })

  it('catches a block that only matches the pending address', async () => {
    query.mockResolvedValue([{ id: 7 }])
    expect(await userHasBlockedEmail({ email: null, pending_email: 'new@x.de' })).toBe(true)
    expect(query.mock.calls[0][1]).toEqual(['new@x.de'])
  })
})

describe('invalidateUserSessions', () => {
  it('bumps the cut-off past the current second and drops the cache', async () => {
    await invalidateUserSessions(5)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('sessions_invalid_before')
    expect(sql).toContain('INTERVAL 1 SECOND')
    expect(params).toEqual([5])
    expect(clearUserCache).toHaveBeenCalledWith(5)
  })

  it('is a no-op without a user id', async () => {
    await invalidateUserSessions(null)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('blockEmail', () => {
  it('stores the normalized address and logs out every account using it', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO blocked_email')) return {}
      if (sql.includes('SELECT id, username FROM user')) {
        return [{ id: 11, username: 'alt1' }, { id: 12, username: 'alt2' }]
      }
      return []
    })

    const result = await blockEmail({ email: ' Cheat@Example.COM ', reason: 'multi', blockedByUserId: 1 })

    expect(result.email).toBe('cheat@example.com')
    expect(result.affectedUsers).toHaveLength(2)
    expect(clearUserCache).toHaveBeenCalledWith(11)
    expect(clearUserCache).toHaveBeenCalledWith(12)
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO blocked_email'))
    expect(insert[1]).toEqual(['cheat@example.com', 'multi', 1])
  })

  it('still revokes sessions when the address was already blocked', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, username FROM user')) return [{ id: 9, username: 'alt' }]
      return {}
    })

    await blockEmail({ email: 'again@example.com' })

    const update = query.mock.calls.find(([sql]) => sql.includes('sessions_invalid_before'))
    expect(update).toBeDefined()
    expect(update[1]).toEqual([9])
  })

  it('records a null reason when none is given', async () => {
    query.mockImplementation(async (sql) => (sql.includes('SELECT id, username FROM user') ? [] : {}))
    await blockEmail({ email: 'x@y.de' })
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO blocked_email'))
    expect(insert[1]).toEqual(['x@y.de', null, null])
  })

  it('rejects an empty address', async () => {
    await expect(blockEmail({ email: '   ' })).rejects.toThrow('Email is required')
  })
})

describe('unblockEmail', () => {
  it('reports whether a row was actually removed', async () => {
    query.mockResolvedValue({ affectedRows: 1 })
    expect(await unblockEmail('Gone@Example.com')).toEqual({ email: 'gone@example.com', removed: true })

    query.mockResolvedValue({ affectedRows: 0 })
    expect(await unblockEmail('never@example.com')).toEqual({ email: 'never@example.com', removed: false })
  })

  it('rejects an empty address', async () => {
    await expect(unblockEmail('')).rejects.toThrow('Email is required')
  })
})

describe('listBlockedEmails', () => {
  it('returns the rows newest first', async () => {
    query.mockResolvedValue([{ id: 2, email: 'b@x.de' }, { id: 1, email: 'a@x.de' }])
    const rows = await listBlockedEmails()
    expect(rows).toHaveLength(2)
    expect(query.mock.calls[0][0]).toContain('ORDER BY be.created_at DESC')
  })
})
