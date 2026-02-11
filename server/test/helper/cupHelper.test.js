import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key, _params) => key)
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import {
  calculateCupSchedule,
  createCupDraw,
  progressCupRound,
  awardCupWinner,
  getCupGamesForTeam,
  getCupResultsForRound,
  getCupRoundsForSeason,
  getCupSeasons
} from '../../helper/cupHelper.js'

describe('cupHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateCupSchedule', () => {
    it('calculates schedule for 64 teams', () => {
      const schedule = calculateCupSchedule(64)

      expect(schedule.length).toBe(6) // 64 -> 32 -> 16 -> 8 -> 4 -> 2 -> 1
      expect(schedule[schedule.length - 1].round).toBe(1) // Final
      expect(schedule[schedule.length - 1].roundName).toBe('final')
      expect(schedule[schedule.length - 1].gameDay).toBe(32) // Final before last game day
    })

    it('calculates schedule for 128 teams', () => {
      const schedule = calculateCupSchedule(128)

      expect(schedule.length).toBe(7) // 128 -> 64 -> 32 -> 16 -> 8 -> 4 -> 2 -> 1
      expect(schedule[0].round).toBe(64)
      expect(schedule[schedule.length - 1].round).toBe(1)
    })

    it('schedules final on game day 32', () => {
      const schedule = calculateCupSchedule(64, 33)

      const final = schedule.find(s => s.round === 1)
      expect(final.gameDay).toBe(32)
    })

    it('handles different team counts correctly', () => {
      // 100 teams - not power of 2, needs 128 bracket with byes
      const schedule100 = calculateCupSchedule(100)
      expect(schedule100.length).toBe(7)

      // 32 teams
      const schedule32 = calculateCupSchedule(32)
      expect(schedule32.length).toBe(5)

      // 16 teams
      const schedule16 = calculateCupSchedule(16)
      expect(schedule16.length).toBe(4)
    })

    it('names rounds correctly', () => {
      const schedule = calculateCupSchedule(16)

      const roundNames = schedule.map(s => s.roundName)
      expect(roundNames).toContain('final')
      expect(roundNames).toContain('semiFinal')
      expect(roundNames).toContain('quarterFinal')
    })

    it('spaces rounds appropriately throughout season', () => {
      const schedule = calculateCupSchedule(64)

      // First round should be around game day 4
      expect(schedule[0].gameDay).toBe(4)

      // Rounds should be in increasing game day order
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].gameDay).toBeGreaterThanOrEqual(schedule[i - 1].gameDay)
      }
    })
  })

  describe('createCupDraw', () => {
    it('creates correct number of first-round matches', async () => {
      // Mock 64 teams
      const teams = Array.from({ length: 64 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: Math.floor(i / 18),
        league: i % 4
      }))

      query.mockResolvedValueOnce(teams) // SELECT teams
      query.mockResolvedValue({ insertId: 1 }) // INSERT games

      const matchesCreated = await createCupDraw(1)

      // 64 teams, no byes = 32 matches
      expect(matchesCreated).toBe(32)
    })

    it('handles byes for non-power-of-2 team counts', async () => {
      // Mock 50 teams (needs 64 bracket, 14 byes)
      const teams = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: Math.floor(i / 18),
        league: i % 4
      }))

      query.mockResolvedValueOnce(teams) // SELECT teams
      query.mockResolvedValue({ insertId: 1 }) // INSERT games

      const matchesCreated = await createCupDraw(1)

      // 50 teams with 14 byes = 36 teams play in first round = 18 matches
      expect(matchesCreated).toBe(18)
    })

    it('returns 0 when not enough teams', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Only Team' }])

      const matchesCreated = await createCupDraw(1)

      expect(matchesCreated).toBe(0)
    })

    it('inserts games with cup game type', async () => {
      const teams = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: 0,
        league: 0
      }))

      query.mockResolvedValueOnce(teams)
      query.mockResolvedValue({ insertId: 1 })

      await createCupDraw(1)

      // Check that games were inserted with game_type='cup'
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBeGreaterThan(0)
      expect(insertCalls[0][1]).toHaveProperty('game_type', 'cup')
    })
  })

  describe('progressCupRound', () => {
    it('does nothing if round not complete', async () => {
      query.mockResolvedValueOnce([{ id: 1 }]) // Unplayed games

      const result = await progressCupRound(1, 32)

      expect(result.advanced).toBe(false)
      expect(result.isComplete).toBe(false)
    })

    it('creates next round matches when all games played', async () => {
      // All games played
      query.mockResolvedValueOnce([]) // No unplayed games
      query.mockResolvedValueOnce([ // Played games
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1 },
        { id: 2, team_1_id: 3, team_2_id: 4, goals_team_1: 0, goals_team_2: 3 }
      ])
      query.mockResolvedValueOnce([]) // No teams in cup (for byes check)
      query.mockResolvedValueOnce([ // All teams for schedule calculation
        { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }
      ])
      query.mockResolvedValue({ insertId: 1 }) // INSERT new round games

      const result = await progressCupRound(1, 2)

      expect(result.advanced).toBe(true)
      expect(result.isComplete).toBe(false)
    })

    it('completes cup when final is played', async () => {
      query.mockResolvedValueOnce([]) // No unplayed games in final
      query.mockResolvedValueOnce([ // Final game
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 3, goals_team_2: 1 }
      ])
      query.mockResolvedValueOnce([]) // No bye teams
      // Mock for awardCupWinner
      query.mockResolvedValueOnce([{ id: 1, name: 'Winner Team', user_id: 1 }])
      query.mockResolvedValueOnce([{ game_day: 32, season: 1 }])
      query.mockResolvedValue({})

      const result = await progressCupRound(1, 1)

      expect(result.isComplete).toBe(true)
    })
  })

  describe('awardCupWinner', () => {
    it('awards prize money to winner', async () => {
      const team = { id: 1, name: 'Winner Team', user_id: 1 }
      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([{ game_day: 32, season: 1 }])

      await awardCupWinner(1, 1)

      expect(updateTeamBalance).toHaveBeenCalledWith(
        team,
        2000000,
        expect.any(String),
        32,
        1
      )
    })

    it('sends log message to winner', async () => {
      const team = { id: 1, name: 'Winner Team', user_id: 1 }
      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([{ game_day: 32, season: 1 }])

      await awardCupWinner(1, 1)

      expect(addLogMessage).toHaveBeenCalledWith(
        expect.any(String),
        team,
        null,
        null,
        'trophy'
      )
    })

    it('handles team without user gracefully', async () => {
      const team = { id: 1, name: 'Bot Team', user_id: null }
      query.mockResolvedValueOnce([team])
      query.mockResolvedValueOnce([{ game_day: 32, season: 1 }])

      await awardCupWinner(1, 1)

      // Should still award money but no log message
      expect(updateTeamBalance).toHaveBeenCalled()
      expect(addLogMessage).not.toHaveBeenCalled()
    })
  })

  describe('getCupGamesForTeam', () => {
    it('returns cup games for a team', async () => {
      const mockGames = [
        { id: 1, team1: 'Team 1', team2: 'Team 2', cupRound: 32 },
        { id: 2, team1: 'Team 1', team2: 'Team 3', cupRound: 16 }
      ]
      query.mockResolvedValueOnce(mockGames)

      const result = await getCupGamesForTeam(1, 1, 10)

      expect(result).toEqual(mockGames)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('game_type = \'cup\''),
        expect.arrayContaining([1, 1, 1, 10])
      )
    })
  })

  describe('getCupResultsForRound', () => {
    it('returns results for a specific round', async () => {
      const mockResults = [
        { id: 1, team1: 'Team 1', team2: 'Team 2', goalsTeam1: 2, goalsTeam2: 1 }
      ]
      query.mockResolvedValueOnce(mockResults)

      const result = await getCupResultsForRound(1, 32)

      expect(result).toEqual(mockResults)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('cup_round = ?'),
        [1, 32]
      )
    })
  })

  describe('getCupRoundsForSeason', () => {
    it('returns all rounds for a season', async () => {
      const mockRounds = [
        { round: 32, gameDay: 4, allPlayed: 1, matchCount: 16 },
        { round: 16, gameDay: 10, allPlayed: 0, matchCount: 8 }
      ]
      query.mockResolvedValueOnce(mockRounds)

      const result = await getCupRoundsForSeason(1)

      expect(result.length).toBe(2)
      expect(result[0]).toHaveProperty('round', 32)
      expect(result[0]).toHaveProperty('played', true)
    })
  })

  describe('getCupSeasons', () => {
    it('returns seasons with cup data', async () => {
      query.mockResolvedValueOnce([{ season: 2 }, { season: 1 }])

      const result = await getCupSeasons()

      expect(result).toEqual([2, 1])
    })

    it('returns empty array when no cup data', async () => {
      query.mockResolvedValueOnce([])

      const result = await getCupSeasons()

      expect(result).toEqual([])
    })
  })
})
