import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const paramStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')
    return paramStr ? `${key}[${paramStr}]` : key
  }),
  getSupportedLocales: vi.fn(() => ['en', 'de'])
}))

vi.mock('../../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

import { query } from '../../lib/database.js'
import { calculateStanding } from '../../lib/util.js'
import { generateMatchDayRecapsForGameDay, _collectMatchDayStats, getMatchDayRecap } from '../../helper/matchDayRecapHelper.js'

const baseGame = {
  team_1_id: 1,
  team_2_id: 2,
  team1_name: 'Alpha FC',
  team2_name: 'Beta FC',
  goals_team_1: 2,
  goals_team_2: 1,
  details: JSON.stringify({
    sentOffPlayerIds: [],
    injuries: [],
    log: [
      { goal: true, player: 10, teamA: true },
      { goal: true, player: 10, teamA: true },
      { goal: true, player: 20, teamA: false }
    ]
  })
}

describe('matchDayRecapHelper', () => {
  beforeEach(() => {
    query.mockReset()
    calculateStanding.mockReset()
  })

  describe('_collectMatchDayStats', () => {
    it('returns null when no games played', async () => {
      query.mockResolvedValueOnce([])
      const stats = await _collectMatchDayStats(0, 0, 0, 0)
      expect(stats).toBeNull()
    })

    it('aggregates goals, draws, biggest win and top scorer', async () => {
      const games = [
        { ...baseGame, id: 1 },
        {
          id: 2,
          team_1_id: 3,
          team_2_id: 4,
          team1_name: 'Gamma',
          team2_name: 'Delta',
          goals_team_1: 5,
          goals_team_2: 0,
          details: JSON.stringify({
            sentOffPlayerIds: [99],
            injuries: [{ playerId: 7 }, { playerId: 8 }],
            log: [
              { goal: true, player: 30, teamA: true },
              { goal: true, player: 30, teamA: true },
              { goal: true, player: 30, teamA: true }
            ]
          })
        },
        {
          id: 3,
          team_1_id: 5,
          team_2_id: 6,
          team1_name: 'Eps',
          team2_name: 'Zeta',
          goals_team_1: 1,
          goals_team_2: 1,
          details: JSON.stringify({ sentOffPlayerIds: [], injuries: [], log: [] })
        }
      ]
      query.mockResolvedValueOnce(games)
      // Player lookup for the scorers
      query.mockResolvedValueOnce([
        { id: 10, name: 'Player Ten', team_id: 1 },
        { id: 20, name: 'Player Twenty', team_id: 2 },
        { id: 30, name: 'Player Thirty', team_id: 3 }
      ])
      // gameDay=1 would skip upset detection — but we use 2 here, so feed prev games + teams
      query.mockResolvedValueOnce([]) // no prev games → upset short-circuits
      // No further teams query because prevGames is empty

      const stats = await _collectMatchDayStats(2, 0, 0, 0)

      expect(stats.gameCount).toBe(3)
      expect(stats.totalGoals).toBe(2 + 1 + 5 + 0 + 1 + 1)
      expect(stats.draws).toBe(1)
      expect(stats.redCards).toBe(1)
      expect(stats.injuries).toBe(2)
      expect(stats.biggestWin).toMatchObject({
        diff: 5,
        winnerName: 'Gamma',
        loserName: 'Delta',
        goalsFor: 5,
        goalsAgainst: 0
      })
      expect(stats.topScorer).toMatchObject({
        playerId: 30,
        goals: 3,
        name: 'Player Thirty'
      })
      // Featured image: top scorer with >=2 goals takes priority
      expect(stats.imagePlayerId).toBe(30)
      expect(stats.imageTeamId).toBeNull()
    })

    it('falls back to team emblem when top scorer scored only once', async () => {
      const games = [{
        id: 1,
        team_1_id: 1,
        team_2_id: 2,
        team1_name: 'Alpha',
        team2_name: 'Beta',
        goals_team_1: 3,
        goals_team_2: 0,
        details: JSON.stringify({
          sentOffPlayerIds: [],
          injuries: [],
          log: [
            { goal: true, player: 10, teamA: true },
            { goal: true, player: 11, teamA: true },
            { goal: true, player: 12, teamA: true }
          ]
        })
      }]
      query.mockResolvedValueOnce(games)
      query.mockResolvedValueOnce([
        { id: 10, name: 'A', team_id: 1 },
        { id: 11, name: 'B', team_id: 1 },
        { id: 12, name: 'C', team_id: 1 }
      ])

      const stats = await _collectMatchDayStats(0, 0, 0, 0)
      expect(stats.topScorer.goals).toBe(1)
      expect(stats.imagePlayerId).toBeNull()
      expect(stats.imageTeamId).toBe(1)
    })
  })

  describe('generateMatchDayRecapsForGameDay', () => {
    it('inserts one recap per league per supported locale', async () => {
      // 1. SELECT DISTINCT level, league
      query.mockResolvedValueOnce([{ level: 0, league: 0 }])
      // 2. _collectMatchDayStats SELECT games
      query.mockResolvedValueOnce([baseGame])
      // 3. Scorer lookup
      query.mockResolvedValueOnce([
        { id: 10, name: 'Player Ten', team_id: 1 },
        { id: 20, name: 'Player Twenty', team_id: 2 }
      ])
      // gameDay=0 means we skip the upset calculation (needs gameDay>=2)
      // 4 + 5. INSERT recap per locale (en, de)
      query.mockResolvedValueOnce({ insertId: 1 })
      query.mockResolvedValueOnce({ insertId: 2 })

      await generateMatchDayRecapsForGameDay(0, 0)

      // Last two queries should be INSERT into match_day_recap
      const insertCalls = query.mock.calls.filter(c => /INSERT INTO match_day_recap/i.test(c[0]))
      expect(insertCalls).toHaveLength(2)
      const recap = insertCalls[0][1]
      expect(recap.game_day).toBe(0)
      expect(recap.season).toBe(0)
      expect(recap.level).toBe(0)
      expect(recap.league).toBe(0)
      expect(typeof recap.text).toBe('string')
      expect(recap.text.length).toBeGreaterThan(0)
      expect(recap.title).toContain('recap.title')
    })

    it('skips leagues without played games', async () => {
      query.mockResolvedValueOnce([]) // no leagues

      await generateMatchDayRecapsForGameDay(0, 0)

      expect(query).toHaveBeenCalledTimes(1)
    })
  })

  describe('getMatchDayRecap', () => {
    it('returns the stored recap row when one exists', async () => {
      const row = { id: 1, title: 'foo', text: 'bar', image_player_id: null, image_team_id: 42 }
      query.mockResolvedValueOnce([row])
      const recap = await getMatchDayRecap(1, 0, 0, 0, 'en')
      expect(recap).toBe(row)
    })

    it('returns null when no recap exists', async () => {
      query.mockResolvedValueOnce([])
      const recap = await getMatchDayRecap(1, 0, 0, 0, 'en')
      expect(recap).toBeNull()
    })
  })

  describe('upset detection', () => {
    it('reports an upset when a lower-ranked team beats a higher-ranked team', async () => {
      const games = [{
        id: 1,
        team_1_id: 100, // low-rank team wins
        team_2_id: 200,
        team1_name: 'Underdog',
        team2_name: 'Favourite',
        goals_team_1: 2,
        goals_team_2: 0,
        details: JSON.stringify({ sentOffPlayerIds: [], injuries: [], log: [] })
      }]
      // _collectMatchDayStats:
      query.mockResolvedValueOnce(games) // 1. current games
      // 2. prev games for upset detection
      query.mockResolvedValueOnce([
        // simulate prior matches
        { id: 99, team_1_id: 100, team_2_id: 200, goals_team_1: 0, goals_team_2: 0 }
      ])
      // 3. teams for standing
      query.mockResolvedValueOnce([
        { id: 100, name: 'Underdog' },
        { id: 200, name: 'Favourite' }
      ])
      // No goals → no scorer player lookup query
      // Mock the standing: favourite ranked 1, underdog ranked 5 (gap = 4)
      calculateStanding.mockReturnValueOnce([
        { team: { id: 200, name: 'Favourite' }, points: 12, goals: 10, against: 2 },
        { team: { id: 99, name: 'Other' }, points: 9, goals: 5, against: 5 },
        { team: { id: 98, name: 'Other2' }, points: 6, goals: 4, against: 4 },
        { team: { id: 97, name: 'Other3' }, points: 4, goals: 3, against: 5 },
        { team: { id: 100, name: 'Underdog' }, points: 1, goals: 1, against: 6 }
      ])

      const stats = await _collectMatchDayStats(5, 0, 0, 0)
      expect(stats.upset).toMatchObject({
        winnerName: 'Underdog',
        loserName: 'Favourite',
        winnerPlace: 5,
        loserPlace: 1
      })
    })
  })
})
