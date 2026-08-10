import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))
vi.mock('../../helper/actionCardHelper.js', () => ({
  canReceiveActionCard: vi.fn().mockResolvedValue(true)
}))
vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 1, season: 7 })
}))

import { query } from '../../lib/database.js'
import { canReceiveActionCard } from '../../helper/actionCardHelper.js'
import {
  cycleDayForStreak,
  dayDifference,
  getStreakLeaderboard,
  getStreakState,
  LOGIN_STREAK_REWARDS,
  registerDailyLogin,
  toDateKey
} from '../../helper/loginStreakHelper.js'

/**
 * @param {number} offsetDays - negative for days in the past
 * @returns {string}
 */
function dateKey (offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return toDateKey(d)
}

/**
 * Wire `query` so the streak row lookup returns `row` and every write is a
 * no-op. Returns the recorded UPDATE/INSERT calls for assertions.
 * @param {object|null} row
 * @returns {{calls: Array}}
 */
function mockStreakRow (row) {
  const calls = []
  query.mockImplementation(async (sql, params) => {
    calls.push({ sql: String(sql), params })
    if (String(sql).includes('SELECT * FROM user_login_streak')) return row ? [row] : []
    return []
  })
  return { calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  canReceiveActionCard.mockResolvedValue(true)
})

describe('toDateKey / dayDifference', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 7, 3))).toBe('2026-08-03')
  })

  it('counts whole calendar days between two keys', () => {
    expect(dayDifference('2026-08-01', '2026-08-02')).toBe(1)
    expect(dayDifference('2026-08-01', '2026-08-01')).toBe(0)
    expect(dayDifference('2026-07-31', '2026-08-05')).toBe(5)
  })

  it('is unaffected by DST shifts', () => {
    expect(dayDifference('2026-03-28', '2026-03-30')).toBe(2)
    expect(dayDifference('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('cycleDayForStreak', () => {
  it('maps a streak straight onto the cycle for the first 30 days', () => {
    expect(cycleDayForStreak(1)).toBe(1)
    expect(cycleDayForStreak(3)).toBe(3)
    expect(cycleDayForStreak(30)).toBe(30)
  })

  it('restarts the counter after day 30 while the streak keeps running', () => {
    expect(cycleDayForStreak(31)).toBe(1)
    // The ticket's example: 43 days active → 13/30 in the current cycle.
    expect(cycleDayForStreak(43)).toBe(13)
    expect(cycleDayForStreak(60)).toBe(30)
    expect(cycleDayForStreak(61)).toBe(1)
  })

  it('returns 0 for no streak', () => {
    expect(cycleDayForStreak(0)).toBe(0)
  })
})

describe('registerDailyLogin', () => {
  it('starts a streak at 1 for a first-time user', async () => {
    const { calls } = mockStreakRow(null)

    const result = await registerDailyLogin(1, 42)

    expect(result.streak).toBe(1)
    expect(result.cycleDay).toBe(1)
    const insert = calls.find(c => c.sql.includes('INSERT INTO user_login_streak'))
    expect(insert.params.streak).toBe(1)
    expect(insert.params.last_login_date).toBe(toDateKey())
  })

  it('counts at most one point per calendar day', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(0), streak: 5, cycle_day: 5, rewards_claimed: '3'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.streak).toBe(5)
    expect(result.newRewards).toEqual([])
    expect(calls.some(c => c.sql.includes('UPDATE user_login_streak'))).toBe(false)
  })

  it('increments the streak on a consecutive day', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 5, cycle_day: 5, rewards_claimed: '3'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.streak).toBe(6)
    expect(result.cycleDay).toBe(6)
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[1]).toBe(6)
  })

  it('resets streak and reward progress after a missed day', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-2), streak: 12, cycle_day: 12, rewards_claimed: '3,7'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.streak).toBe(1)
    expect(result.cycleDay).toBe(1)
    expect(result.claimed).toEqual([])
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[4]).toBe('')
  })

  it('grants a recovery card on day 3', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.newRewards).toHaveLength(1)
    expect(result.newRewards[0].day).toBe(3)
    expect(result.newRewards[0].key).toBe('recovery')
    expect(['FRESHNESS_5', 'FRESHNESS_10', 'FRESHNESS_20']).toContain(result.newRewards[0].action)
    const insert = calls.find(c => c.sql.includes('INSERT INTO action_card'))
    expect(insert.params.team_id).toBe(42)
    expect(insert.params.state).toBe('pending')
  })

  it('grants a youth card on day 30', async () => {
    mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 29, cycle_day: 29, rewards_claimed: '3,7,15'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.cycleDay).toBe(30)
    expect(result.newRewards[0].key).toBe('youth')
    expect(['NEW_YOUTH_PLAYER_1', 'NEW_YOUTH_PLAYER_2', 'NEW_YOUTH_PLAYER_3'])
      .toContain(result.newRewards[0].action)
  })

  it('wipes the claimed list when the cycle rolls over past day 30', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 30, cycle_day: 30, rewards_claimed: '3,7,15,30'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.streak).toBe(31)
    expect(result.cycleDay).toBe(1)
    expect(result.claimed).toEqual([])
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[4]).toBe('')
  })

  it('never grants the same milestone twice within a cycle', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: '3'
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.cycleDay).toBe(3)
    expect(result.newRewards).toEqual([])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('marks the milestone as claimed even when no card can be granted', async () => {
    canReceiveActionCard.mockResolvedValue(false)
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const result = await registerDailyLogin(1, 42)

    expect(result.newRewards).toEqual([])
    expect(result.claimed).toEqual([3])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('does not grant anything for a user without a team', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const result = await registerDailyLogin(1, null)

    expect(result.newRewards).toEqual([])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('grants a reward at most once when called concurrently', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const [a, b] = await Promise.all([
      registerDailyLogin(1, 42),
      registerDailyLogin(1, 42)
    ])

    expect(a).toBe(b)
    expect(calls.filter(c => c.sql.includes('INSERT INTO action_card'))).toHaveLength(1)
  })

  it('defines exactly the four milestones from the ticket', () => {
    expect(LOGIN_STREAK_REWARDS.map(r => r.day)).toEqual([3, 7, 15, 30])
  })
})

