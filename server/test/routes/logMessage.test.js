import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../helper/logMessageHelper.js', () => ({
  getLogMessages: vi.fn(),
  getLogMessageCount: vi.fn(),
  deleteLogMessage: vi.fn()
}))

import {
  getLogMessages,
  getLogMessageCount,
  deleteLogMessage
} from '../../helper/logMessageHelper.js'
import handlers from '../../routes/logMessage.js'

describe('logMessage routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getLogMessages', () => {
    it('returns paginated log messages', async () => {
      const messages = [
        testData.logMessage({ id: 1, message: 'Message 1' }),
        testData.logMessage({ id: 2, message: 'Message 2' })
      ]
      getLogMessages.mockResolvedValue(messages)

      const req = createMockRequest()
      const result = await handlers.getLogMessages(0, 10, req)

      expect(result).toEqual(messages)
      expect(getLogMessages).toHaveBeenCalledWith(0, 10, req)
    })

    it('returns empty array when no messages', async () => {
      getLogMessages.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getLogMessages(0, 10, req)

      expect(result).toEqual([])
    })

    it('handles different page sizes', async () => {
      const messages = [testData.logMessage()]
      getLogMessages.mockResolvedValue(messages)

      const req = createMockRequest()
      await handlers.getLogMessages(5, 25, req)

      expect(getLogMessages).toHaveBeenCalledWith(5, 25, req)
    })
  })

  describe('getLogMessageCount', () => {
    it('returns count of log messages', async () => {
      getLogMessageCount.mockResolvedValue(42)

      const req = createMockRequest()
      const result = await handlers.getLogMessageCount(req)

      expect(result).toEqual({ count: 42 })
    })

    it('returns zero count when no messages', async () => {
      getLogMessageCount.mockResolvedValue(0)

      const req = createMockRequest()
      const result = await handlers.getLogMessageCount(req)

      expect(result).toEqual({ count: 0 })
    })
  })

  describe('deleteLogMessage', () => {
    it('deletes log message by id', async () => {
      deleteLogMessage.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.deleteLogMessage(5, req)

      expect(result).toEqual({ success: true })
      expect(deleteLogMessage).toHaveBeenCalledWith(5, req)
    })
  })
})
