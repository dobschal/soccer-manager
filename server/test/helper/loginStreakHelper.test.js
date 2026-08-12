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
  claimLoginStreakRewards,
  cycleDayForStreak,
  dayDifference,
  getStreakLeaderboard,
  getStreakState,
  LOGIN_STREAK_REWARDS,
  openRewards,
  pickWeightedAction,
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

    const result = await registerDailyLogin(1)

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

    const result = await registerDailyLogin(1)

    expect(result.streak).toBe(5)
    expect(calls.some(c => c.sql.includes('UPDATE user_login_streak'))).toBe(false)
  })

  it('increments the streak on a consecutive day', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 5, cycle_day: 5, rewards_claimed: '3'
    })

    const result = await registerDailyLogin(1)

    expect(result.streak).toBe(6)
    expect(result.cycleDay).toBe(6)
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[1]).toBe(6)
  })

  it('resets streak and reward progress after a missed day', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-2), streak: 12, cycle_day: 12, rewards_claimed: '3,7'
    })

    const result = await registerDailyLogin(1)

    expect(result.streak).toBe(1)
    expect(result.cycleDay).toBe(1)
    expect(result.claimed).toEqual([])
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[4]).toBe('')
  })

  it('never hands out a card on its own — the user collects it', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const result = await registerDailyLogin(1)

    expect(result.cycleDay).toBe(3)
    expect(result.claimed).toEqual([])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('wipes the claimed list when the cycle rolls over past day 30', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 30, cycle_day: 30, rewards_claimed: '3,7,15,23,30'
    })

    const result = await registerDailyLogin(1)

    expect(result.streak).toBe(31)
    expect(result.cycleDay).toBe(1)
    expect(result.claimed).toEqual([])
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))
    expect(update.params[4]).toBe('')
  })

  it('serialises concurrent calls into a single registration', async () => {
    const { calls } = mockStreakRow({
      user_id: 1, last_login_date: dateKey(-1), streak: 2, cycle_day: 2, rewards_claimed: ''
    })

    const [a, b] = await Promise.all([
      registerDailyLogin(1),
      registerDailyLogin(1)
    ])

    expect(a).toBe(b)
    expect(calls.filter(c => c.sql.includes('UPDATE user_login_streak SET last_login_date'))).toHaveLength(1)
  })

  it('defines exactly the five milestones from the ticket', () => {
    expect(LOGIN_STREAK_REWARDS.map(r => r.day)).toEqual([3, 7, 15, 23, 30])
  })

  it('#501 gives every milestone pool weights that add up to 100', () => {
    for (const reward of LOGIN_STREAK_REWARDS) {
      const total = reward.actions.reduce((sum, a) => sum + a.weight, 0)
      expect(total).toBe(100)
    }
  })

  it('#501 uses the card pools and chances from the ticket', () => {
    const byDay = Object.fromEntries(LOGIN_STREAK_REWARDS.map(r => [r.day, r.actions]))
    expect(byDay[3]).toEqual([
      { action: 'FRESHNESS_5', weight: 50 },
      { action: 'FRESHNESS_10', weight: 30 },
      { action: 'FRESHNESS_20', weight: 20 }
    ])
    expect(byDay[7]).toEqual([
      { action: 'LEVEL_UP_PLAYER_40', weight: 50 },
      { action: 'LEVEL_UP_PLAYER_70', weight: 30 },
      { action: 'LEVEL_UP_PLAYER_100', weight: 20 }
    ])
    expect(byDay[15]).toEqual([
      { action: 'BONUS_100K', weight: 30 },
      { action: 'SPY', weight: 30 },
      { action: 'MOTIVATING_SPEECH', weight: 30 },
      { action: 'STAR_PLAYER', weight: 10 }
    ])
    expect(byDay[23]).toEqual([
      { action: 'LEVEL_UP_PLAYER_40', weight: 30 },
      { action: 'LEVEL_UP_PLAYER_70', weight: 40 },
      { action: 'LEVEL_UP_PLAYER_100', weight: 30 }
    ])
    expect(byDay[30]).toEqual([
      { action: 'MILLION_BONUS', weight: 70 },
      { action: 'STAR_PLAYER', weight: 30 }
    ])
  })

  it('hands out no youth cards at all — youth cards come from other sources', () => {
    const actions = LOGIN_STREAK_REWARDS.flatMap(r => r.actions.map(a => a.action))
    expect(actions.filter(a => a.startsWith('NEW_YOUTH_PLAYER'))).toEqual([])
  })
})

describe('openRewards (#501)', () => {
  it('lists every reached milestone that was not collected yet', () => {
    expect(openRewards(16, [3]).map(r => r.day)).toEqual([7, 15])
  })

  it('ignores milestones still ahead in the cycle', () => {
    expect(openRewards(5, []).map(r => r.day)).toEqual([3])
  })

  it('is empty once everything reached has been collected', () => {
    expect(openRewards(30, [3, 7, 15, 23, 30])).toEqual([])
  })
})

