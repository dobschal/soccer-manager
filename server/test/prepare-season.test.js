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
import { prepareSeason, _buildGame, _nextLevelToFill, _existingLeagueDayMap, _computeTopUpPositions, regenerateTeamData, _assignTeamsToParallelLeagues } from '../prepare-season.js'
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

  describe('_assignTeamsToParallelLeagues', () => {
    const makeTeams = (managerCount, botCount) => {
      const teams = []
      for (let i = 0; i < managerCount; i++) teams.push({ id: 100 + i, user_id: 500 + i })
      for (let i = 0; i < botCount; i++) teams.push({ id: 200 + i, user_id: null })
      return teams
    }

    it('spreads human-managed teams evenly across parallel leagues', () => {
      // 36 teams → 2 leagues of 18. 10 managers should split ~5/5.
      const teams = makeTeams(10, 26)

      const leagues = _assignTeamsToParallelLeagues(teams)

      expect(leagues).toHaveLength(2)
      leagues.forEach(l => expect(l).toHaveLength(18))

      const managersPerLeague = leagues.map(l => l.filter(t => t.user_id != null).length)
      // Even distribution: no league differs from another by more than 1.
      expect(Math.max(...managersPerLeague) - Math.min(...managersPerLeague)).toBeLessThanOrEqual(1)
      expect(managersPerLeague.reduce((a, b) => a + b, 0)).toBe(10)
    })

    it('assigns every team to exactly one league and sets team.league', () => {
      const teams = makeTeams(4, 32)

      const leagues = _assignTeamsToParallelLeagues(teams)

      const assigned = leagues.flat()
      expect(assigned).toHaveLength(36)
      // Unique team ids, and each team.league matches its bucket index.
      const ids = new Set(assigned.map(t => t.id))
      expect(ids.size).toBe(36)
      leagues.forEach((l, idx) => l.forEach(t => expect(t.league).toBe(idx)))
    })

    it('handles a single partial league', () => {
      const teams = makeTeams(2, 8) // 10 teams → 1 league

      const leagues = _assignTeamsToParallelLeagues(teams)

      expect(leagues).toHaveLength(1)
      expect(leagues[0]).toHaveLength(10)
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
    const bot = (level) => ({ level, user_id: null })
    const user = (level) => ({ level, user_id: 1 })

    it('returns 0 when no teams exist (below the floor)', () => {
      expect(_nextLevelToFill([])).toBe(0)
    })

    it('returns the level that is opened but not yet full', () => {
      // 1 team at level 0 — needs 17 more to fill amountTeamsPerLevel[0]=18
      expect(_nextLevelToFill([bot(0)])).toBe(0)
    })

    it('opens the next level when current top level is full but minimumTeams floor not met', () => {
      const teams = Array(18).fill(null).map(() => bot(0))
      expect(_nextLevelToFill(teams)).toBe(1)
    })

    it('returns highest opened-but-not-full level even when other levels are full', () => {
      const teams = [
        ...Array(18).fill(null).map(() => bot(0)),
        ...Array(36).fill(null).map(() => bot(1)),
        ...Array(18).fill(null).map(() => bot(2))
      ]
      expect(_nextLevelToFill(teams)).toBe(2)
    })

    it('returns -1 when minimumTeams floor met and the user-pickable bottom levels still have ≥20 free bots', () => {
      // 126 teams (L0..L2 full), all bots. Only L2 is user-pickable. L2 free = 72 ≥ 20 → no new level.
      const teams = [
        ...Array(18).fill(null).map(() => bot(0)),
        ...Array(36).fill(null).map(() => bot(1)),
        ...Array(72).fill(null).map(() => bot(2))
      ]
      expect(_nextLevelToFill(teams)).toBe(-1)
    })

    it('opens a new lower level when the bottom-most user-pickable level has <20 free bots', () => {
      // L0..L2 fully filled, but L2 has only 15 bots left → open L3.
      // L1 still has 36 bots free but those are NOT user-pickable (MIN_CHOOSABLE_LEVEL=2)
      // so they don't count toward the buffer.
      const teams = [
        ...Array(18).fill(null).map(() => user(0)),
        ...Array(36).fill(null).map(() => bot(1)),
        ...Array(57).fill(null).map(() => user(2)),
        ...Array(15).fill(null).map(() => bot(2))
      ]
      expect(_nextLevelToFill(teams)).toBe(3)
    })

    it('opens a new lower level when the bottom TWO user-pickable levels combined have <20 free bots', () => {
      // L0..L3 fully filled. User-pickable = L2, L3. Free in L2+L3 = 5 + 10 = 15 < 20 → open L4.
      const teams = [
        ...Array(18).fill(null).map(() => user(0)),
        ...Array(36).fill(null).map(() => user(1)),
        ...Array(67).fill(null).map(() => user(2)),
        ...Array(5).fill(null).map(() => bot(2)),
        ...Array(134).fill(null).map(() => user(3)),
        ...Array(10).fill(null).map(() => bot(3))
      ]
      expect(_nextLevelToFill(teams)).toBe(4)
    })

    it('does NOT open a new level when the bottom two user-pickable levels still have ≥20 free bots', () => {
      // Free bots in L2 (10) + L3 (15) = 25 ≥ 20 → keep -1.
      const teams = [
        ...Array(18).fill(null).map(() => user(0)),
        ...Array(36).fill(null).map(() => user(1)),
        ...Array(62).fill(null).map(() => user(2)),
        ...Array(10).fill(null).map(() => bot(2)),
        ...Array(129).fill(null).map(() => user(3)),
        ...Array(15).fill(null).map(() => bot(3))
      ]
      expect(_nextLevelToFill(teams)).toBe(-1)
    })

    it('ignores L0/L1 bots in the buffer calculation (regression for the fresh-DB case)', () => {
      // Same setup as the "fresh seed" integration scenario: L0..L2 open, all bots.
      // L2 fills up with users until <20 bots remain — must open L3 even though
      // L1 still has its full 36 bots (they would never be picked).
      const teams = [
        ...Array(18).fill(null).map(() => bot(0)),
        ...Array(36).fill(null).map(() => bot(1)),
        ...Array(53).fill(null).map(() => user(2)),
        ...Array(19).fill(null).map(() => bot(2))
      ]
      expect(_nextLevelToFill(teams)).toBe(3)
    })

    it('keeps filling a partially-opened higher level rather than opening a new one', () => {
      // level 3 has 18 of 144 (one parallel league only). Fill it before opening level 4.
      const teams = [
        ...Array(18).fill(null).map(() => bot(0)),
        ...Array(36).fill(null).map(() => bot(1)),
        ...Array(72).fill(null).map(() => bot(2)),
        ...Array(18).fill(null).map(() => bot(3))
      ]
      expect(_nextLevelToFill(teams)).toBe(3)
    })

    it('treats overfilled levels as full (gracefully skips)', () => {
      const teams = Array(200).fill(null).map(() => bot(0))
      expect(_nextLevelToFill(teams)).toBe(-1)
    })

    it('regression: does NOT open a new level just because the user count nudges past teams.length', () => {
      // The 2026-06-07 prod state. L0..L3 fully filled. User-pickable bottom two
      // = L2 (27 free) + L3 (60 free) = 87 free ≥ 20 → must return -1.
      const teams = [
        ...Array(2).fill(null).map(() => user(0)),
        ...Array(16).fill(null).map(() => bot(0)),
        ...Array(4).fill(null).map(() => user(1)),
        ...Array(32).fill(null).map(() => bot(1)),
        ...Array(45).fill(null).map(() => user(2)),
        ...Array(27).fill(null).map(() => bot(2)),
        ...Array(84).fill(null).map(() => user(3)),
        ...Array(60).fill(null).map(() => bot(3))
      ]
      expect(_nextLevelToFill(teams)).toBe(-1)
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

