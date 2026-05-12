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
  calculateInterleavedSchedule,
  createCupDraw,
  progressCupRound,
  awardCupWinner,
  findNextCupGameDay,
  getCupGamesForTeam,
  getCupResultsForRound,
  getCupRoundsForSeason,
  getCupSeasons,
  getCupRoundDisplayName,
  getTotalRounds,
  orderBracketByPairings
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
      expect(schedule[schedule.length - 1].gameDay).toBe(33) // Final before last league day (totalGameDays defaults to 34)
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

  describe('calculateInterleavedSchedule', () => {
    it('produces no overlapping game days between cup and league', () => {
      const { leagueDayMap, cupGameDays } = calculateInterleavedSchedule(64, 34)

      const leagueDays = new Set(leagueDayMap)
      const cupDays = new Set(cupGameDays.values())

      // No game day should appear in both sets
      for (const cupDay of cupDays) {
        expect(leagueDays.has(cupDay)).toBe(false)
      }
    })

    it('total game days equals league days plus cup rounds', () => {
      const { leagueDayMap, cupGameDays, totalGameDays } = calculateInterleavedSchedule(64, 34)

      expect(totalGameDays).toBe(leagueDayMap.length + cupGameDays.size)
    })

    it('preserves league day ordering', () => {
      const { leagueDayMap } = calculateInterleavedSchedule(64, 34)

      for (let i = 1; i < leagueDayMap.length; i++) {
        expect(leagueDayMap[i]).toBeGreaterThan(leagueDayMap[i - 1])
      }
    })

    it('cup game days are in ascending order by round progression', () => {
      const { cupGameDays, cupSchedule } = calculateInterleavedSchedule(64, 34)

      // Cup schedule rounds go from highest (first round) to 1 (final)
      // Game days should increase as rounds progress
      const sortedByRound = [...cupSchedule].sort((a, b) => b.round - a.round)
      for (let i = 1; i < sortedByRound.length; i++) {
        const prevDay = cupGameDays.get(sortedByRound[i - 1].round)
        const currDay = cupGameDays.get(sortedByRound[i].round)
        expect(currDay).toBeGreaterThan(prevDay)
      }
    })

    it('all game days from 0 to totalGameDays-1 are covered', () => {
      const { leagueDayMap, cupGameDays, totalGameDays } = calculateInterleavedSchedule(64, 34)

      const allDays = new Set([...leagueDayMap, ...cupGameDays.values()])
      expect(allDays.size).toBe(totalGameDays)

      for (let i = 0; i < totalGameDays; i++) {
        expect(allDays.has(i)).toBe(true)
      }
    })

    it('works with small team counts', () => {
      const { leagueDayMap, cupGameDays, totalGameDays } = calculateInterleavedSchedule(4, 34)

      expect(leagueDayMap.length).toBe(34)
      expect(cupGameDays.size).toBeGreaterThan(0)
      expect(totalGameDays).toBe(34 + cupGameDays.size)
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

    it('sets sequential match_day on first-round cup games', async () => {
      // 4 teams → 2 rounds (semi + final). First round = round 2 → match_day 1.
      const teams = Array.from({ length: 4 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: 0,
        league: 0
      }))

      query.mockResolvedValueOnce(teams)
      query.mockResolvedValue({ insertId: 1 })

      await createCupDraw(1)

      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBeGreaterThan(0)
      // First round of 4-team cup = round 2, sequential round 1
      expect(insertCalls[0][1]).toHaveProperty('match_day', 1)
    })
  })

  describe('findNextCupGameDay', () => {
    it('returns the next game_day without any league game when no teamIds given', async () => {
      query.mockResolvedValueOnce([
        { game_day: 28 }, { game_day: 29 }, { game_day: 30 }, { game_day: 31 }
      ])

      const result = await findNextCupGameDay(4, 28)

      expect(result).toBe(32)
      expect(query.mock.calls[0][0]).not.toContain('team_1_id')
    })

    it('returns the next game_day where the supplied teams have no league game', async () => {
      // Season-wide league days exist on 28..31, but the specific teams only
      // play league on 28 and 31. The team-aware lookup must land on 29, not 32.
      query.mockResolvedValueOnce([
        { game_day: 28 }, { game_day: 31 }
      ])

      const result = await findNextCupGameDay(4, 28, [101, 102])

      expect(result).toBe(29)
      // SQL must filter by team participation, not just season.
      const sql = query.mock.calls[0][0]
      expect(sql).toContain('team_1_id IN')
      expect(sql).toContain('team_2_id IN')
      // Both team ids are passed twice (once for team_1_id IN, once for team_2_id IN).
      expect(query.mock.calls[0][1]).toEqual([4, 101, 102, 101, 102])
    })

    it('falls back to the season-wide lookup when teamIds is empty', async () => {
      query.mockResolvedValueOnce([{ game_day: 10 }])

      await findNextCupGameDay(4, 10, [])

      expect(query.mock.calls[0][0]).not.toContain('team_1_id')
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
        { id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1, game_day: 10 },
        { id: 2, team_1_id: 3, team_2_id: 4, goals_team_1: 0, goals_team_2: 3, game_day: 10 }
      ])
      query.mockResolvedValueOnce([{ maxRound: 4 }]) // MAX(cup_round) - first round was 4 (not 2, so no byes)
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
      query.mockResolvedValueOnce([{ maxRound: 4 }]) // MAX(cup_round) - first round was 4, so round 1 is not first round
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

  describe('getCupRoundDisplayName', () => {
    it('returns "Round of 16" for cup_round=8', () => {
      const totalRounds = getTotalRounds(64)
      expect(getCupRoundDisplayName(8, totalRounds)).toBe('Round of 16')
    })

    it('returns "Quarter-Final" for cup_round=4', () => {
      expect(getCupRoundDisplayName(4, 7)).toBe('Quarter-Final')
    })

    it('returns sequential round name for rounds > 8', () => {
      const totalRounds = getTotalRounds(64)
      // cup_round=16 → Round 3
      expect(getCupRoundDisplayName(16, totalRounds)).toBe('Round 3')
    })
  })

  describe('createCupDraw with byes', () => {
    it('creates bye game entries for bye teams', async () => {
      // 5 teams → 8 bracket → 3 byes
      const teams = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        level: Math.floor(i / 3),
        league: i % 3
      }))

      query.mockResolvedValueOnce(teams)
      query.mockResolvedValue({ insertId: 1 })

      await createCupDraw(1)

      // 1 real match + 3 bye game entries = 4 INSERT calls
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBe(4)

      // Bye games should have team_2_id=null, played=1
      const byeInserts = insertCalls.filter(call => call[1].team_2_id == null)
      expect(byeInserts.length).toBe(3)
      for (const byeInsert of byeInserts) {
        expect(byeInsert[1].played).toBe(1)
        expect(byeInsert[1].game_type).toBe('cup')
      }
    })
  })

  describe('progressCupRound with bye games', () => {
    it('advances bye teams (team_2_id=null) automatically', async () => {
      // Round 8: 2 real games + 6 bye games, all played
      const realGames = [
        { id: 1, team_1_id: 7, team_2_id: 8, goals_team_1: 2, goals_team_2: 0, game_day: 4 },
        { id: 2, team_1_id: 9, team_2_id: 10, goals_team_1: 1, goals_team_2: 3, game_day: 4 }
      ]
      const byeGames = [
        { id: 3, team_1_id: 1, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 },
        { id: 4, team_1_id: 2, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 },
        { id: 5, team_1_id: 3, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 },
        { id: 6, team_1_id: 4, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 },
        { id: 7, team_1_id: 5, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 },
        { id: 8, team_1_id: 6, team_2_id: null, goals_team_1: 0, goals_team_2: 0, game_day: 4 }
      ]

      query
        .mockResolvedValueOnce([]) // No unplayed games in round 8
        .mockResolvedValueOnce([...realGames, ...byeGames]) // All played games
        .mockResolvedValueOnce([{ maxRound: 8 }]) // MAX(cup_round)
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }))) // All teams for schedule
        .mockResolvedValue({ insertId: 100 }) // INSERT new games

      const result = await progressCupRound(1, 8)

      expect(result.advanced).toBe(true)

      // Winners: team 7 (real), team 10 (real), teams 1-6 (bye) = 8 teams → 4 next round games
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO game')
      )
      expect(insertCalls.length).toBe(4)
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

  describe('orderBracketByPairings', () => {
    it('returns empty bracket unchanged', () => {
      expect(orderBracketByPairings({})).toEqual({})
    })

    it('keeps the final round game order unchanged', () => {
      const finalGame = { team1Id: 1, team2Id: 2, goalsTeam1: 0, goalsTeam2: 0 }
      const bracket = { 1: { games: [finalGame] } }

      const result = orderBracketByPairings(bracket)

      expect(result[1].games).toEqual([finalGame])
    })

    it('orders semi-final games so feeders of final.team1 come before feeders of final.team2', () => {
      const finalGame = { team1Id: 10, team2Id: 20, goalsTeam1: null, goalsTeam2: null }
      const semiA = { team1Id: 30, team2Id: 20, goalsTeam1: 0, goalsTeam2: 1 } // 20 wins → final.team2
      const semiB = { team1Id: 10, team2Id: 40, goalsTeam1: 2, goalsTeam2: 1 } // 10 wins → final.team1
      const bracket = {
        1: { games: [finalGame] },
        2: { games: [semiA, semiB] }
      }

      const result = orderBracketByPairings(bracket)

      expect(result[2].games).toEqual([semiB, semiA])
    })

    it('orders quarter-finals so each pair feeds the same semi-final', () => {
      const finalGame = { team1Id: 1, team2Id: 2, goalsTeam1: null, goalsTeam2: null }
      const semi1 = { team1Id: 1, team2Id: 3, goalsTeam1: 1, goalsTeam2: 0 }
      const semi2 = { team1Id: 4, team2Id: 2, goalsTeam1: 0, goalsTeam2: 2 }
      // QF games: each team won one of the QFs
      const qfA = { team1Id: 5, team2Id: 4, goalsTeam1: 0, goalsTeam2: 1 } // 4 won → semi2.team1
      const qfB = { team1Id: 1, team2Id: 6, goalsTeam1: 3, goalsTeam2: 0 } // 1 won → semi1.team1
      const qfC = { team1Id: 2, team2Id: 7, goalsTeam1: 2, goalsTeam2: 1 } // 2 won → semi2.team2
      const qfD = { team1Id: 8, team2Id: 3, goalsTeam1: 0, goalsTeam2: 3 } // 3 won → semi1.team2

      const bracket = {
        1: { games: [finalGame] },
        2: { games: [semi1, semi2] },
        4: { games: [qfA, qfB, qfC, qfD] }
      }

      const result = orderBracketByPairings(bracket)

      // Order: feeders of semi1.team1, semi1.team2, semi2.team1, semi2.team2
      expect(result[4].games).toEqual([qfB, qfD, qfA, qfC])
    })

    it('treats bye games (team2Id null) as feeders for the bye-receiving team', () => {
      const semiGame = { team1Id: 100, team2Id: 200, goalsTeam1: null, goalsTeam2: null }
      const realFirstRound = { team1Id: 100, team2Id: 300, goalsTeam1: 1, goalsTeam2: 0 } // 100 won
      const byeGame = { team1Id: 200, team2Id: null, goalsTeam1: 0, goalsTeam2: 0 } // 200 had bye
      const bracket = {
        1: { games: [semiGame] },
        2: { games: [byeGame, realFirstRound] }
      }

      const result = orderBracketByPairings(bracket)

      expect(result[2].games).toEqual([realFirstRound, byeGame])
    })

    it('appends games that cannot be matched to a feeder slot', () => {
      const finalGame = { team1Id: 1, team2Id: 2, goalsTeam1: null, goalsTeam2: null }
      const realSemi = { team1Id: 1, team2Id: 9, goalsTeam1: 1, goalsTeam2: 0 } // matches final.team1
      const orphan = { team1Id: 50, team2Id: 60, goalsTeam1: 0, goalsTeam2: 0 } // unrelated
      const bracket = {
        1: { games: [finalGame] },
        2: { games: [orphan, realSemi] }
      }

      const result = orderBracketByPairings(bracket)

      expect(result[2].games[0]).toBe(realSemi)
      expect(result[2].games).toContain(orphan)
      expect(result[2].games).toHaveLength(2)
    })
  })
})