describe('claimLoginStreakRewards (#501)', () => {
  /**
   * Like `mockStreakRow`, but INSERTs report an id so the granted cards can be
   * handed back to the client.
   * @param {object|null} row
   * @returns {{calls: Array}}
   */
  function mockClaimable (row) {
    const calls = []
    let nextId = 100
    query.mockImplementation(async (sql, params) => {
      calls.push({ sql: String(sql), params })
      if (String(sql).includes('SELECT * FROM user_login_streak')) return row ? [row] : []
      if (String(sql).includes('INSERT INTO action_card')) return { insertId: nextId++ }
      return []
    })
    return { calls }
  }

  it('grants the reached milestone as a pending card', async () => {
    const { calls } = mockClaimable({
      user_id: 1, last_login_date: dateKey(0), streak: 3, cycle_day: 3, rewards_claimed: ''
    })

    const result = await claimLoginStreakRewards(1, 42)

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].day).toBe(3)
    expect(result.cards[0].key).toBe('recovery')
    expect(result.cards[0].id).toBe(100)
    expect(['FRESHNESS_5', 'FRESHNESS_10', 'FRESHNESS_20']).toContain(result.cards[0].action)
    const insert = calls.find(c => c.sql.includes('INSERT INTO action_card'))
    expect(insert.params.team_id).toBe(42)
    expect(insert.params.state).toBe('pending')
    const update = calls.find(c => c.sql.includes('UPDATE user_login_streak SET rewards_claimed'))
    expect(update.params[0]).toBe('3')
  })

  it('hands out every milestone the user let pile up', async () => {
    mockClaimable({
      user_id: 1, last_login_date: dateKey(0), streak: 16, cycle_day: 16, rewards_claimed: '3'
    })

    const result = await claimLoginStreakRewards(1, 42)

    expect(result.cards.map(c => c.day)).toEqual([7, 15])
    expect(result.claimed).toEqual([3, 7, 15])
  })

  it('grants nothing twice', async () => {
    const { calls } = mockClaimable({
      user_id: 1, last_login_date: dateKey(0), streak: 5, cycle_day: 5, rewards_claimed: '3'
    })

    const result = await claimLoginStreakRewards(1, 42)

    expect(result.cards).toEqual([])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
    expect(calls.some(c => c.sql.includes('UPDATE user_login_streak'))).toBe(false)
  })

  it('keeps the milestone open when the team is capped on every card of the pool', async () => {
    canReceiveActionCard.mockResolvedValue(false)
    const { calls } = mockClaimable({
      user_id: 1, last_login_date: dateKey(0), streak: 3, cycle_day: 3, rewards_claimed: ''
    })

    const result = await claimLoginStreakRewards(1, 42)

    expect(result.cards).toEqual([])
    expect(result.limitReached).toBe(true)
    // Nothing recorded — the reward can still be collected once a slot frees up.
    expect(result.claimed).toEqual([])
    expect(calls.some(c => c.sql.includes('UPDATE user_login_streak'))).toBe(false)
  })

  it('grants nothing for a broken streak', async () => {
    const { calls } = mockClaimable({
      user_id: 1, last_login_date: dateKey(-3), streak: 9, cycle_day: 9, rewards_claimed: ''
    })

    const result = await claimLoginStreakRewards(1, 42)

    expect(result.cards).toEqual([])
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('grants a milestone at most once when the gift is tapped twice', async () => {
    const { calls } = mockClaimable({
      user_id: 1, last_login_date: dateKey(0), streak: 3, cycle_day: 3, rewards_claimed: ''
    })

    const [a, b] = await Promise.all([
      claimLoginStreakRewards(1, 42),
      claimLoginStreakRewards(1, 42)
    ])

    expect(a).toBe(b)
    expect(calls.filter(c => c.sql.includes('INSERT INTO action_card'))).toHaveLength(1)
  })
})

describe('pickWeightedAction (#501)', () => {
  const POOL = [
    { action: 'A', weight: 70 },
    { action: 'B', weight: 30 }
  ]

  it('returns null for an empty pool', () => {
    expect(pickWeightedAction([])).toBeNull()
    expect(pickWeightedAction(null)).toBeNull()
  })

  it('picks the first entry for a low roll and the last for a high one', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValue(0)
    expect(pickWeightedAction(POOL)).toBe('A')
    // 0.8 * 100 = 80, which lands past A's 70 units.
    random.mockReturnValue(0.8)
    expect(pickWeightedAction(POOL)).toBe('B')
    random.mockRestore()
  })

  it('respects the weights over many draws', () => {
    const counts = { A: 0, B: 0 }
    for (let i = 0; i < 20000; i++) counts[pickWeightedAction(POOL)]++
    const shareOfA = counts.A / 20000
    expect(shareOfA).toBeGreaterThan(0.66)
    expect(shareOfA).toBeLessThan(0.74)
  })

  it('renormalizes when only one option survives the cap check', () => {
    expect(pickWeightedAction([{ action: 'B', weight: 30 }])).toBe('B')
  })

  it('falls back to an even draw when every weight is zero', () => {
    const picked = pickWeightedAction([
      { action: 'A', weight: 0 },
      { action: 'B', weight: 0 }
    ])
    expect(['A', 'B']).toContain(picked)
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
