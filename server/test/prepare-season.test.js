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
import { prepareSeason, _buildGame, _nextLevelToFill } from '../prepare-season.js'

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
})

