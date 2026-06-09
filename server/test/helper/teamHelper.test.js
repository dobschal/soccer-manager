import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/userCache.js', () => ({
  clearUserCache: vi.fn()
}))

vi.mock('../../lib/email.js', () => ({
  sendInactivityWarningEmail: vi.fn().mockResolvedValue({ sent: true })
}))

import { cleanupInactiveUsers } from '../../helper/teamHelper.js'
import { query } from '../../lib/database.js'
import { clearUserCache } from '../../lib/userCache.js'
import { sendInactivityWarningEmail } from '../../lib/email.js'

/**
 * Configure the query mock to walk through the cleanup flow:
 *  1) SELECT stage-1 warning candidates
 *  2) For each → UPDATE inactivity_warning_stage
 *  3) SELECT stage-2 warning candidates
 *  4) For each → UPDATE inactivity_warning_stage
 *  5) SELECT users past the 21-day cutoff
 *  6) For each → UPDATE team + DELETE user
 */
function setupCleanupQueries ({ stage1 = [], stage2 = [], inactive = [] } = {}) {
  query.mockReset()
  query.mockResolvedValueOnce(stage1)
  for (let i = 0; i < stage1.length; i++) query.mockResolvedValueOnce({})
  query.mockResolvedValueOnce(stage2)
  for (let i = 0; i < stage2.length; i++) query.mockResolvedValueOnce({})
  query.mockResolvedValueOnce(inactive)
  for (let i = 0; i < inactive.length; i++) {
    query.mockResolvedValueOnce({}) // UPDATE team
    query.mockResolvedValueOnce({}) // DELETE user
  }
}

describe('cleanupInactiveUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('removes a user inactive past the cutoff', async () => {
    setupCleanupQueries({ inactive: [{ user_id: 42, team_id: 7 }] })

    await cleanupInactiveUsers()

    const sqls = query.mock.calls.map(c => c[0])
    expect(sqls.some(s => s.includes('UPDATE team SET user_id = NULL'))).toBe(true)
    expect(sqls.some(s => s.includes('DELETE FROM user'))).toBe(true)
    expect(clearUserCache).toHaveBeenCalledWith(42)
  })

  it('removes multiple inactive users in one pass', async () => {
    setupCleanupQueries({
      inactive: [
        { user_id: 1, team_id: 10 },
        { user_id: 2, team_id: 20 }
      ]
    })

    await cleanupInactiveUsers()

    expect(clearUserCache).toHaveBeenCalledWith(1)
    expect(clearUserCache).toHaveBeenCalledWith(2)
  })

  it('does not delete anyone when nothing is due', async () => {
    setupCleanupQueries()

    await cleanupInactiveUsers()

    expect(clearUserCache).not.toHaveBeenCalled()
    expect(sendInactivityWarningEmail).not.toHaveBeenCalled()
  })

  it('selects users past the 21-day cutoff via COALESCE(last_login, created_at)', async () => {
    setupCleanupQueries()

    await cleanupInactiveUsers()

    // The final SELECT is the deletion query.
    const deleteSelect = query.mock.calls[2][0]
    expect(deleteSelect).toContain('COALESCE(u.last_login, u.created_at)')
    expect(deleteSelect).toContain('INTERVAL 21 DAY')
    expect(deleteSelect).toContain('JOIN team t ON t.user_id = u.id')
  })

  it('only dissociates the user — does not delete players, stadium, buildings, etc.', async () => {
    setupCleanupQueries({ inactive: [{ user_id: 5, team_id: 99 }] })

    await cleanupInactiveUsers()

    const allSql = query.mock.calls.map(c => c[0])
    expect(allSql.every(sql => !sql.includes('DELETE FROM player'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM stadium'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM building'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM action_card'))).toBe(true)
    expect(allSql.every(sql => !sql.includes('DELETE FROM sponsor'))).toBe(true)
  })

  it('sends the 7-day-remaining warning to stage-1 candidates and advances their stage', async () => {
    setupCleanupQueries({
      stage1: [
        { user_id: 11, username: 'Alice', email: 'a@example.com', pending_email: null, language: 'de' }
      ]
    })

    await cleanupInactiveUsers()

    expect(sendInactivityWarningEmail).toHaveBeenCalledWith({
      toEmail: 'a@example.com',
      locale: 'de',
      username: 'Alice',
      daysRemaining: 7
    })
    const sqls = query.mock.calls.map(c => c[0])
    expect(sqls.some(s => s.includes('UPDATE user SET inactivity_warning_stage=?'))).toBe(true)
  })

  it('sends the 1-day-remaining warning to stage-2 candidates', async () => {
    setupCleanupQueries({
      stage2: [
        { user_id: 12, username: 'Bob', email: null, pending_email: 'b@example.com', language: 'en' }
      ]
    })

    await cleanupInactiveUsers()

    // Falls back to pending_email when the user never verified their address.
    expect(sendInactivityWarningEmail).toHaveBeenCalledWith({
      toEmail: 'b@example.com',
      locale: 'en',
      username: 'Bob',
      daysRemaining: 1
    })
  })

  it('skips the email but still bumps the stage when the user has no email at all', async () => {
    setupCleanupQueries({
      stage1: [
        { user_id: 13, username: 'NoEmail', email: null, pending_email: null, language: 'en' }
      ]
    })

    await cleanupInactiveUsers()

    expect(sendInactivityWarningEmail).not.toHaveBeenCalled()
    // The stage update still runs so the same user is not picked up again on
    // the next cron tick.
    const sqls = query.mock.calls.map(c => c[0])
    expect(sqls.some(s => s.includes('UPDATE user SET inactivity_warning_stage=?'))).toBe(true)
  })

  it('still deletes on the same run as the final warning if the user has crossed both thresholds', async () => {
    // Mostly a defence-in-depth check: even if the SELECT for warnings and
    // the SELECT for deletes both surface the same user (edge case at the
    // 21-day boundary), the delete must still happen.
    setupCleanupQueries({
      stage2: [
        { user_id: 7, username: 'Final', email: 'f@example.com', pending_email: null, language: 'en' }
      ],
      inactive: [{ user_id: 7, team_id: 70 }]
    })

    await cleanupInactiveUsers()

    expect(sendInactivityWarningEmail).toHaveBeenCalledTimes(1)
    expect(clearUserCache).toHaveBeenCalledWith(7)
  })
})
