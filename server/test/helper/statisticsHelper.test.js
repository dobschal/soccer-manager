import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { collectStatistics, getStatistics } from '../../helper/statisticsHelper.js'

describe('statisticsHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('collectStatistics', () => {
    it('aggregates user-team data and inserts a row', async () => {
      getGameDayAndSeason.mockResolvedValueOnce({ season: 12, gameDay: 5 })
      // daily active users
      query.mockResolvedValueOnce([{ daily_active_users: 7 }])
      // weekly active users
      query.mockResolvedValueOnce([{ weekly_active_users: 15 }])
      // monthly active users
      query.mockResolvedValueOnce([{ monthly_active_users: 25 }])
      // total user count
      query.mockResolvedValueOnce([{ total_user_count: 100 }])
      // new users (last 24h)
      query.mockResolvedValueOnce([{ new_user_count: 3 }])
      // in-game money
      query.mockResolvedValueOnce([{ in_game_money: '2500000' }])
      // players + averages
      query.mockResolvedValueOnce([{ player_count: 42, avg_player_level: '37.567', avg_player_age: '24.123' }])
      // action cards
      query.mockResolvedValueOnce([{ action_card_count: 9 }])
      // insert
      query.mockResolvedValueOnce({ insertId: 17 })

      const row = await collectStatistics()

      expect(row).toEqual({
        id: 17,
        daily_active_users: 7,
        weekly_active_users: 15,
        monthly_active_users: 25,
        total_user_count: 100,
        new_user_count: 3,
        in_game_money: 2500000,
        player_count: 42,
        avg_player_level: 37.57,
        avg_player_age: 24.12,
        action_card_count: 9
      })

      const insertCall = query.mock.calls[8]
      expect(insertCall[0]).toBe('INSERT INTO statistics SET ?')
      expect(insertCall[1]).toEqual({
        daily_active_users: 7,
        weekly_active_users: 15,
        monthly_active_users: 25,
        total_user_count: 100,
        new_user_count: 3,
        in_game_money: 2500000,
        player_count: 42,
        avg_player_level: 37.57,
        avg_player_age: 24.12,
        action_card_count: 9
      })

      // Player aggregate query must use the current season for age computation
      const playerQuery = query.mock.calls[6]
      expect(playerQuery[1]).toEqual([12])
    })

    it('handles empty database with zero rows', async () => {
      getGameDayAndSeason.mockResolvedValueOnce({ season: 0, gameDay: 0 })
      query.mockResolvedValueOnce([{ daily_active_users: 0 }])
      query.mockResolvedValueOnce([{ weekly_active_users: 0 }])
      query.mockResolvedValueOnce([{ monthly_active_users: 0 }])
      query.mockResolvedValueOnce([{ total_user_count: 0 }])
      query.mockResolvedValueOnce([{ new_user_count: 0 }])
      query.mockResolvedValueOnce([{ in_game_money: 0 }])
      query.mockResolvedValueOnce([{ player_count: 0, avg_player_level: 0, avg_player_age: 0 }])
      query.mockResolvedValueOnce([{ action_card_count: 0 }])
      query.mockResolvedValueOnce({ insertId: 1 })

      const row = await collectStatistics()

      expect(row).toEqual({
        id: 1,
        daily_active_users: 0,
        weekly_active_users: 0,
        monthly_active_users: 0,
        total_user_count: 0,
        new_user_count: 0,
        in_game_money: 0,
        player_count: 0,
        avg_player_level: 0,
        avg_player_age: 0,
        action_card_count: 0
      })
    })
  })

  describe('getStatistics', () => {
    it('returns paginated rows with total count', async () => {
      const fakeRows = [
        { id: 3, daily_active_users: 1 },
        { id: 2, daily_active_users: 2 }
      ]
      query.mockResolvedValueOnce(fakeRows)
      query.mockResolvedValueOnce([{ total: 7 }])

      const result = await getStatistics({ limit: 2, offset: 4 })

      expect(result).toEqual({ rows: fakeRows, total: 7 })
      expect(query.mock.calls[0][1]).toEqual([2, 4])
    })

    it('clamps limit and offset to safe defaults', async () => {
      query.mockResolvedValueOnce([])
      query.mockResolvedValueOnce([{ total: 0 }])

      await getStatistics({ limit: -10, offset: -5 })

      expect(query.mock.calls[0][1]).toEqual([1, 0])
    })

    it('applies default page size when called with no options', async () => {
      query.mockResolvedValueOnce([])
      query.mockResolvedValueOnce([{ total: 0 }])

      await getStatistics()

      expect(query.mock.calls[0][1]).toEqual([30, 0])
    })
  })
})
