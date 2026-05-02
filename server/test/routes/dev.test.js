import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('../../helper/statisticsHelper.js', () => ({
  collectStatistics: vi.fn(),
  getStatistics: vi.fn()
}))

vi.mock('../../prepare-season.js', () => ({ prepareSeason: vi.fn() }))
vi.mock('../../play-game-day.js', () => ({ calculateGames: vi.fn() }))
vi.mock('../../bot-move.js', () => ({ makeBotMoves: vi.fn() }))
vi.mock('../../helper/playerHelper.js', () => ({ cleanupOldFreePlayers: vi.fn() }))
vi.mock('../../helper/overseaClubHelper.js', () => ({
  cleanupIOCPlayers: vi.fn(),
  fillMarketGaps: vi.fn(),
  iocAutoAcceptBuyOffers: vi.fn(),
  iocBuyUndervaluedPlayers: vi.fn()
}))
vi.mock('../../lib/pushNotification.js', () => ({
  sendTestPushNotification: vi.fn(),
  sendBroadcastNotification: vi.fn()
}))
vi.mock('../../lib/userCache.js', () => ({ clearUserCache: vi.fn() }))

import handlers from '../../routes/dev.js'
import { collectStatistics, getStatistics } from '../../helper/statisticsHelper.js'

describe('dev routes - statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getStatistics', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getStatistics(1, 30, { user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('returns paginated rows for an admin', async () => {
      getStatistics.mockResolvedValueOnce({
        rows: [{ id: 1 }, { id: 2 }],
        total: 12
      })

      const result = await handlers.getStatistics(2, 5, { user: { is_admin: 1 } })

      expect(getStatistics).toHaveBeenCalledWith({ limit: 5, offset: 5 })
      expect(result).toEqual({
        rows: [{ id: 1 }, { id: 2 }],
        total: 12,
        page: 2,
        pageSize: 5
      })
    })

    it('falls back to defaults for invalid input', async () => {
      getStatistics.mockResolvedValueOnce({ rows: [], total: 0 })

      const result = await handlers.getStatistics(undefined, undefined, { user: { is_admin: 1 } })

      expect(getStatistics).toHaveBeenCalledWith({ limit: 30, offset: 0 })
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(30)
    })

    it('clamps overly large pageSize', async () => {
      getStatistics.mockResolvedValueOnce({ rows: [], total: 0 })

      const result = await handlers.getStatistics(1, 9999, { user: { is_admin: 1 } })

      expect(getStatistics).toHaveBeenCalledWith({ limit: 200, offset: 0 })
      expect(result.pageSize).toBe(200)
    })
  })

  describe('collectStatisticsNow', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.collectStatisticsNow({ user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('triggers a snapshot collection', async () => {
      collectStatistics.mockResolvedValueOnce({ id: 5, daily_active_users: 1 })

      const result = await handlers.collectStatisticsNow({ user: { is_admin: 1 } })

      expect(collectStatistics).toHaveBeenCalled()
      expect(result).toEqual({ success: true, row: { id: 5, daily_active_users: 1 } })
    })
  })
})
