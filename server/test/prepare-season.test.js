import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database before importing anything else
vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))

// Import after mocking
import { prepareSeason, _buildGame, _nextLevelToFill, _existingLeagueDayMap, _computeTopUpPositions, regenerateTeamData } from '../prepare-season.js'
import { query } from '../lib/database.js'

describe('prepare-season', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('prepareSeason', () => {
    it('is exported and callable', () => {
      expect(typeof prepareSeason).toBe('function')
    })
  })

  describe('_buildGame', () => {
    it('marks game as forfeit when game_day is before forfeitBeforeGameDay', () => {
      const game = _buildGame(2, 3, 0, 100, 200, 5, 10)
      expect(game.is_forfeit).toBe(1)
      expect(game.played).toBe(1)
      expect(game.goals_team_1).toBe(0)
      expect(game.goals_team_2).toBe(0)
      expect(game.season).toBe(2)
      expect(game.level).toBe(3)
      expect(game.league).toBe(0)
      expect(game.team_1_id).toBe(100)
      expect(game.team_2_id).toBe(200)
      expect(game.game_day).toBe(5)
    })

    it('creates a normal unplayed game when game_day is at or after forfeitBeforeGameDay', () => {
      const game = _buildGame(2, 3, 0, 100, 200, 10, 10)
      expect(game.is_forfeit).toBe(0)
      expect(game.played).toBe(0)
      expect(game.goals_team_1).toBeUndefined()
      expect(game.goals_team_2).toBeUndefined()
    })

    it('treats forfeitBeforeGameDay=0 as "no backfill" (start-of-season case)', () => {
      const game = _buildGame(0, 0, 0, 1, 2, 0, 0)
      expect(game.is_forfeit).toBe(0)
      expect(game.played).toBe(0)
    })

    it('stores the user-facing match_day separately from internal game_day', () => {
      // Internal game_day 4 is a cup day; the league match_day is still 3
      const game = _buildGame(0, 0, 0, 1, 2, 5, 0, 3)
      expect(game.game_day).toBe(5)
      expect(game.match_day).toBe(3)
    })

    it('omits match_day when not provided', () => {
      const game = _buildGame(0, 0, 0, 1, 2, 0, 0)
      expect(game.match_day).toBeUndefined()
    })
  })

  describe('_existingLeagueDayMap', () => {
    it('returns a 34-entry map when every league match day has a game_day', async () => {
      // teamsPerLeague=18 → 34 match_days. Pretend match_day i lands on game_day (i+offset).
      const rows = []
      for (let md = 1; md <= 34; md++) {
        rows.push({ match_day: md, game_day: md + (md > 4 ? 1 : 0) }) // cup-day skip after match_day 4
      }
      query.mockResolvedValueOnce(rows)

      const map = await _existingLeagueDayMap(4)

      expect(map).toHaveLength(34)
      expect(map[0]).toBe(1)   // match_day 1 → game_day 1
      expect(map[3]).toBe(4)   // match_day 4 → game_day 4
      expect(map[4]).toBe(6)   // match_day 5 → game_day 6 (cup day inserted)
      expect(map[33]).toBe(35) // match_day 34 → game_day 35
    })

    it('returns null when the season has no league games yet', async () => {
      query.mockResolvedValueOnce([])
      const map = await _existingLeagueDayMap(99)
      expect(map).toBeNull()
    })

    it('returns null when match_day rows are incomplete (mid-creation)', async () => {
      // Only 10 out of 34 match_days present — incomplete; caller falls back to a fresh schedule.
      const rows = []
      for (let md = 1; md <= 10; md++) rows.push({ match_day: md, game_day: md })
      query.mockResolvedValueOnce(rows)

      const map = await _existingLeagueDayMap(4)

      expect(map).toBeNull()
    })
  })

  describe('_nextLevelToFill', () => {
    const minTeams = 126

    it('returns 0 when no teams exist (and minimum requires it)', () => {
      expect(_nextLevelToFill([], minTeams)).toBe(0)
    })

    it('returns the level that is opened but not yet full', () => {
      // 1 team at level 0 — needs 17 more to fill amountTeamsPerLevel[0]=18
      const teams = [{ level: 0 }]
      expect(_nextLevelToFill(teams, minTeams)).toBe(0)
    })

    it('opens the next level when current top level is full but minimum not met', () => {
      const teams = [
        ...Array(18).fill(null).map(() => ({ level: 0 }))
      ]
      // level 0 full (18/18), but minimum=126 not met — open level 1
      expect(_nextLevelToFill(teams, minTeams)).toBe(1)
    })

    it('returns highest opened-but-not-full level even when other levels are full', () => {
      // level 0 full (18), level 1 full (36), level 2 has only 18 of 72 → fill level 2
      const teams = [
        ...Array(18).fill(null).map(() => ({ level: 0 })),
        ...Array(36).fill(null).map(() => ({ level: 1 })),
        ...Array(18).fill(null).map(() => ({ level: 2 }))
      ]
      expect(_nextLevelToFill(teams, minTeams)).toBe(2)
    })

    it('returns -1 when all opened levels are full and minimum is satisfied', () => {
      // level 0 full (18), level 1 full (36), level 2 full (72) = 126 total ≥ minimum
      const teams = [
        ...Array(18).fill(null).map(() => ({ level: 0 })),
        ...Array(36).fill(null).map(() => ({ level: 1 })),
        ...Array(72).fill(null).map(() => ({ level: 2 }))
      ]
      expect(_nextLevelToFill(teams, minTeams)).toBe(-1)
    })

    it('opens a fresh level when registrations push minimum above current capacity', () => {
      // 200 users -> minimum = 400. levels 0..2 = 126 teams full -> open level 3
      const teams = [
        ...Array(18).fill(null).map(() => ({ level: 0 })),
        ...Array(36).fill(null).map(() => ({ level: 1 })),
        ...Array(72).fill(null).map(() => ({ level: 2 }))
      ]
      expect(_nextLevelToFill(teams, 400)).toBe(3)
    })

    it('keeps filling a partially-opened higher level rather than opening a new one', () => {
      // level 3 has 18 of 144 (the bug scenario): one parallel league only.
      // Expected: keep filling level 3 until full, do NOT skip to level 4.
      const teams = [
        ...Array(18).fill(null).map(() => ({ level: 0 })),
        ...Array(36).fill(null).map(() => ({ level: 1 })),
        ...Array(72).fill(null).map(() => ({ level: 2 })),
        ...Array(18).fill(null).map(() => ({ level: 3 }))
      ]
      expect(_nextLevelToFill(teams, minTeams)).toBe(3)
    })

    it('treats overfilled levels as full (gracefully skips)', () => {
      // 200 teams at level 0 but max=18: function should skip instead of throw
      const teams = Array(200).fill(null).map(() => ({ level: 0 }))
      // 200 teams >= 126, so no new level needs to open
      expect(_nextLevelToFill(teams, minTeams)).toBe(-1)
    })
  })

  describe('_computeTopUpPositions', () => {
    it('fills every formation slot when the team is empty', () => {
      const result = _computeTopUpPositions([], '433', 18)
      const starters = result.filter(r => r.isStarter)
      expect(starters).toHaveLength(11)
      // 433 formation: GK, LD, CD, CD, RD, LM, CM, RM, LA, CA, RA
      const starterPositions = starters.map(s => s.position).sort()
      expect(starterPositions).toEqual(['CA', 'CD', 'CD', 'CM', 'GK', 'LA', 'LD', 'LM', 'RA', 'RD', 'RM'])
      const bench = result.filter(r => !r.isStarter)
      expect(bench).toHaveLength(7)
      bench.forEach(b => expect(b.position).toBeNull())
    })

    it('only fills the missing formation positions when the team is partial', () => {
      // Existing players cover OM (not in 433), CD (1 of 2 needed), DM (not in 433)
      const existing = [{ position: 'OM' }, { position: 'CD' }, { position: 'DM' }]
      const result = _computeTopUpPositions(existing, '433', 15)
      const starters = result.filter(r => r.isStarter)
      // 11 formation slots minus 1 CD already covered = 10 starter slots to fill
      expect(starters).toHaveLength(10)
      const positions = starters.map(s => s.position).sort()
      expect(positions).toEqual(['CA', 'CD', 'CM', 'GK', 'LA', 'LD', 'LM', 'RA', 'RD', 'RM'])
      const bench = result.filter(r => !r.isStarter)
      expect(bench).toHaveLength(5)
    })

    it('does not double-count when existing players exceed formation requirement', () => {
      // Three CDs but formation only needs two
      const existing = [{ position: 'CD' }, { position: 'CD' }, { position: 'CD' }]
      const result = _computeTopUpPositions(existing, '433', 15)
      const positions = result.filter(r => r.isStarter).map(s => s.position)
      expect(positions.filter(p => p === 'CD')).toHaveLength(0)
    })

    it('caps starter slots when missing < formation deficit', () => {
      const result = _computeTopUpPositions([], '433', 3)
      expect(result).toHaveLength(3)
      expect(result.every(r => r.isStarter)).toBe(true)
    })
  })

  describe('regenerateTeamData', () => {
    function mockRegenerateQueries (existingPlayers) {
      query.mockImplementation((sql) => {
        if (/SELECT MAX\(season\)/i.test(sql)) return Promise.resolve([{ season: 5 }])
        if (/SELECT position FROM player/i.test(sql)) return Promise.resolve(existingPlayers)
        if (/SELECT id FROM stadium/i.test(sql)) return Promise.resolve([{ id: 1 }]) // pretend stadium exists
        if (/SELECT COUNT\(\*\) AS count FROM building/i.test(sql)) return Promise.resolve([{ count: 2 }]) // pretend buildings exist
        if (/SELECT \* FROM player WHERE name/i.test(sql)) return Promise.resolve([]) // generateRandomPlayerName uniqueness check
        return Promise.resolve([])
      })
    }

    it('tops up a partially populated team to 18 players, prioritising formation gaps', async () => {
      // Existing: 3 players matching the prod issue (OM/CD/DM)
      mockRegenerateQueries([
        { position: 'OM' },
        { position: 'CD' },
        { position: 'DM' }
      ])
      const team = { id: 193, formation: '433', level: 3, name: 'Fortuna Genoa' }
      await regenerateTeamData(team)
      const insertCalls = query.mock.calls.filter(c => /INSERT INTO player/.test(c[0]))
      expect(insertCalls).toHaveLength(15)
      const insertedPlayers = insertCalls.map(c => c[1])
      const starters = insertedPlayers.filter(p => p.in_game_position)
      // 11 formation slots minus 1 CD already covered = 10 starters
      expect(starters).toHaveLength(10)
    })

    it('does not create players if team already has 18+', async () => {
      mockRegenerateQueries(Array(18).fill({ position: 'CM' }))
      const team = { id: 1, formation: '433', level: 0, name: 'Test' }
      await regenerateTeamData(team)
      const insertCalls = query.mock.calls.filter(c => /INSERT INTO player/.test(c[0]))
      expect(insertCalls).toHaveLength(0)
    })

    it('creates a full 18-player squad when team is empty', async () => {
      mockRegenerateQueries([])
      const team = { id: 1, formation: '433', level: 0, name: 'Test' }
      await regenerateTeamData(team)
      const insertCalls = query.mock.calls.filter(c => /INSERT INTO player/.test(c[0]))
      expect(insertCalls).toHaveLength(18)
      const insertedPlayers = insertCalls.map(c => c[1])
      const starters = insertedPlayers.filter(p => p.in_game_position)
      expect(starters).toHaveLength(11)
    })
  })
})

