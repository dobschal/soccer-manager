import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../../helper/gameDayHelper.js', () => ({ getGameDayAndSeason: vi.fn() }))
vi.mock('../../helper/userHistoryHelper.js', () => ({ getUserTeamHistory: vi.fn() }))
vi.mock('../../helper/standingHelper.js', () => ({ calculateStandingForTeam: vi.fn() }))
vi.mock('../../helper/cupHelper.js', () => ({ getTotalRounds: vi.fn() }))
vi.mock('../../lib/email.js', () => ({ sendUserReportEmail: vi.fn().mockResolvedValue({ sent: true }) }))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getUserTeamHistory } from '../../helper/userHistoryHelper.js'
import { sendUserReportEmail } from '../../lib/email.js'
import handlers from '../../routes/userProfile.js'

describe('userProfile.reportUser (#421)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated users', async () => {
    await expect(handlers.reportUser(2, 'spam', { user: null }))
      .rejects.toMatchObject({ message: 'Not authorized' })
  })

  it('rejects an invalid user id', async () => {
    await expect(handlers.reportUser(0, 'spam', createMockRequest()))
      .rejects.toMatchObject({ message: 'Invalid user id' })
  })

  it('rejects reporting yourself', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    await expect(handlers.reportUser(5, 'spam', req))
      .rejects.toMatchObject({ message: 'You cannot report yourself' })
  })

  it('rejects an empty reason', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    await expect(handlers.reportUser(6, '  ', req))
      .rejects.toMatchObject({ message: 'Please describe why you are reporting this user' })
  })

  it('rejects when the reported user does not exist', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query.mockResolvedValueOnce([]) // user lookup
    await expect(handlers.reportUser(6, 'is cheating', req))
      .rejects.toMatchObject({ message: 'User not found' })
  })

  it('stores the report for a valid request', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'cheater' }]) // user lookup
      .mockResolvedValueOnce({}) // insert
    const result = await handlers.reportUser(6, '  is cheating  ', req)
    expect(result).toEqual({ success: true })
    expect(query).toHaveBeenLastCalledWith('INSERT INTO user_report SET ?', {
      reporter_user_id: 5,
      reported_user_id: 6,
      reason: 'is cheating'
    })
  })

  it('emails the admins with reporter, reported user and reason (#489)', async () => {
    const req = createMockRequest({ user: { id: 5, username: 'honest-hank' } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'cheater' }])
      .mockResolvedValueOnce({})

    await handlers.reportUser(6, 'is cheating', req)

    expect(sendUserReportEmail).toHaveBeenCalledTimes(1)
    expect(sendUserReportEmail).toHaveBeenCalledWith({
      reportedUsername: 'cheater',
      reportedUserId: 6,
      reporterUsername: 'honest-hank',
      reporterUserId: 5,
      reason: 'is cheating'
    })
  })

  it('still stores the report when the admin email fails', async () => {
    sendUserReportEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const req = createMockRequest({ user: { id: 5, username: 'honest-hank' } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'cheater' }])
      .mockResolvedValueOnce({})

    const result = await handlers.reportUser(6, 'is cheating', req)

    expect(result).toEqual({ success: true })
  })

  it('does not email when the reported user does not exist', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query.mockResolvedValueOnce([])
    await expect(handlers.reportUser(6, 'is cheating', req)).rejects.toThrow()
    expect(sendUserReportEmail).not.toHaveBeenCalled()
  })
})

describe('userProfile.getUserProfile country and language', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getGameDayAndSeason.mockResolvedValue({ season: 3, gameDay: 1 })
    getUserTeamHistory.mockResolvedValue([])
  })

  it('returns the last known login country and the selected language', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'other', avatar: null, last_login: null, created_at: null, language: 'de', country: 'DE' }])
      .mockResolvedValueOnce([]) // team
      .mockResolvedValueOnce([]) // friends
      .mockResolvedValueOnce([]) // isFriend

    const result = await handlers.getUserProfile(6, req)

    expect(result.user.country).toBe('DE')
    expect(result.user.language).toBe('de')
  })

  it('nulls the country when no platform has a geoip result', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'other', avatar: null, last_login: null, created_at: null, language: null, country: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await handlers.getUserProfile(6, req)

    expect(result.user.country).toBeNull()
    expect(result.user.language).toBeNull()
  })

  it('prefers the web country over the app countries', async () => {
    const req = createMockRequest({ user: { id: 5 } })
    query
      .mockResolvedValueOnce([{ id: 6, username: 'other', avatar: null, last_login: null, created_at: null, language: 'en', country: 'AT' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await handlers.getUserProfile(6, req)

    expect(query.mock.calls[0][0]).toContain('COALESCE(last_country_web, last_country_ios, last_country_android)')
  })
})
