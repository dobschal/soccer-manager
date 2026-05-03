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

vi.mock('../../lib/websocket.js', () => ({
  onServerEvent: vi.fn(),
  offServerEvent: vi.fn()
}))

import { Balance, balanceSpan } from '../../partials/balance.js'
import { server } from '../../lib/gateway.js'

describe('Balance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
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

  describe('serverEvents', () => {
    it('defines BALANCE_UPDATED event handler', () => {
      const balance = new Balance()

      expect(balance.serverEvents).toHaveProperty('BALANCE_UPDATED')
      expect(typeof balance.serverEvents.BALANCE_UPDATED).toBe('function')
    })

    it('calls update with reloadData=true when BALANCE_UPDATED event is received', () => {
      const balance = new Balance()
      balance.update = vi.fn()

      balance.serverEvents.BALANCE_UPDATED()

      expect(balance.update).toHaveBeenCalledWith(true)
    })

    it('reloads balance on RECONNECTED to recover events missed during disconnect', () => {
      const balance = new Balance()
      balance.update = vi.fn()

      balance.serverEvents.RECONNECTED()

      expect(balance.update).toHaveBeenCalledWith(true)
    })
  })

  describe('balanceSpan', () => {
    it('returns Balance instance as string', () => {
      const result = balanceSpan()
      expect(typeof result).toBe('string')
    })
  })
})
