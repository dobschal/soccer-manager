import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))
vi.mock('../../helper/actionCardHelper.js', () => ({
  canReceiveActionCard: vi.fn().mockResolvedValue(true)
}))
vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 4, season: 7 })
}))
vi.mock('../../helper/logMessageHelper.js', () => ({ addLogMessage: vi.fn() }))
vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))

import { query } from '../../lib/database.js'
import { canReceiveActionCard } from '../../helper/actionCardHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import {
  advanceTours,
  getTour,
  MAX_PLAYERS_ON_TOUR,
  sendPlayersOnTour,
  setTourMode,
  TOUR_MAX_DAYS,
  TOUR_MIN_DAYS,
  TOUR_PROGRESS_TARGET,
  TOURS,
  tourProgressPerGameDay
} from '../../helper/tourHelper.js'

/**
 * Route queries by SQL fragment; anything unmatched resolves to an empty array.
 * @param {Record<string, any>} routes
 * @returns {{calls: Array<{sql: string, params: any}>}}
 */
function mockDb (routes = {}) {
  const calls = []
  query.mockImplementation(async (sql, params) => {
    const text = String(sql)
    calls.push({ sql: text, params })
    for (const [fragment, value] of Object.entries(routes)) {
      if (text.includes(fragment)) return typeof value === 'function' ? value(text, params) : value
    }
    return []
  })
  return { calls }
}

beforeEach(() => {
  vi.clearAllMocks()
  canReceiveActionCard.mockResolvedValue(true)
})

describe('tourProgressPerGameDay (#535)', () => {
  it('scores an average player at exactly 1', () => {
    expect(tourProgressPerGameDay(50, 50)).toBe(1)
  })

  it('scores a better player higher and a worse one lower', () => {
    expect(tourProgressPerGameDay(60, 50)).toBeCloseTo(1.2)
    expect(tourProgressPerGameDay(25, 50)).toBeCloseTo(0.5)
  })

  it('is relative to the squad, so a small club is not disadvantaged', () => {
    // A fourth-division regular in a weak squad scores the same as a
    // first-division regular in a strong one.
    expect(tourProgressPerGameDay(20, 20)).toBe(tourProgressPerGameDay(80, 80))
  })

  it('returns 0 for a squad without a meaningful average', () => {
    expect(tourProgressPerGameDay(50, 0)).toBe(0)
    expect(tourProgressPerGameDay(50, undefined)).toBe(0)
  })
})

describe('getTour (#535)', () => {
  it('returns the stored row', async () => {
    mockDb({ 'SELECT * FROM team_tour': [{ team_id: 7, mode: 'asia', progress: '12.50' }] })
    expect(await getTour(7)).toMatchObject({ mode: 'asia', progress: 12.5 })
  })

  it('creates a default row on first access so the page always renders', async () => {
    const { calls } = mockDb({ 'SELECT * FROM team_tour': [] })
    const tour = await getTour(7)
    expect(tour.progress).toBe(0)
    expect(TOURS.map(t => t.key)).toContain(tour.mode)
    expect(calls.some(c => c.sql.includes('INSERT INTO team_tour'))).toBe(true)
  })
})

describe('setTourMode (#535)', () => {
  it('switches the destination and drops the progress', async () => {
    const { calls } = mockDb({ 'SELECT * FROM team_tour': [{ team_id: 7, mode: 'asia', progress: 20 }] })
    const result = await setTourMode(7, 'europe')
    expect(result).toEqual({ mode: 'europe', progress: 0 })
    const update = calls.find(c => c.sql.includes('UPDATE team_tour SET mode=?'))
    expect(update.params).toEqual(['europe', 7])
  })

  it('rejects an unknown destination', async () => {
    mockDb({})
    await expect(setTourMode(7, 'antarctica')).rejects.toThrow('Unknown tour')
  })
})

describe('sendPlayersOnTour (#535)', () => {
  /**
   * @param {object} over
   * @returns {object} query routes for a healthy two-player dispatch
   */
  const routes = (over = {}) => ({
    'SELECT COUNT(*) AS away': [{ away: 0 }],
    'SELECT id, is_injured, is_suspended, tour_days_left FROM player': [
      { id: 1, is_injured: 0, is_suspended: 0, tour_days_left: 0 },
      { id: 2, is_injured: 0, is_suspended: 0, tour_days_left: 0 }
    ],
    'SELECT * FROM team_tour': [{ team_id: 7, mode: 'asia', progress: 0 }],
    ...over
  })

  it('sends the players and pulls them out of the lineup and bench', async () => {
    const { calls } = mockDb(routes())
    const result = await sendPlayersOnTour(7, [1, 2], 5)
    expect(result).toEqual({ sent: 2 })
    const update = calls.find(c => c.sql.includes('UPDATE player SET tour_days_left=?'))
    expect(update.params[0]).toBe(5)
    // Otherwise the lineup would field somebody who is on a plane.
    expect(update.sql).toContain("in_game_position=''")
    expect(update.sql).toContain('bench_position=NULL')
  })

  it('rejects a duration outside the allowed window', async () => {
    mockDb(routes())
    await expect(sendPlayersOnTour(7, [1], TOUR_MIN_DAYS - 1)).rejects.toThrow(/between/)
    await expect(sendPlayersOnTour(7, [1], TOUR_MAX_DAYS + 1)).rejects.toThrow(/between/)
  })

  it('rejects an empty selection', async () => {
    mockDb(routes())
    await expect(sendPlayersOnTour(7, [], 4)).rejects.toThrow('No players selected')
  })

  it('enforces the simultaneous-player cap, counting those already away', async () => {
    mockDb(routes({ 'SELECT COUNT(*) AS away': [{ away: MAX_PLAYERS_ON_TOUR - 1 }] }))
    await expect(sendPlayersOnTour(7, [1, 2], 4)).rejects.toThrow(/At most/)
  })

  it('refuses an injured or suspended player', async () => {
    mockDb(routes({
      'SELECT id, is_injured, is_suspended, tour_days_left FROM player': [
        { id: 1, is_injured: 1, is_suspended: 0, tour_days_left: 0 }
      ]
    }))
    await expect(sendPlayersOnTour(7, [1], 4)).rejects.toThrow('Player is unavailable')
  })

  it('refuses a player who is already travelling', async () => {
    mockDb(routes({
      'SELECT id, is_injured, is_suspended, tour_days_left FROM player': [
        { id: 1, is_injured: 0, is_suspended: 0, tour_days_left: 2 }
      ]
    }))
    await expect(sendPlayersOnTour(7, [1], 4)).rejects.toThrow('already on tour')
  })

  it('refuses a player from another team', async () => {
    mockDb(routes({ 'SELECT id, is_injured, is_suspended, tour_days_left FROM player': [] }))
    await expect(sendPlayersOnTour(7, [1], 4)).rejects.toThrow('not found in your team')
  })

  it('ignores duplicates in the selection', async () => {
    mockDb(routes({
      'SELECT id, is_injured, is_suspended, tour_days_left FROM player': [
        { id: 1, is_injured: 0, is_suspended: 0, tour_days_left: 0 }
      ]
    }))
    expect(await sendPlayersOnTour(7, [1, 1, 1], 4)).toEqual({ sent: 1 })
  })
})

