import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCached,
  clearCache,
  clearCacheByPrefix,
  clearAllCache,
  cacheKey,
  CACHE_NAMESPACES
} from '../../lib/cache.js'

describe('cache', () => {
  beforeEach(() => {
    clearAllCache()
  })

  describe('getCached', () => {
    it('computes value on cache miss', async () => {
      const computeFn = vi.fn().mockResolvedValue({ data: 'test' })

      const result = await getCached('test-key', computeFn)

      expect(result).toEqual({ data: 'test' })
      expect(computeFn).toHaveBeenCalledTimes(1)
    })

    it('returns cached value on cache hit', async () => {
      const computeFn = vi.fn().mockResolvedValue({ data: 'test' })

      // First call - computes
      await getCached('test-key', computeFn)
      expect(computeFn).toHaveBeenCalledTimes(1)

      // Second call - uses cache
      const result = await getCached('test-key', computeFn)
      expect(result).toEqual({ data: 'test' })
      expect(computeFn).toHaveBeenCalledTimes(1)
    })

    it('deduplicates concurrent requests', async () => {
      const computeFn = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: 'test' }), 50))
      )

      // Fire 5 concurrent requests
      const promises = [
        getCached('test-key', computeFn),
        getCached('test-key', computeFn),
        getCached('test-key', computeFn),
        getCached('test-key', computeFn),
        getCached('test-key', computeFn)
      ]

      const results = await Promise.all(promises)

      // All should return the same value
      results.forEach(result => expect(result).toEqual({ data: 'test' }))
      // But only ONE computation should have been made
      expect(computeFn).toHaveBeenCalledTimes(1)
    })

    it('caches different keys separately', async () => {
      const computeFn1 = vi.fn().mockResolvedValue({ data: 'value1' })
      const computeFn2 = vi.fn().mockResolvedValue({ data: 'value2' })

      const result1 = await getCached('key1', computeFn1)
      const result2 = await getCached('key2', computeFn2)

      expect(result1).toEqual({ data: 'value1' })
      expect(result2).toEqual({ data: 'value2' })
      expect(computeFn1).toHaveBeenCalledTimes(1)
      expect(computeFn2).toHaveBeenCalledTimes(1)
    })

    it('respects custom TTL', async () => {
      vi.useFakeTimers()
      const computeFn = vi.fn()
        .mockResolvedValueOnce({ data: 'old' })
        .mockResolvedValueOnce({ data: 'new' })

      // First call
      await getCached('test-key', computeFn, 100)
      expect(computeFn).toHaveBeenCalledTimes(1)

      // Still cached at 50ms
      vi.advanceTimersByTime(50)
      await getCached('test-key', computeFn, 100)
      expect(computeFn).toHaveBeenCalledTimes(1)

      // Expired at 150ms
      vi.advanceTimersByTime(100)
      const result = await getCached('test-key', computeFn, 100)
      expect(result).toEqual({ data: 'new' })
      expect(computeFn).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('clearCache', () => {
    it('clears specific cache entry', async () => {
      const computeFn = vi.fn()
        .mockResolvedValueOnce({ data: 'old' })
        .mockResolvedValueOnce({ data: 'new' })

      await getCached('test-key', computeFn)
      expect(computeFn).toHaveBeenCalledTimes(1)

      clearCache('test-key')

      const result = await getCached('test-key', computeFn)
      expect(result).toEqual({ data: 'new' })
      expect(computeFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearCacheByPrefix', () => {
    it('clears all entries matching prefix', async () => {
      const computeFn = vi.fn().mockResolvedValue({ data: 'test' })

      await getCached('prefix:key1', computeFn)
      await getCached('prefix:key2', computeFn)
      await getCached('other:key3', computeFn)
      expect(computeFn).toHaveBeenCalledTimes(3)

      clearCacheByPrefix('prefix')

      // prefix keys should recompute
      await getCached('prefix:key1', computeFn)
      await getCached('prefix:key2', computeFn)
      expect(computeFn).toHaveBeenCalledTimes(5)

      // other key should still be cached
      await getCached('other:key3', computeFn)
      expect(computeFn).toHaveBeenCalledTimes(5)
    })
  })

  describe('cacheKey', () => {
    it('generates key from namespace and params', () => {
      const key = cacheKey('myNamespace', 1, 2, 'three')
      expect(key).toBe('myNamespace:1:2:three')
    })

    it('handles empty params', () => {
      const key = cacheKey('myNamespace')
      expect(key).toBe('myNamespace:')
    })
  })

  describe('CACHE_NAMESPACES', () => {
    it('has expected namespaces', () => {
      expect(CACHE_NAMESPACES.SEASON_RESULTS).toBe('seasonResults')
      expect(CACHE_NAMESPACES.GAME).toBe('game')
      expect(CACHE_NAMESPACES.TEAM).toBe('team')
    })
  })
})
