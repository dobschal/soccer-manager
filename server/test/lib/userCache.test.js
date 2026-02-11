import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getCachedUser, clearUserCache, clearAllUserCache } from '../../lib/userCache.js'

describe('userCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllUserCache()
  })

  describe('getCachedUser', () => {
    it('fetches user from database on cache miss', async () => {
      const user = { id: 1, username: 'testuser', language: 'en' }
      query.mockResolvedValue([user])

      const result = await getCachedUser(1)

      expect(result).toEqual(user)
      expect(query).toHaveBeenCalledWith('SELECT * FROM user WHERE id=? LIMIT 1', [1])
    })

    it('returns cached user on subsequent calls', async () => {
      const user = { id: 1, username: 'testuser', language: 'en' }
      query.mockResolvedValue([user])

      // First call - hits database
      await getCachedUser(1)
      expect(query).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result = await getCachedUser(1)
      expect(result).toEqual(user)
      expect(query).toHaveBeenCalledTimes(1) // Still only 1 call
    })

    it('deduplicates concurrent requests (prevents cache stampede)', async () => {
      const user = { id: 1, username: 'testuser', language: 'en' }
      // Use a delayed mock to simulate database latency
      query.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve([user]), 50)
      }))

      // Fire 5 concurrent requests
      const promises = [
        getCachedUser(1),
        getCachedUser(1),
        getCachedUser(1),
        getCachedUser(1),
        getCachedUser(1)
      ]

      const results = await Promise.all(promises)

      // All should return the same user
      results.forEach(result => expect(result).toEqual(user))
      // But only ONE database query should have been made
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('returns null when user not found', async () => {
      query.mockResolvedValue([])

      const result = await getCachedUser(999)

      expect(result).toBeNull()
    })

    it('caches different users separately', async () => {
      const user1 = { id: 1, username: 'user1' }
      const user2 = { id: 2, username: 'user2' }

      query
        .mockResolvedValueOnce([user1])
        .mockResolvedValueOnce([user2])

      const result1 = await getCachedUser(1)
      const result2 = await getCachedUser(2)

      expect(result1).toEqual(user1)
      expect(result2).toEqual(user2)
      expect(query).toHaveBeenCalledTimes(2)

      // Subsequent calls should use cache
      await getCachedUser(1)
      await getCachedUser(2)
      expect(query).toHaveBeenCalledTimes(2) // No new calls
    })
  })

  describe('clearUserCache', () => {
    it('clears cached user forcing database fetch', async () => {
      const user = { id: 1, username: 'testuser' }
      query.mockResolvedValue([user])

      // First call - caches user
      await getCachedUser(1)
      expect(query).toHaveBeenCalledTimes(1)

      // Clear cache
      clearUserCache(1)

      // Next call should hit database again
      await getCachedUser(1)
      expect(query).toHaveBeenCalledTimes(2)
    })

    it('only clears specified user', async () => {
      const user1 = { id: 1, username: 'user1' }
      const user2 = { id: 2, username: 'user2' }

      query
        .mockResolvedValueOnce([user1])
        .mockResolvedValueOnce([user2])
        .mockResolvedValueOnce([user1])

      await getCachedUser(1)
      await getCachedUser(2)
      expect(query).toHaveBeenCalledTimes(2)

      // Clear only user 1
      clearUserCache(1)

      // User 1 should hit database, user 2 should use cache
      await getCachedUser(1)
      await getCachedUser(2)
      expect(query).toHaveBeenCalledTimes(3) // Only 1 new call for user 1
    })
  })

  describe('clearAllUserCache', () => {
    it('clears all cached users', async () => {
      const user1 = { id: 1, username: 'user1' }
      const user2 = { id: 2, username: 'user2' }

      query
        .mockResolvedValueOnce([user1])
        .mockResolvedValueOnce([user2])
        .mockResolvedValueOnce([user1])
        .mockResolvedValueOnce([user2])

      await getCachedUser(1)
      await getCachedUser(2)
      expect(query).toHaveBeenCalledTimes(2)

      // Clear all
      clearAllUserCache()

      // Both should hit database again
      await getCachedUser(1)
      await getCachedUser(2)
      expect(query).toHaveBeenCalledTimes(4)
    })
  })
})
