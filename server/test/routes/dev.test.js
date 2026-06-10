import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('../../helper/statisticsHelper.js', () => ({
  collectStatistics: vi.fn(),
  getStatistics: vi.fn()
}))

vi.mock('../../helper/fraudHelper.js', () => ({
  getSuspiciousActions: vi.fn()
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
  sendBroadcastNotification: vi.fn()
}))
vi.mock('../../lib/email.js', () => ({
  sendAdminMessageEmail: vi.fn()
}))
vi.mock('../../lib/userCache.js', () => ({ clearUserCache: vi.fn() }))
vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))
vi.mock('../../helper/serverStatsHelper.js', () => ({
  getServerStats: vi.fn()
}))

import handlers from '../../routes/dev.js'
import { collectStatistics, getStatistics } from '../../helper/statisticsHelper.js'
import { getSuspiciousActions } from '../../helper/fraudHelper.js'
import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { sendAdminMessageEmail } from '../../lib/email.js'
import { getServerStats } from '../../helper/serverStatsHelper.js'

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

  describe('getTopCountries', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getTopCountries({ user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('returns rows with numeric counts for an admin', async () => {
      query.mockResolvedValueOnce([
        { country: 'DE', count: '12' },
        { country: 'US', count: 5 }
      ])

      const result = await handlers.getTopCountries({ user: { is_admin: 1 } })

      expect(query).toHaveBeenCalledTimes(1)
      const [sql] = query.mock.calls[0]
      expect(sql).toMatch(/COALESCE\(last_country_web, last_country_ios, last_country_android\)/)
      expect(sql).toMatch(/LIMIT 10/)
      expect(result).toEqual({
        rows: [
          { country: 'DE', count: 12 },
          { country: 'US', count: 5 }
        ]
      })
    })

    it('returns an empty list when no countries are recorded', async () => {
      query.mockResolvedValueOnce([])

      const result = await handlers.getTopCountries({ user: { is_admin: 1 } })

      expect(result).toEqual({ rows: [] })
    })
  })

  describe('giftActionCardToAll', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.giftActionCardToAll('BONUS_100K', { user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('rejects unknown card types', async () => {
      await expect(handlers.giftActionCardToAll('NOT_A_CARD', { user: { is_admin: 1 } }))
        .rejects.toMatchObject({ message: 'Invalid action card type' })
    })

    it('rejects missing card type', async () => {
      await expect(handlers.giftActionCardToAll(undefined, { user: { is_admin: 1 } }))
        .rejects.toMatchObject({ message: 'Invalid action card type' })
    })

    it('inserts a pending card per team with a user', async () => {
      query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
      getGameDayAndSeason.mockResolvedValueOnce({ gameDay: 5, season: 7 })
      query.mockResolvedValueOnce({ affectedRows: 3 })

      const result = await handlers.giftActionCardToAll('BONUS_100K', { user: { is_admin: 1 } })

      expect(query).toHaveBeenNthCalledWith(1, 'SELECT id FROM team WHERE user_id IS NOT NULL')
      expect(query).toHaveBeenNthCalledWith(
        2,
        'INSERT INTO action_card (team_id, action, played, state, season) VALUES ?',
        [[
          [1, 'BONUS_100K', 0, 'pending', 7],
          [2, 'BONUS_100K', 0, 'pending', 7],
          [3, 'BONUS_100K', 0, 'pending', 7]
        ]]
      )
      expect(result).toEqual({ success: true, count: 3 })
    })

    it('does nothing when no teams have a user', async () => {
      query.mockResolvedValueOnce([])

      const result = await handlers.giftActionCardToAll('BONUS_100K', { user: { is_admin: 1 } })

      expect(query).toHaveBeenCalledTimes(1)
      expect(getGameDayAndSeason).not.toHaveBeenCalled()
      expect(result).toEqual({ success: true, count: 0 })
    })
  })

  describe('sendUserEmail', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.sendUserEmail('foo', 'msg', { user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('requires a username', async () => {
      await expect(handlers.sendUserEmail('   ', 'msg', { user: { is_admin: 1, username: 'a' } }))
        .rejects.toMatchObject({ message: 'Username is required' })
    })

    it('requires a message body', async () => {
      await expect(handlers.sendUserEmail('foo', '   ', { user: { is_admin: 1, username: 'a' } }))
        .rejects.toMatchObject({ message: 'Message text is required' })
    })

    it('throws when the user does not exist', async () => {
      query.mockResolvedValueOnce([])

      await expect(handlers.sendUserEmail('ghost', 'hi', { user: { is_admin: 1, username: 'a' } }))
        .rejects.toMatchObject({ message: 'User "ghost" not found' })
      expect(sendAdminMessageEmail).not.toHaveBeenCalled()
    })

    it('throws when the user has no email address', async () => {
      query.mockResolvedValueOnce([{ id: 1, username: 'foo', email: null, pending_email: null, language: 'en' }])

      await expect(handlers.sendUserEmail('foo', 'hi', { user: { is_admin: 1, username: 'a' } }))
        .rejects.toMatchObject({ message: 'User "foo" has no email address' })
      expect(sendAdminMessageEmail).not.toHaveBeenCalled()
    })

    it('uses pending_email when email is not yet verified', async () => {
      query.mockResolvedValueOnce([{ id: 1, username: 'foo', email: null, pending_email: 'foo@example.com', language: 'de' }])
      sendAdminMessageEmail.mockResolvedValueOnce({ sent: true })

      const result = await handlers.sendUserEmail('foo', 'hello there', { user: { is_admin: 1, username: 'admin' } })

      expect(sendAdminMessageEmail).toHaveBeenCalledWith({
        toEmail: 'foo@example.com',
        locale: 'de',
        username: 'foo',
        bodyText: 'hello there'
      })
      expect(result).toEqual({ success: true, sent: true })
    })

    it('prefers verified email over pending_email and trims input', async () => {
      query.mockResolvedValueOnce([{ id: 1, username: 'foo', email: 'verified@example.com', pending_email: 'pending@example.com', language: 'en' }])
      sendAdminMessageEmail.mockResolvedValueOnce({ sent: false })

      const result = await handlers.sendUserEmail('  foo  ', '  hi  ', { user: { is_admin: 1, username: 'admin' } })

      expect(query).toHaveBeenCalledWith(
        'SELECT id, username, email, pending_email, language FROM user WHERE username = ? LIMIT 1',
        ['foo']
      )
      expect(sendAdminMessageEmail).toHaveBeenCalledWith({
        toEmail: 'verified@example.com',
        locale: 'en',
        username: 'foo',
        bodyText: 'hi'
      })
      expect(result).toEqual({ success: true, sent: false })
    })

    it('falls back to English when user has no language set', async () => {
      query.mockResolvedValueOnce([{ id: 1, username: 'foo', email: 'foo@example.com', pending_email: null, language: null }])
      sendAdminMessageEmail.mockResolvedValueOnce({ sent: true })

      await handlers.sendUserEmail('foo', 'hi', { user: { is_admin: 1, username: 'admin' } })

      expect(sendAdminMessageEmail).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
    })
  })

  describe('getSuspiciousActions', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getSuspiciousActions(1, 10, { user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('returns paginated rows for an admin', async () => {
      getSuspiciousActions.mockResolvedValueOnce({
        rows: [{ type: 'shared_ip', time: '2026-06-03T10:00:00.000Z' }],
        total: 17
      })

      const result = await handlers.getSuspiciousActions(2, 5, { user: { is_admin: 1 } })

      expect(getSuspiciousActions).toHaveBeenCalledWith({ limit: 5, offset: 5 })
      expect(result).toEqual({
        rows: [{ type: 'shared_ip', time: '2026-06-03T10:00:00.000Z' }],
        total: 17,
        page: 2,
        pageSize: 5
      })
    })

    it('falls back to default page size of 10', async () => {
      getSuspiciousActions.mockResolvedValueOnce({ rows: [], total: 0 })

      const result = await handlers.getSuspiciousActions(undefined, undefined, { user: { is_admin: 1 } })

      expect(getSuspiciousActions).toHaveBeenCalledWith({ limit: 10, offset: 0 })
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
    })

    it('clamps overly large pageSize to 50', async () => {
      getSuspiciousActions.mockResolvedValueOnce({ rows: [], total: 0 })

      const result = await handlers.getSuspiciousActions(1, 9999, { user: { is_admin: 1 } })

      expect(getSuspiciousActions).toHaveBeenCalledWith({ limit: 50, offset: 0 })
      expect(result.pageSize).toBe(50)
    })
  })

  describe('getServerStats', () => {
    it('rejects non-admin users', async () => {
      await expect(handlers.getServerStats({ user: { is_admin: 0 } }))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
      expect(getServerStats).not.toHaveBeenCalled()
    })

    it('returns the helper payload for an admin', async () => {
      const payload = {
        cpu: [12.5, 8.0],
        memory: { totalGb: 16, usedGb: 4, percent: 25 },
        swap: { totalGb: 2, usedGb: 0.1, percent: 5 },
        disks: [{ filesystem: '/dev/sda1', mount: '/', totalGb: 100, usedGb: 40, percent: 40 }],
        platform: 'linux'
      }
      getServerStats.mockResolvedValueOnce(payload)

      const result = await handlers.getServerStats({ user: { is_admin: 1 } })

      expect(getServerStats).toHaveBeenCalledTimes(1)
      expect(result).toEqual(payload)
    })
  })
})
