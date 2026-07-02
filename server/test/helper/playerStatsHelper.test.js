import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import {
  getTopScorers,
  cachePlayerStatsForGameDay
} from '../../helper/playerStatsHelper.js'

describe('playerStatsHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTopScorers', () => {
    it('returns top scorers with correct data structure', async () => {
      const dbResult = [
        {
          player_id: 1,
          goals: 5,
          name: 'John Striker',
          position: 'CA',
          hair_color: 2,
          skin_color: 1,
          team_id: 10,
          team_name: 'FC Test',
          team_color: '#ff0000',
          team_emblem: '{"shape":"shield"}'
        },
        {
          player_id: 2,
          goals: 3,
          name: 'Jane Forward',
          position: 'LA',
          hair_color: 1,
          skin_color: 0,
          team_id: 11,
          team_name: 'SC Test',
          team_color: '#0000ff',
          team_emblem: '{"shape":"circle"}'
        }
      ]
      query.mockResolvedValue(dbResult)

      const result = await getTopScorers(0, 0, 0, 10)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        name: 'John Striker',
        position: 'CA',
        hair_color: 2,
        skin_color: 1,
        goals: 5,
        team: {
          id: 10,
          name: 'FC Test',
          color: '#ff0000',
          emblem: '{"shape":"shield"}'
        }
      })
      expect(result[1].goals).toBe(3)
    })

    it('returns empty array when no scorers found', async () => {
      query.mockResolvedValue([])

      const result = await getTopScorers(0, 0, 0, 10)

      expect(result).toEqual([])
    })

    it('passes correct parameters to query', async () => {
      query.mockResolvedValue([])

      await getTopScorers(2, 1, 3, 5)

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE pss.season = ? AND pss.level = ? AND pss.league = ?'),
        [2, 1, 3, 5]
      )
    })
  })

  describe('cachePlayerStatsForGameDay', () => {
    it('processes games and extracts goals from log', async () => {
      const games = [{
        id: 1,
        level: 0,
        league: 0,
        team_1_id: 10,
        team_2_id: 11,
        details: JSON.stringify({
          log: [
            { goal: true, player: 101 },
            { goal: true, player: 101 },
            { goal: true, player: 102 },
            { yellowCard: true, player: 103 },
            { redCard: true, player: 104 }
          ],
          playerTeamA: [{ id: 101 }, { id: 103 }],
          playerTeamB: [{ id: 102 }, { id: 104 }]
        })
      }]

      query
        .mockResolvedValueOnce(games) // Get games
        .mockResolvedValue({ affectedRows: 1 }) // Upsert calls

      await cachePlayerStatsForGameDay(1, 0)

      // One query to read games + one batched multi-row upsert (not one per player).
      expect(query).toHaveBeenCalledTimes(2)
      const upsertCall = query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO player_season_stats')
      )
      expect(upsertCall[0]).toContain('VALUES ?')
      // Rows are passed as a single nested array — 4 players with stats.
      expect(upsertCall[1][0]).toHaveLength(4)
    })

    it('handles games with no details gracefully', async () => {
      const games = [{
        id: 1,
        level: 0,
        league: 0,
        team_1_id: 10,
        team_2_id: 11,
        details: null
      }]

      query.mockResolvedValueOnce(games)

      await cachePlayerStatsForGameDay(1, 0)

      // Should only call once for games, no upserts
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('handles invalid JSON details gracefully', async () => {
      const games = [{
        id: 1,
        level: 0,
        league: 0,
        team_1_id: 10,
        team_2_id: 11,
        details: 'invalid json{'
      }]

      query.mockResolvedValueOnce(games)

      await cachePlayerStatsForGameDay(1, 0)

      // Should only call once for games, no upserts due to parse error
      expect(query).toHaveBeenCalledTimes(1)
    })

    it('returns early when no games to process', async () => {
      query.mockResolvedValueOnce([])

      await cachePlayerStatsForGameDay(1, 0)

      expect(query).toHaveBeenCalledTimes(1)
    })

    it('#464 only reads league games (excludes cup/friendly) so leagues are not polluted', async () => {
      query.mockResolvedValueOnce([])

      await cachePlayerStatsForGameDay(1, 0)

      const gamesQuery = query.mock.calls[0][0]
      expect(gamesQuery).toContain("game_type = 'league'")
      expect(gamesQuery).toContain('game_type IS NULL')
    })

    it('tracks yellow and red cards correctly', async () => {
      const games = [{
        id: 1,
        level: 0,
        league: 0,
        team_1_id: 10,
        team_2_id: 11,
        details: JSON.stringify({
          log: [
            { yellowCard: true, player: 101 },
            { yellowCard: true, player: 101 },
            { redCard: true, player: 102 }
          ],
          playerTeamA: [{ id: 101 }],
          playerTeamB: [{ id: 102 }]
        })
      }]

      query
        .mockResolvedValueOnce(games)
        .mockResolvedValue({ affectedRows: 1 })

      await cachePlayerStatsForGameDay(1, 0)

      // Single batched upsert carrying rows for both players.
      const upsertCalls = query.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO player_season_stats')
      )
      expect(upsertCalls.length).toBe(1)
      expect(upsertCalls[0][1][0]).toHaveLength(2)
    })

    it('increments stats correctly with ON DUPLICATE KEY UPDATE', async () => {
      const games = [{
        id: 1,
        level: 0,
        league: 0,
        team_1_id: 10,
        team_2_id: 11,
        details: JSON.stringify({
          log: [{ goal: true, player: 101 }],
          playerTeamA: [{ id: 101 }],
          playerTeamB: []
        })
      }]

      query
        .mockResolvedValueOnce(games)
        .mockResolvedValue({ affectedRows: 1 })

      await cachePlayerStatsForGameDay(1, 0)

      const upsertCall = query.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('ON DUPLICATE KEY UPDATE')
      )
      expect(upsertCall).toBeDefined()
      expect(upsertCall[0]).toContain('goals = goals + VALUES(goals)')
    })
  })
})