describe('getStreakState', () => {
  it('returns an empty state for a user who never logged in', async () => {
    mockStreakRow(null)
    expect(await getStreakState(1)).toEqual({ streak: 0, cycleDay: 0, claimed: [] })
  })

  it('reports a broken streak as zero', async () => {
    mockStreakRow({ last_login_date: dateKey(-3), streak: 9, cycle_day: 9, rewards_claimed: '3,7' })
    expect(await getStreakState(1)).toEqual({ streak: 0, cycleDay: 0, claimed: [] })
  })

  it('keeps a streak alive when yesterday was the last login', async () => {
    mockStreakRow({ last_login_date: dateKey(-1), streak: 9, cycle_day: 9, rewards_claimed: '3,7' })
    expect(await getStreakState(1)).toEqual({ streak: 9, cycleDay: 9, claimed: [3, 7] })
  })
})

describe('getStreakLeaderboard', () => {
  it('ranks by streak and flags the requesting user', async () => {
    query.mockResolvedValue([
      { user_id: 2, username: 'Ana', streak: 40 },
      { user_id: 1, username: 'Ben', streak: 12 },
      { user_id: 3, username: 'Cee', streak: 5 }
    ])

    const result = await getStreakLeaderboard(1, 2)

    expect(result.top).toHaveLength(2)
    expect(result.top[0]).toMatchObject({ username: 'Ana', rank: 1, isMe: false })
    expect(result.total).toBe(3)
    // Outside the returned slice, so the own rank comes back separately.
    expect(result.me).toEqual({ rank: 2, streak: 12 })
  })

  it('returns a null own-rank for a user with no streak', async () => {
    query.mockResolvedValue([{ user_id: 2, username: 'Ana', streak: 40 }])
    const result = await getStreakLeaderboard(1, 10)
    expect(result.me).toBe(null)
  })
})
