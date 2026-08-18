import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../helper/gameReportHelper.js', () => ({
  generateGameReport: vi.fn(),
  getStoredGameReport: vi.fn()
}))

vi.mock('../../lib/openRouter.js', () => ({
  isLlmConfigured: vi.fn(() => true)
}))

const { generateGameReport, getStoredGameReport } = await import('../../helper/gameReportHelper.js')
const { isLlmConfigured } = await import('../../lib/openRouter.js')
const routes = (await import('../../routes/gameReport.js')).default
const { _resetRateLimit } = await import('../../routes/gameReport.js')

const req = (id = 1, language = 'de') => ({ user: { id, language }, headers: {} })

describe('gameReport routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isLlmConfigured.mockReturnValue(true)
    _resetRateLimit()
  })

  describe('getGameReport', () => {
    it('returns the stored report for the user locale', async () => {
      getStoredGameReport.mockResolvedValueOnce({ text: 'bericht', model: 'm' })

      const result = await routes.getGameReport(7, req())

      expect(getStoredGameReport).toHaveBeenCalledWith(7, 'de')
      expect(result).toEqual({ report: { text: 'bericht', model: 'm' }, available: true })
    })

    it('returns null when nothing is stored yet', async () => {
      getStoredGameReport.mockResolvedValueOnce(null)
      expect(await routes.getGameReport(7, req())).toEqual({ report: null, available: true })
    })

    it('reports the feature as unavailable when no key is configured', async () => {
      isLlmConfigured.mockReturnValue(false)
      getStoredGameReport.mockResolvedValueOnce(null)
      expect((await routes.getGameReport(7, req())).available).toBe(false)
    })

    it('requires a logged-in user', async () => {
      await expect(routes.getGameReport(7, { headers: {} })).rejects.toMatchObject({ status: 400 })
    })

    it('requires a game id', async () => {
      await expect(routes.getGameReport(undefined, req())).rejects.toMatchObject({ status: 400 })
    })
  })

  describe('createGameReport', () => {
    it('generates and returns a new report', async () => {
      getStoredGameReport.mockResolvedValueOnce(null)
      generateGameReport.mockResolvedValueOnce({ text: 'neu', model: 'm', cached: false })

      const result = await routes.createGameReport(7, req())

      expect(generateGameReport).toHaveBeenCalledWith(7, 'de')
      expect(result).toEqual({ report: { text: 'neu', model: 'm' }, cached: false })
    })

    it('serves a cached report without spending a rate limit slot', async () => {
      // 25 calls — more than the hourly cap — must all succeed when cached.
      for (let i = 0; i < 25; i++) {
        getStoredGameReport.mockResolvedValueOnce({ text: 'bericht', model: 'm' })
        const result = await routes.createGameReport(7, req())
        expect(result.cached).toBe(true)
      }
      expect(generateGameReport).not.toHaveBeenCalled()
    })

    it('caps fresh generations per user and per hour', async () => {
      getStoredGameReport.mockResolvedValue(null)
      generateGameReport.mockResolvedValue({ text: 'neu', model: 'm', cached: false })

      for (let i = 1; i <= 20; i++) {
        await expect(routes.createGameReport(i, req(42))).resolves.toBeTruthy()
      }
      await expect(routes.createGameReport(999, req(42))).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Too many')
      })
    })

    it('budgets each user separately', async () => {
      getStoredGameReport.mockResolvedValue(null)
      generateGameReport.mockResolvedValue({ text: 'neu', model: 'm', cached: false })

      for (let i = 1; i <= 20; i++) await routes.createGameReport(i, req(1))
      // A different user still has their full budget.
      await expect(routes.createGameReport(1, req(2))).resolves.toBeTruthy()
    })

    it('refuses when the feature is not configured', async () => {
      isLlmConfigured.mockReturnValue(false)
      getStoredGameReport.mockResolvedValueOnce(null)

      await expect(routes.createGameReport(7, req())).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('not available')
      })
      expect(generateGameReport).not.toHaveBeenCalled()
    })

    it('surfaces generation failures as a bad request', async () => {
      getStoredGameReport.mockResolvedValueOnce(null)
      generateGameReport.mockRejectedValueOnce(new Error('LLM request timed out'))

      await expect(routes.createGameReport(7, req())).rejects.toMatchObject({
        status: 400,
        message: 'LLM request timed out'
      })
    })

    it('requires a logged-in user', async () => {
      await expect(routes.createGameReport(7, { headers: {} })).rejects.toMatchObject({ status: 400 })
    })
  })
})
