import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../test/setup.js'

// Mock the transaction function
vi.mock('../lib/database.js', () => ({
  transaction: vi.fn()
}))

import { transaction } from '../lib/database.js'
import { updateTeamBalance } from './financeHelper.js'

describe('financeHelper', () => {
  let mockQuery
  let queryCalls

  beforeEach(() => {
    vi.clearAllMocks()
    queryCalls = []

    // Mock transaction to capture query calls and simulate behavior
    transaction.mockImplementation(async (callback) => {
      mockQuery = vi.fn().mockImplementation(async (sql, params) => {
        queryCalls.push({ sql, params })

        // Simulate SELECT balance query returning updated balance
        if (sql.includes('SELECT balance FROM team')) {
          // Find the UPDATE call to calculate new balance
          const updateCall = queryCalls.find(c => c.sql.includes('UPDATE team SET balance'))
          if (updateCall) {
            // Return the balance that would result from the atomic update
            return [{ balance: updateCall.params[0] + (updateCall.simulatedOriginal || 0) }]
          }
          return [{ balance: 100000 }]
        }
        return []
      })
      await callback(mockQuery)
    })
  })

  describe('updateTeamBalance', () => {
    it('uses atomic update to prevent race conditions', async () => {
      const team = testData.team({ id: 1, balance: 100000 })

      // Setup mock to return new balance after atomic update
      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql, params) => {
          queryCalls.push({ sql, params })
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 105000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, 5000, 'Sponsor payment', 1, 0)

      // Verify atomic update was used (balance + ? instead of balance = ?)
      expect(queryCalls[0].sql).toBe('UPDATE team SET balance = balance + ? WHERE id = ?')
      expect(queryCalls[0].params).toEqual([5000, 1])
    })

    it('updates local team balance after transaction', async () => {
      const team = testData.team({ id: 1, balance: 100000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 105000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, 5000, 'Sponsor payment', 1, 0)

      expect(team.balance).toBe(105000)
    })

    it('creates finance log entry with correct values', async () => {
      const team = testData.team({ id: 5, balance: 100000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql) => {
          queryCalls.push({ sql })
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 110000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, 10000, 'Ticket earnings', 3, 1)

      // Find the INSERT call
      const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO finance_log'))
      expect(insertCall).toBeDefined()
      expect(insertCall[1]).toMatchObject({
        team_id: 5,
        value: 10000,
        balance: 110000,
        game_day: 3,
        season: 1,
        reason: 'Ticket earnings'
      })
    })

    it('creates finance log with negative values for expenses', async () => {
      const team = testData.team({ id: 2, balance: 50000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 42000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, -8000, 'Player salaries', 5, 0)

      const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO finance_log'))
      expect(insertCall[1]).toMatchObject({
        team_id: 2,
        value: -8000,
        balance: 42000,
        reason: 'Player salaries'
      })
    })

    it('handles zero value transaction', async () => {
      const team = testData.team({ id: 1, balance: 100000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 100000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, 0, 'No change', 1, 0)

      expect(team.balance).toBe(100000)
      const insertCall = mockQuery.mock.calls.find(call => call[0].includes('INSERT INTO finance_log'))
      expect(insertCall[1]).toMatchObject({
        value: 0,
        balance: 100000
      })
    })

    it('allows balance to go negative', async () => {
      const team = testData.team({ id: 1, balance: 5000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql, params) => {
          queryCalls.push({ sql, params })
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: -5000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, -10000, 'Player salaries', 1, 0)

      expect(team.balance).toBe(-5000)
      expect(queryCalls[0].params).toEqual([-10000, 1])
    })

    it('wraps operations in a transaction', async () => {
      const team = testData.team({ balance: 100000 })

      transaction.mockImplementation(async (callback) => {
        mockQuery = vi.fn().mockImplementation(async (sql) => {
          if (sql.includes('SELECT balance FROM team')) {
            return [{ balance: 105000 }]
          }
          return []
        })
        await callback(mockQuery)
      })

      await updateTeamBalance(team, 5000, 'Test', 1, 0)

      // Verify transaction was called
      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transaction).toHaveBeenCalledWith(expect.any(Function))
    })
  })
})
