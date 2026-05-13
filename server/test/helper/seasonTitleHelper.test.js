import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import {
  recordLeagueChampionsForSeason,
  recordCupWinnerForSeason
} from '../../helper/seasonTitleHelper.js'

describe('seasonTitleHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordLeagueChampionsForSeason', () => {
    it('does nothing when the season is not yet complete', async () => {
      query.mockResolvedValueOnce([{ total: 34, played: 30 }])

      await recordLeagueChampionsForSeason(1)

      expect(query).toHaveBeenCalledTimes(1)
    })

    it('does nothing when no league games exist', async () => {
      query.mockResolvedValueOnce([{ total: 0, played: 0 }])

      await recordLeagueChampionsForSeason(1)

      expect(query).toHaveBeenCalledTimes(1)
    })

    it('inserts a champion row per (level, league) using the standing_cache snapshot', async () => {
      const standingL0 = [{ team: { id: 1, name: 'Top FC', user_id: 42 } }]
      const standingL1 = [{ team: { id: 2, name: 'Second Div', user_id: null } }] // bot

      query
        .mockResolvedValueOnce([{ total: 34, played: 34 }]) // season complete
        .mockResolvedValueOnce([{ level: 0, league: 0 }, { level: 1, league: 0 }]) // level/league combos
        .mockResolvedValueOnce([{ maxDay: 33 }])
        .mockResolvedValueOnce([{ data: JSON.stringify(standingL0) }])
        .mockResolvedValueOnce({}) // INSERT IGNORE champion
        .mockResolvedValueOnce([{ maxDay: 33 }])
        .mockResolvedValueOnce([{ data: JSON.stringify(standingL1) }])
        .mockResolvedValueOnce({}) // INSERT IGNORE champion bot

      await recordLeagueChampionsForSeason(1)

      const inserts = query.mock.calls.filter(c => c[0].includes('INSERT IGNORE INTO season_title'))
      expect(inserts).toHaveLength(2)
      expect(inserts[0][1]).toEqual([1, 0, 0, 1, 42])
      expect(inserts[1][1]).toEqual([1, 1, 0, 2, null]) // bot champion → user_id null
    })
  })

  describe('recordCupWinnerForSeason', () => {
    it('does nothing when no final game is played', async () => {
      query.mockResolvedValueOnce([])

      await recordCupWinnerForSeason(1)

      expect(query).toHaveBeenCalledTimes(1)
    })

    it('inserts cup winner with team1 user_id when team1 wins', async () => {
      query
        .mockResolvedValueOnce([{
          goals_team_1: 3, goals_team_2: 1,
          t1Id: 10, t1UserId: 99,
          t2Id: 11, t2UserId: 88
        }])
        .mockResolvedValueOnce({}) // INSERT IGNORE

      await recordCupWinnerForSeason(1)

      const insertCall = query.mock.calls.find(c => c[0].includes('INSERT IGNORE INTO season_title'))
      expect(insertCall[1]).toEqual([1, -1, -1, 10, 99])
    })

    it('inserts cup winner with team2 user_id when team2 wins', async () => {
      query
        .mockResolvedValueOnce([{
          goals_team_1: 0, goals_team_2: 2,
          t1Id: 10, t1UserId: 99,
          t2Id: 11, t2UserId: 88
        }])
        .mockResolvedValueOnce({})

      await recordCupWinnerForSeason(1)

      const insertCall = query.mock.calls.find(c => c[0].includes('INSERT IGNORE INTO season_title'))
      expect(insertCall[1]).toEqual([1, -1, -1, 11, 88])
    })

    it('records null user_id when winning team was a bot at time of victory', async () => {
      query
        .mockResolvedValueOnce([{
          goals_team_1: 3, goals_team_2: 1,
          t1Id: 10, t1UserId: null, // bot
          t2Id: 11, t2UserId: 88
        }])
        .mockResolvedValueOnce({})

      await recordCupWinnerForSeason(1)

      const insertCall = query.mock.calls.find(c => c[0].includes('INSERT IGNORE INTO season_title'))
      expect(insertCall[1]).toEqual([1, -1, -1, 10, null])
    })
  })
})
