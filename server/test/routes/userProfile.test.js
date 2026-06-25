import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../../helper/gameDayHelper.js', () => ({ getGameDayAndSeason: vi.fn() }))
vi.mock('../../helper/userHistoryHelper.js', () => ({ getUserTeamHistory: vi.fn() }))
vi.mock('../../helper/standingHelper.js', () => ({ calculateStandingForTeam: vi.fn() }))
vi.mock('../../helper/cupHelper.js', () => ({ getTotalRounds: vi.fn() }))

import { query } from '../../lib/database.js'
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
      .mockResolvedValueOnce([{ id: 6 }]) // user lookup
      .mockResolvedValueOnce({}) // insert
    const result = await handlers.reportUser(6, '  is cheating  ', req)
    expect(result).toEqual({ success: true })
    expect(query).toHaveBeenLastCalledWith('INSERT INTO user_report SET ?', {
      reporter_user_id: 5,
      reported_user_id: 6,
      reason: 'is cheating'
    })
  })
})
