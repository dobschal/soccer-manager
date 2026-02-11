import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../i18n/index.js', () => ({
  getUserLocale: vi.fn().mockResolvedValue('en'),
  t: vi.fn((key, params) => {
    if (key === 'finance.cupPrize') return 'Cup winner prize'
    if (key === 'log.cupWinner') return `Cup winner! Prize: ${params?.prize}`
    return key
  })
}))

import { query } from '../lib/database.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { addLogMessage } from '../helper/logMessageHelper.js'
import {
  calculateCupSchedule,
  createCupDraw,
  progressCupRound
} from '../helper/cupHelper.js'

describe('Cup Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Full cup simulation', () => {
    it('simulates a complete 8-team cup tournament', async () => {
      // Create 8 teams
      const teams = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: 0,
        league: 0,
        user_id: i === 0 ? 1 : null // First team has a user
      }))

      // Mock for createCupDraw
      query.mockResolvedValueOnce(teams) // SELECT teams

      let insertedGames = []
      query.mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO game')) {
          const game = params
          game.id = insertedGames.length + 1
          insertedGames.push(game)
          return { insertId: game.id }
        }
        if (sql.includes('SELECT * FROM team ORDER BY')) {
          return teams
        }
        if (sql.includes('SELECT * FROM team WHERE id=?')) {
          return [teams.find(t => t.id === params[0])]
        }
        return []
      })

      // Create cup draw
      const matchesCreated = await createCupDraw(1)
      expect(matchesCreated).toBe(4) // 8 teams = 4 first round matches

      // Verify schedule
      const schedule = calculateCupSchedule(8)
      expect(schedule.length).toBe(3) // Quarter-finals, Semi-finals, Final
      expect(schedule[0].round).toBe(4) // Quarter-finals
      expect(schedule[1].round).toBe(2) // Semi-finals
      expect(schedule[2].round).toBe(1) // Final
    })

    it('handles cup round progression correctly', async () => {
      // Setup: 2 games in the semi-finals (round 2)
      const semiGames = [
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 3, goals_team_2: 1 }, // Team 1 wins
        { id: 2, team_1_id: 3, team_2_id: 4, goals_team_1: 0, goals_team_2: 2 } // Team 4 wins
      ]

      query
        .mockResolvedValueOnce([]) // No unplayed games in round 2
        .mockResolvedValueOnce(semiGames) // Played games
        .mockResolvedValueOnce([]) // No bye teams
        .mockResolvedValueOnce([ // All teams for schedule
          { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }
        ])
        .mockResolvedValue({ insertId: 3 }) // Insert final game

      const result = await progressCupRound(1, 2)

      expect(result.advanced).toBe(true)
      expect(result.isComplete).toBe(false)

      // Should have inserted a final game between winners (Team 1 vs Team 4)
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBe(1)
      expect(insertCalls[0][1].cup_round).toBe(1) // Final
    })

    it('awards winner correctly after final', async () => {
      // Final game: Team 1 vs Team 2, Team 1 wins
      const finalGame = [
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 0 }
      ]

      const winnerTeam = { id: 1, name: 'Winner FC', user_id: 1 }

      query
        .mockResolvedValueOnce([]) // No unplayed games
        .mockResolvedValueOnce(finalGame) // Final game
        .mockResolvedValueOnce([]) // No bye teams
        // For awardCupWinner:
        .mockResolvedValueOnce([winnerTeam]) // Winner team
        .mockResolvedValueOnce([{ game_day: 32, season: 1 }]) // Latest game day

      const result = await progressCupRound(1, 1)

      expect(result.isComplete).toBe(true)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        winnerTeam,
        2000000,
        'Cup winner prize',
        32,
        1
      )
      expect(addLogMessage).toHaveBeenCalled()
    })
  })

  describe('Cup draw with byes', () => {
    it('handles 5 teams correctly (3 byes)', async () => {
      // 5 teams needs 8 bracket, 3 byes
      // Higher-ranked teams (lower level) get byes
      const teams = [
        { id: 1, name: 'Top Team', level: 0, league: 0 }, // Gets bye
        { id: 2, name: 'Second Team', level: 0, league: 1 }, // Gets bye
        { id: 3, name: 'Third Team', level: 1, league: 0 }, // Gets bye
        { id: 4, name: 'Fourth Team', level: 1, league: 1 }, // Plays
        { id: 5, name: 'Fifth Team', level: 2, league: 0 } // Plays
      ]

      query.mockResolvedValueOnce(teams)
      query.mockResolvedValue({ insertId: 1 })

      const matchesCreated = await createCupDraw(1)

      // 5 teams, 3 byes = 2 teams in first round = 1 match
      expect(matchesCreated).toBe(1)
    })
  })

  describe('Schedule spacing', () => {
    it('spaces rounds appropriately for large tournaments', () => {
      const schedule = calculateCupSchedule(128, 33)

      // Verify rounds are spread across the season
      const gameDays = schedule.map(s => s.gameDay)

      // First round should be early
      expect(gameDays[0]).toBeLessThan(10)

      // Final should be late
      expect(gameDays[gameDays.length - 1]).toBe(32)

      // Rounds should be in ascending order
      for (let i = 1; i < gameDays.length; i++) {
        expect(gameDays[i]).toBeGreaterThanOrEqual(gameDays[i - 1])
      }
    })
  })
})
