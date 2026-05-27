import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/standingHelper.js', () => ({
  getCachedStanding: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getCachedStanding } from '../../helper/standingHelper.js'
import {
  getTvMoneyBaseForLevel,
  calculateTvMoneyForRank,
  getEstimatedTvMoney,
  payOutTvMoneyForSeason
} from '../../helper/tvMoneyHelper.js'

describe('tvMoneyHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTvMoneyBaseForLevel', () => {
    it('returns 100000 for level 0 (1. Liga)', () => {
      expect(getTvMoneyBaseForLevel(0)).toBe(100000)
    })
    it('halves per level', () => {
      expect(getTvMoneyBaseForLevel(1)).toBe(50000)
      expect(getTvMoneyBaseForLevel(2)).toBe(25000)
      expect(getTvMoneyBaseForLevel(3)).toBe(12500)
    })
    it('returns 0 for invalid levels', () => {
      expect(getTvMoneyBaseForLevel(-1)).toBe(0)
      expect(getTvMoneyBaseForLevel(undefined)).toBe(0)
      expect(getTvMoneyBaseForLevel(null)).toBe(0)
    })
  })

  describe('calculateTvMoneyForRank', () => {
    it('pays last place the base amount', () => {
      expect(calculateTvMoneyForRank(0, 18, 18)).toBe(100000)
    })
    it('pays first place totalTeams * base', () => {
      // Spec: first of league 1 (18 teams) gets 1,800,000 EUR
      expect(calculateTvMoneyForRank(0, 1, 18)).toBe(1800000)
    })
    it('doubles for second-to-last (linear scale)', () => {
      expect(calculateTvMoneyForRank(0, 17, 18)).toBe(200000)
      expect(calculateTvMoneyForRank(0, 16, 18)).toBe(300000)
    })
    it('scales with level', () => {
      // Level 1 (2. Liga): base 50000 → first of 18 teams = 900000
      expect(calculateTvMoneyForRank(1, 1, 18)).toBe(900000)
      // Level 2 (3. Liga): base 25000 → first of 18 teams = 450000
      expect(calculateTvMoneyForRank(2, 1, 18)).toBe(450000)
    })
    it('returns 0 for invalid ranks', () => {
      expect(calculateTvMoneyForRank(0, 0, 18)).toBe(0)
      expect(calculateTvMoneyForRank(0, 19, 18)).toBe(0)
      expect(calculateTvMoneyForRank(0, 1, 0)).toBe(0)
    })
  })

  describe('getEstimatedTvMoney', () => {
    it('estimates value based on current standing', async () => {
      const team = { id: 5, level: 0, league: 0 }
      // games query
      query.mockResolvedValueOnce([
        { team_1_id: 5, team_2_id: 6, goals_team_1: 3, goals_team_2: 0, played: 1, is_forfeit: 0 },
        { team_1_id: 7, team_2_id: 5, goals_team_1: 1, goals_team_2: 4, played: 1, is_forfeit: 0 },
        { team_1_id: 6, team_2_id: 7, goals_team_1: 0, goals_team_2: 0, played: 1, is_forfeit: 0 }
      ])
      // teams query
      query.mockResolvedValueOnce([
        { id: 5 }, { id: 6 }, { id: 7 }
      ])

      const result = await getEstimatedTvMoney(team, 1)
      expect(result.base).toBe(100000)
      expect(result.level).toBe(0)
      expect(result.totalTeams).toBe(3)
      // Team 5 is first (6pts), so totalTeams * base
      expect(result.rank).toBe(1)
      expect(result.estimatedValue).toBe(300000)
    })

    it('returns rank 1 when no games have been played yet', async () => {
      const team = { id: 5, level: 1, league: 0 }
      query.mockResolvedValueOnce([]) // no games played
      query.mockResolvedValueOnce([{ id: 5 }]) // just our team

      const result = await getEstimatedTvMoney(team, 1)
      expect(result.totalTeams).toBe(1)
      expect(result.rank).toBe(1)
      expect(result.estimatedValue).toBe(50000) // base * 1 team (level 1 = 2. Liga)
    })
  })

  describe('payOutTvMoneyForSeason', () => {
    const updateTeamBalance = vi.fn()
    const getUserLocale = vi.fn().mockResolvedValue('en')
    const t = vi.fn((key) => key)

    beforeEach(() => {
      updateTeamBalance.mockReset()
      getUserLocale.mockClear()
      t.mockClear()
    })

    it('does nothing when the season is not complete', async () => {
      query.mockResolvedValueOnce([{ total: 34, played: 30 }])

      await payOutTvMoneyForSeason(34, 1, { updateTeamBalance, getUserLocale, t })

      expect(updateTeamBalance).not.toHaveBeenCalled()
    })

    it('pays each team in the standing with idempotent insert', async () => {
      const standing = [
        { team: { id: 100 } },
        { team: { id: 101 } },
        { team: { id: 102 } }
      ]

      query
        .mockResolvedValueOnce([{ total: 30, played: 30 }]) // season complete
        .mockResolvedValueOnce([{ level: 0, league: 0 }]) // one (level, league)
        .mockResolvedValueOnce([{ maxDay: 33 }]) // last game day for cache
      getCachedStanding.mockResolvedValueOnce(standing)

      // For each team: SELECT * FROM team, INSERT IGNORE
      // Team 100 (rank 1)
      query
        .mockResolvedValueOnce([{ id: 100, user_id: 1, is_system_team: 0 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
      // Team 101 (rank 2)
      query
        .mockResolvedValueOnce([{ id: 101, user_id: 2, is_system_team: 0 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
      // Team 102 (rank 3, system team — skipped)
      query
        .mockResolvedValueOnce([{ id: 102, user_id: null, is_system_team: 1 }])

      await payOutTvMoneyForSeason(34, 1, { updateTeamBalance, getUserLocale, t })

      expect(updateTeamBalance).toHaveBeenCalledTimes(2)
      // Team 100: rank 1 of 3 → 3 * 100000 = 300000
      expect(updateTeamBalance.mock.calls[0][0]).toMatchObject({ id: 100 })
      expect(updateTeamBalance.mock.calls[0][1]).toBe(300000)
      // Team 101: rank 2 of 3 → 2 * 100000 = 200000
      expect(updateTeamBalance.mock.calls[1][0]).toMatchObject({ id: 101 })
      expect(updateTeamBalance.mock.calls[1][1]).toBe(200000)
    })

    it('skips payout when the idempotency insert finds an existing row', async () => {
      const standing = [{ team: { id: 100 } }]
      query
        .mockResolvedValueOnce([{ total: 30, played: 30 }])
        .mockResolvedValueOnce([{ level: 0, league: 0 }])
        .mockResolvedValueOnce([{ maxDay: 33 }])
      getCachedStanding.mockResolvedValueOnce(standing)
      query
        .mockResolvedValueOnce([{ id: 100, user_id: 1, is_system_team: 0 }])
        .mockResolvedValueOnce({ affectedRows: 0 }) // already paid

      await payOutTvMoneyForSeason(34, 1, { updateTeamBalance, getUserLocale, t })

      expect(updateTeamBalance).not.toHaveBeenCalled()
    })
  })
})
