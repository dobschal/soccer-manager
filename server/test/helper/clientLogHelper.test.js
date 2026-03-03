import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import { cleanupOldClientLogs } from '../../helper/clientLogHelper.js'

describe('clientLogHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('cleanupOldClientLogs', () => {
    it('deletes logs older than 7 days', async () => {
      query.mockResolvedValueOnce({ affectedRows: 5 })

      const result = await cleanupOldClientLogs()

      expect(result).toEqual({ deleted: 5 })
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM client_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
      )
    })

    it('returns deleted 0 when no old logs exist', async () => {
      query.mockResolvedValueOnce({ affectedRows: 0 })

      const result = await cleanupOldClientLogs()

      expect(result).toEqual({ deleted: 0 })
    })
  })
})
