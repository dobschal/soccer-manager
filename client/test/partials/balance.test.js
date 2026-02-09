import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getMyBalance: vi.fn()
  }
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: { format: vi.fn((val) => `€${val}`) }
}))

import { Balance, balanceSpan } from '../../partials/balance.js'
import { server } from '../../lib/gateway.js'

describe('Balance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    window.localStorage.getItem = vi.fn(() => 'test-token')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('template', () => {
    it('renders balance with euro format', () => {
      const balance = new Balance()
      balance.balance = 50000

      const html = balance.template
      expect(html).toContain('€50000')
    })

    it('renders zero balance', () => {
      const balance = new Balance()
      balance.balance = 0

      const html = balance.template
      expect(html).toContain('€0')
    })
  })

  describe('load', () => {
    it('fetches balance from server', async () => {
      server.getMyBalance.mockResolvedValue({ balance: 100000 })

      const balance = new Balance()
      await balance.load()

      expect(balance.balance).toBe(100000)
    })

    it('sets balance to 0 on error', async () => {
      server.getMyBalance.mockRejectedValue(new Error('Network error'))

      const balance = new Balance()
      balance.balance = 50000 // Set initial value
      await balance.load()

      expect(balance.balance).toBe(0)
    })
  })

  describe('polling', () => {
    it('starts polling on mount', async () => {
      server.getMyBalance.mockResolvedValue({ balance: 100000 })

      const balance = new Balance()
      balance.load = vi.fn()
      balance.update = vi.fn()
      balance.onMounted()

      expect(balance._pollingInterval).not.toBeNull()
    })

    it('polls every 3 seconds', async () => {
      server.getMyBalance.mockResolvedValue({ balance: 100000 })

      const balance = new Balance()
      balance.load = vi.fn()
      balance.update = vi.fn()
      balance.onMounted()

      // Initially not called
      expect(balance.load).not.toHaveBeenCalled()

      // After 3 seconds
      await vi.advanceTimersByTimeAsync(3000)
      expect(balance.load).toHaveBeenCalledTimes(1)

      // After 6 seconds total
      await vi.advanceTimersByTimeAsync(3000)
      expect(balance.load).toHaveBeenCalledTimes(2)
    })

    it('stops polling when user logs out', async () => {
      server.getMyBalance.mockResolvedValue({ balance: 100000 })
      window.localStorage.getItem = vi.fn(() => null) // No token = logged out

      const balance = new Balance()
      balance.load = vi.fn()
      balance.update = vi.fn()
      balance.onDestroy = vi.fn()
      balance.onMounted()

      await vi.advanceTimersByTimeAsync(3000)

      expect(balance.onDestroy).toHaveBeenCalled()
    })

    it('clears interval on destroy', () => {
      const balance = new Balance()
      balance._pollingInterval = setInterval(() => {}, 1000)

      balance.onDestroy()

      expect(balance._pollingInterval).toBeNull()
    })

    it('does nothing on destroy when no interval', () => {
      const balance = new Balance()
      balance._pollingInterval = null

      // Should not throw
      expect(() => balance.onDestroy()).not.toThrow()
    })
  })

  describe('balanceSpan', () => {
    it('returns Balance instance as string', () => {
      const result = balanceSpan()
      expect(typeof result).toBe('string')
    })
  })
})