describe('advanceTours (#535)', () => {
  /**
   * @param {number} progress
   * @param {Array} players
   * @param {string} mode
   * @returns {{calls: Array}}
   */
  function mockTeamOnTour (progress, players, mode = 'asia') {
    return mockDb({
      'FROM team t\n     JOIN team_tour': [{ id: 7, user_id: 3, mode, progress }],
      'SELECT level, tour_days_left FROM player': players
    })
  }

  it('adds the travelling players\' yield to the progress', async () => {
    const { calls } = mockTeamOnTour(0, [
      { level: 50, tour_days_left: 3 },
      { level: 50, tour_days_left: 0 }
    ])
    await advanceTours()
    const update = calls.find(c => c.sql.includes('UPDATE team_tour SET progress=?'))
    // One player at exactly the squad average → 1 point.
    expect(update.params[0]).toBeCloseTo(1)
  })

  it('counts every travelling player down by one match day', async () => {
    const { calls } = mockTeamOnTour(0, [{ level: 50, tour_days_left: 3 }])
    await advanceTours()
    expect(calls.some(c => c.sql.includes('tour_days_left = tour_days_left - 1'))).toBe(true)
  })

  it('pays out and carries the surplus once the bar fills', async () => {
    const { calls } = mockTeamOnTour(TOUR_PROGRESS_TARGET - 0.5, [{ level: 50, tour_days_left: 2 }])
    const result = await advanceTours()

    expect(result.rewarded).toBe(1)
    const update = calls.find(c => c.sql.includes('UPDATE team_tour SET progress=?'))
    // 29.5 + 1 - 30 = 0.5 carried into the next tour rather than dropped.
    expect(update.params[0]).toBeCloseTo(0.5)
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(true)
  })

  it('grants exactly the destination\'s cards', async () => {
    const europe = TOURS.find(t => t.key === 'europe')
    const { calls } = mockTeamOnTour(TOUR_PROGRESS_TARGET, [{ level: 50, tour_days_left: 1 }], 'europe')
    await advanceTours()

    const inserts = calls.filter(c => c.sql.includes('INSERT INTO action_card'))
    expect(inserts).toHaveLength(europe.reward[0].amount)
    expect(inserts[0].params.action).toBe(europe.reward[0].action)
    expect(inserts[0].params.state).toBe('pending')
  })

  it('tells the manager the tour is done', async () => {
    mockTeamOnTour(TOUR_PROGRESS_TARGET, [{ level: 50, tour_days_left: 1 }])
    await advanceTours()
    expect(addLogMessage).toHaveBeenCalledWith(
      'log.tourCompleted', expect.objectContaining({ id: 7 }),
      'OPEN_TOUR', null, 'plane', undefined, 'success'
    )
  })

  it('skips cards the team is already capped on instead of stranding them', async () => {
    canReceiveActionCard.mockResolvedValue(false)
    const { calls } = mockTeamOnTour(TOUR_PROGRESS_TARGET, [{ level: 50, tour_days_left: 1 }])
    await advanceTours()
    expect(calls.some(c => c.sql.includes('INSERT INTO action_card'))).toBe(false)
  })

  it('does nothing for a club with nobody away', async () => {
    const { calls } = mockDb({ 'FROM team t\n     JOIN team_tour': [] })
    const result = await advanceTours()
    expect(result).toEqual({ teams: 0, rewarded: 0 })
    expect(calls.some(c => c.sql.includes('UPDATE team_tour SET progress=?'))).toBe(false)
  })

  it('keeps going when one club fails', async () => {
    let seen = 0
    mockDb({
      'FROM team t\n     JOIN team_tour': [
        { id: 7, user_id: 3, mode: 'asia', progress: 0 },
        { id: 8, user_id: 4, mode: 'asia', progress: 0 }
      ],
      'SELECT level, tour_days_left FROM player': () => {
        seen++
        if (seen === 1) throw new Error('db hiccup')
        return [{ level: 50, tour_days_left: 1 }]
      }
    })
    const result = await advanceTours()
    expect(result.teams).toBe(2)
  })
})
