import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../lib/database.js'
import handlers from './finance.js'

describe('finance routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getFinanceLog', () => {
    it('returns finance log for authenticated user', async () => {
      const team = testData.team()
      const financeLog = [testData.financeLog(), testData.financeLog({ id: 2, value: 1000 })]

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce(financeLog)

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(req)

      expect(result).toEqual({ log: financeLog })
      expect(query).toHaveBeenCalledWith('SELECT * FROM team WHERE user_id=? LIMIT 1', [req.user.id])
      expect(query).toHaveBeenCalledWith('SELECT * FROM finance_log WHERE team_id=?', [team.id])
    })

    it('returns empty log when no entries', async () => {
      const team = testData.team()

      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getFinanceLog(req)

      expect(result).toEqual({ log: [] })
    })
  })
})
