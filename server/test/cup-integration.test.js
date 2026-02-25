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
  progressCupRound,
  getTotalRounds,
  getSequentialRoundNumber,
  getCupRoundDisplayName,
  validateAndProgressCupRounds
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
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 3, goals_team_2: 1, game_day: 27 }, // Team 1 wins
        { id: 2, team_1_id: 3, team_2_id: 4, goals_team_1: 0, goals_team_2: 2, game_day: 27 } // Team 4 wins
      ]

      query
        .mockResolvedValueOnce([]) // No unplayed games in round 2
        .mockResolvedValueOnce(semiGames) // Played games
        .mockResolvedValueOnce([{ maxRound: 4 }]) // MAX(cup_round) - first round was 4
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
        .mockResolvedValueOnce([{ maxRound: 4 }]) // MAX(cup_round) - first round was 4
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

      // Verify bye game entries were created (1 match + 3 bye entries = 4 INSERT calls)
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBe(4) // 1 real match + 3 bye games

      // Verify bye games have team_2_id=null and played=1
      const byeGameInserts = insertCalls.filter(call => call[1].team_2_id == null)
      expect(byeGameInserts.length).toBe(3)
      for (const byeInsert of byeGameInserts) {
        expect(byeInsert[1].played).toBe(1)
        expect(byeInsert[1].goals_team_1).toBe(0)
        expect(byeInsert[1].goals_team_2).toBe(0)
      }
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

  describe('Round naming', () => {
    it('displays sequential round names for early rounds', () => {
      // 128 teams = 7 rounds, maxCupRound = 64
      const totalRounds = getTotalRounds(64)
      expect(totalRounds).toBe(7)

      // cup_round=64 (first round): "Round 1"
      expect(getSequentialRoundNumber(64, 7)).toBe(1)
      expect(getCupRoundDisplayName(64, 7)).toBe('Round 1')

      // cup_round=32 (second round): "Round 2"
      expect(getSequentialRoundNumber(32, 7)).toBe(2)
      expect(getCupRoundDisplayName(32, 7)).toBe('Round 2')

      // cup_round=16 (third round): "Round 3"
      expect(getSequentialRoundNumber(16, 7)).toBe(3)
      expect(getCupRoundDisplayName(16, 7)).toBe('Round 3')

      // cup_round=8 (fourth round): "Round of 16"
      expect(getSequentialRoundNumber(8, 7)).toBe(4)
      expect(getCupRoundDisplayName(8, 7)).toBe('Round of 16')
    })

    it('uses special names for Viertelfinale, Halbfinale, Finale', () => {
      const totalRounds = getTotalRounds(64)

      // cup_round=4 = Quarter-Final
      expect(getCupRoundDisplayName(4, totalRounds)).toBe('Quarter-Final')

      // cup_round=2 = Semi-Final
      expect(getCupRoundDisplayName(2, totalRounds)).toBe('Semi-Final')

      // cup_round=1 = Final
      expect(getCupRoundDisplayName(1, totalRounds)).toBe('Final')
    })

    it('names correctly for small tournaments', () => {
      // 4 teams = 2 rounds
      const totalRounds = getTotalRounds(2)
      expect(totalRounds).toBe(2)

      // cup_round=2 (first round, also semi-final)
      expect(getCupRoundDisplayName(2, totalRounds)).toBe('Semi-Final')

      // cup_round=1 (final)
      expect(getCupRoundDisplayName(1, totalRounds)).toBe('Final')
    })

    it('names correctly for 16-team tournament', () => {
      // 16 teams = 4 rounds, maxCupRound = 8
      const totalRounds = getTotalRounds(8)
      expect(totalRounds).toBe(4)

      // cup_round=8: "Round of 16" (special name)
      expect(getCupRoundDisplayName(8, totalRounds)).toBe('Round of 16')

      // cup_round=4: "Quarter-Final"
      expect(getCupRoundDisplayName(4, totalRounds)).toBe('Quarter-Final')

      // cup_round=2: "Semi-Final"
      expect(getCupRoundDisplayName(2, totalRounds)).toBe('Semi-Final')

      // cup_round=1: "Final"
      expect(getCupRoundDisplayName(1, totalRounds)).toBe('Final')
    })
  })

  describe('Full tournament simulation with no eliminated teams reappearing', () => {
    it('simulates a 16-team tournament end to end', async () => {
      const teamCount = 16
      const teams = Array.from({ length: teamCount }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: 0,
        league: 0,
        user_id: null
      }))

      // Track all created games
      const allGames = []
      let gameIdCounter = 0

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO game')) {
          const game = { ...params, id: ++gameIdCounter }
          allGames.push(game)
          return { insertId: game.id }
        }
        if (sql.includes('SELECT * FROM team ORDER BY')) {
          return teams
        }
        if (sql.includes('SELECT * FROM team WHERE id=?')) {
          return [teams.find(t => t.id === params[0])]
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=0')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && !g.played)
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=1')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && g.played)
        }
        if (sql.includes('SELECT MAX(cup_round)')) {
          const maxRound = Math.max(...allGames.map(g => g.cup_round))
          return [{ maxRound }]
        }
        if (sql.includes('SELECT id FROM team')) {
          return teams.map(t => ({ id: t.id }))
        }
        if (sql.includes('SELECT * FROM team')) {
          return teams
        }
        return []
      })

      // Create cup draw
      const matchesCreated = await createCupDraw(1)
      expect(matchesCreated).toBe(8) // 16 teams = 8 first round matches

      // All first round games should be cup_round = 8
      const firstRoundGames = allGames.filter(g => g.cup_round === 8)
      expect(firstRoundGames.length).toBe(8)

      // Track all teams that have been eliminated
      const eliminatedTeams = new Set()
      const allTeamIds = new Set(teams.map(t => t.id))

      // Play through each round
      const schedule = calculateCupSchedule(teamCount)
      expect(schedule.length).toBe(4) // 4 rounds for 16 teams

      for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
        const round = schedule[roundIdx]
        const roundGames = allGames.filter(g => g.cup_round === round.round && !g.played)

        // Number of games should halve each round
        const expectedGames = teamCount / Math.pow(2, roundIdx + 1)
        expect(roundGames.length).toBe(expectedGames)

        // Verify no eliminated team is in this round
        for (const game of roundGames) {
          expect(eliminatedTeams.has(game.team_1_id)).toBe(false)
          expect(eliminatedTeams.has(game.team_2_id)).toBe(false)
          // Verify both teams are real teams
          expect(allTeamIds.has(game.team_1_id)).toBe(true)
          expect(allTeamIds.has(game.team_2_id)).toBe(true)
        }

        // Simulate playing the games (team with lower id wins)
        for (const game of roundGames) {
          game.played = 1
          game.goals_team_1 = 2
          game.goals_team_2 = 0
          // Lower id wins, higher id eliminated
          eliminatedTeams.add(game.team_2_id)
        }

        // Progress to next round
        const result = await progressCupRound(1, round.round)

        if (roundIdx === schedule.length - 1) {
          // Last round (final) should complete the cup
          expect(result.isComplete).toBe(true)
        } else {
          expect(result.advanced).toBe(true)
          expect(result.isComplete).toBe(false)
        }
      }

      // Total games: 8 + 4 + 2 + 1 = 15
      expect(allGames.length).toBe(15)

      // All teams except the winner should be eliminated
      expect(eliminatedTeams.size).toBe(teamCount - 1)
    })

    it('simulates a tournament with byes (non-power-of-2 teams)', async () => {
      const teamCount = 10
      const teams = Array.from({ length: teamCount }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: Math.floor(i / 5), // First 5 are level 0, rest are level 1
        league: i % 5,
        user_id: null
      }))

      // 10 teams → 16 bracket → 6 byes
      // Teams sorted by level: first 5 level 0, then 5 level 1
      // Top 6 teams get byes: ids 1-5 (level 0) and id 6 (first level 1)

      const allGames = []
      let gameIdCounter = 0

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO game')) {
          const game = { ...params, id: ++gameIdCounter }
          allGames.push(game)
          return { insertId: game.id }
        }
        if (sql.includes('SELECT * FROM team ORDER BY')) {
          return [...teams].sort((a, b) => a.level - b.level || a.league - b.league)
        }
        if (sql.includes('SELECT * FROM team WHERE id=?')) {
          return [teams.find(t => t.id === params[0])]
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=0')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && !g.played)
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=1')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && g.played)
        }
        if (sql.includes('SELECT MAX(cup_round)')) {
          const maxRound = Math.max(...allGames.map(g => g.cup_round))
          return [{ maxRound }]
        }
        if (sql.includes('SELECT id FROM team')) {
          return teams.map(t => ({ id: t.id }))
        }
        if (sql.includes('SELECT * FROM team')) {
          return teams
        }
        return []
      })

      // Create cup draw
      const matchesCreated = await createCupDraw(1)

      // 10 teams, 6 byes = 4 teams play in first round = 2 matches
      expect(matchesCreated).toBe(2)

      // First round: 2 real games + 6 bye games = 8 entries, cup_round should be 8
      const firstRoundGames = allGames.filter(g => g.cup_round === 8)
      expect(firstRoundGames.length).toBe(8) // 2 real matches + 6 bye entries

      const realFirstRoundGames = firstRoundGames.filter(g => g.team_2_id != null)
      const byeGames = firstRoundGames.filter(g => g.team_2_id == null)
      expect(realFirstRoundGames.length).toBe(2)
      expect(byeGames.length).toBe(6)

      // Bye games should already be played
      for (const byeGame of byeGames) {
        expect(byeGame.played).toBe(1)
      }

      // Play first round real games
      const eliminatedTeams = new Set()
      for (const game of realFirstRoundGames) {
        game.played = 1
        game.goals_team_1 = 2
        game.goals_team_2 = 0
        eliminatedTeams.add(game.team_2_id)
      }

      // Progress first round - bye teams advance automatically via their bye game entries
      const result1 = await progressCupRound(1, 8)
      expect(result1.advanced).toBe(true)

      // Second round should have 8 teams (2 winners + 6 bye winners = 8 teams → 4 games)
      const secondRoundGames = allGames.filter(g => g.cup_round === 4)
      expect(secondRoundGames.length).toBe(4)

      // Verify no eliminated team in second round
      for (const game of secondRoundGames) {
        expect(eliminatedTeams.has(game.team_1_id)).toBe(false)
        expect(eliminatedTeams.has(game.team_2_id)).toBe(false)
      }

      // Play second round
      for (const game of secondRoundGames) {
        game.played = 1
        game.goals_team_1 = 1
        game.goals_team_2 = 0
        eliminatedTeams.add(game.team_2_id)
      }

      // Progress second round - no more byes
      const result2 = await progressCupRound(1, 4)
      expect(result2.advanced).toBe(true)

      // Semi-finals: 4 teams → 2 games
      const semiGames = allGames.filter(g => g.cup_round === 2)
      expect(semiGames.length).toBe(2)

      // No eliminated teams
      for (const game of semiGames) {
        expect(eliminatedTeams.has(game.team_1_id)).toBe(false)
        expect(eliminatedTeams.has(game.team_2_id)).toBe(false)
      }

      // Play semi-finals
      for (const game of semiGames) {
        game.played = 1
        game.goals_team_1 = 3
        game.goals_team_2 = 1
        eliminatedTeams.add(game.team_2_id)
      }

      const result3 = await progressCupRound(1, 2)
      expect(result3.advanced).toBe(true)

      // Final: 2 teams → 1 game
      const finalGames = allGames.filter(g => g.cup_round === 1)
      expect(finalGames.length).toBe(1)

      // No eliminated teams in final
      expect(eliminatedTeams.has(finalGames[0].team_1_id)).toBe(false)
      expect(eliminatedTeams.has(finalGames[0].team_2_id)).toBe(false)

      // Play final
      finalGames[0].played = 1
      finalGames[0].goals_team_1 = 2
      finalGames[0].goals_team_2 = 1

      const result4 = await progressCupRound(1, 1)
      expect(result4.isComplete).toBe(true)

      // Total games: 8 (2 real + 6 byes) + 4 + 2 + 1 = 15
      expect(allGames.length).toBe(15)
    })

    it('verifies matches halve each round for 32-team tournament', async () => {
      const teamCount = 32
      const teams = Array.from({ length: teamCount }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: 0,
        league: 0,
        user_id: null
      }))

      const allGames = []
      let gameIdCounter = 0

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('INSERT INTO game')) {
          const game = { ...params, id: ++gameIdCounter }
          allGames.push(game)
          return { insertId: game.id }
        }
        if (sql.includes('SELECT * FROM team ORDER BY')) {
          return teams
        }
        if (sql.includes('SELECT * FROM team WHERE id=?')) {
          return [teams.find(t => t.id === params[0])]
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=0')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && !g.played)
        }
        if (sql.includes('SELECT * FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=? AND played=1')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && g.played)
        }
        if (sql.includes('SELECT MAX(cup_round)')) {
          const maxRound = Math.max(...allGames.map(g => g.cup_round))
          return [{ maxRound }]
        }
        if (sql.includes('SELECT id FROM team')) {
          return teams.map(t => ({ id: t.id }))
        }
        if (sql.includes('SELECT * FROM team')) {
          return teams
        }
        return []
      })

      await createCupDraw(1)

      const schedule = calculateCupSchedule(teamCount)
      expect(schedule.length).toBe(5) // 32 → 16 → 8 → 4 → 2

      // Expected games per round: 16, 8, 4, 2, 1
      const expectedGamesPerRound = [16, 8, 4, 2, 1]

      for (let roundIdx = 0; roundIdx < schedule.length; roundIdx++) {
        const round = schedule[roundIdx]
        const roundGames = allGames.filter(g => g.cup_round === round.round && !g.played)

        expect(roundGames.length).toBe(expectedGamesPerRound[roundIdx])

        // Play games
        for (const game of roundGames) {
          game.played = 1
          game.goals_team_1 = 2
          game.goals_team_2 = 0
        }

        await progressCupRound(1, round.round)
      }

      // Total games: 16 + 8 + 4 + 2 + 1 = 31
      expect(allGames.length).toBe(31)
    })
  })

  describe('validateAndProgressCupRounds', () => {
    it('progresses a round that was played but not progressed', async () => {
      const allGames = []
      let gameIdCounter = 0

      // Round 4 is played, but round 2 does not exist yet
      allGames.push(
        { id: 1, cup_round: 4, played: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 0, game_day: 4 },
        { id: 2, cup_round: 4, played: 1, team_1_id: 3, team_2_id: 4, goals_team_1: 1, goals_team_2: 3, game_day: 4 }
      )

      query.mockImplementation(async (sql, params) => {
        // getCupRoundsForSeason
        if (sql.includes('SELECT cup_round as round')) {
          return [{ round: 4, gameDay: 4, allPlayed: 1, matchCount: 2 }]
        }
        // Check for next round existence
        if (sql.includes('SELECT COUNT(*)') && sql.includes('cup_round')) {
          const [, cupRound] = params
          const count = allGames.filter(g => g.cup_round === cupRound).length
          return [{ count }]
        }
        // progressCupRound queries
        if (sql.includes('played=0') && sql.includes('cup_round')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && !g.played)
        }
        if (sql.includes('played=1') && sql.includes('cup_round')) {
          const [, round] = params
          return allGames.filter(g => g.cup_round === round && g.played)
        }
        if (sql.includes('SELECT MAX(cup_round)')) {
          return [{ maxRound: 4 }]
        }
        if (sql.includes('SELECT * FROM team')) {
          return [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
        }
        if (sql.includes('INSERT INTO game')) {
          const game = { ...params, id: ++gameIdCounter + 100 }
          allGames.push(game)
          return { insertId: game.id }
        }
        return []
      })

      await validateAndProgressCupRounds(1)

      // Should have created round 2 game(s)
      const round2Games = allGames.filter(g => g.cup_round === 2)
      expect(round2Games.length).toBe(1)
    })

    it('does nothing when all rounds are already progressed', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT cup_round as round')) {
          return [
            { round: 4, gameDay: 4, allPlayed: 1, matchCount: 2 },
            { round: 2, gameDay: 10, allPlayed: 0, matchCount: 1 }
          ]
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return [{ count: 1 }] // Next round exists
        }
        return []
      })

      await validateAndProgressCupRounds(1)

      // No INSERT calls should have been made
      const insertCalls = query.mock.calls.filter(c => c[0].includes('INSERT'))
      expect(insertCalls.length).toBe(0)
    })
  })

  describe('Team history cup display', () => {
    it('shows correct round name in history for early round elimination', () => {
      // Team eliminated in round of 16 of a 7-round tournament
      // cup_round = 8 (round of 16), totalRounds = 7
      const roundReached = 8
      const totalRounds = 7
      const name = getCupRoundDisplayName(roundReached, totalRounds)
      expect(name).toBe('Round of 16')
    })

    it('shows "Quarter-Final" for cup_round=4', () => {
      expect(getCupRoundDisplayName(4, 7)).toBe('Quarter-Final')
    })

    it('shows "Semi-Final" for cup_round=2', () => {
      expect(getCupRoundDisplayName(2, 7)).toBe('Semi-Final')
    })

    it('shows "Final" for cup_round=1', () => {
      expect(getCupRoundDisplayName(1, 7)).toBe('Final')
    })
  })
})
