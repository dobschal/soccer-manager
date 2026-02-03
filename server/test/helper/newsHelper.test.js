import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/util.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    randomItem: vi.fn((arr) => arr[0]) // Always return first template for predictable tests
  }
})

import { query } from '../../lib/database.js'
import { generateNewsForGameDay, getNewsByLeague } from '../../helper/newsHelper.js'

describe('newsHelper', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('generateNewsForGameDay', () => {
    describe('transfer news', () => {
      it('creates news for the highest price transfer of the day', async () => {
        // Mock: get leagues with games
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])

        // Mock: transfer query - FOUND
        query.mockResolvedValueOnce([{
          id: 1,
          player_id: 10,
          from_team_id: 1,
          to_team_id: 2,
          price: 500000,
          game_day: 5,
          season: 1,
          player_name: 'Star Striker',
          from_team_name: 'Selling FC',
          to_team_name: 'Buying United'
        }])

        // Mock: insert TRANSFER news (happens immediately after finding transfer)
        query.mockResolvedValueOnce({ insertId: 1 })

        // Mock: highest win query
        query.mockResolvedValueOnce([])

        // Mock: standing queries - current games (empty, so no teams/prev queries)
        query.mockResolvedValueOnce([])

        // Mock: level up query
        query.mockResolvedValueOnce([])

        // Mock: stadium expansion query
        query.mockResolvedValueOnce([])

        await generateNewsForGameDay(5, 1)

        // Find the INSERT call for news
        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('TRANSFER')
        expect(insertedNews.title).toContain('Star Striker')
        expect(insertedNews.title).toContain('Buying United')
        expect(insertedNews.text).toContain('Selling FC')
        expect(insertedNews.text).toContain('500') // Price is formatted with euroFormat
        expect(insertedNews.player_id).toBe(10)
        expect(insertedNews.team_id).toBe(2)
        expect(insertedNews.level).toBe(1)
        expect(insertedNews.league).toBe(1)
      })

      it('does not create transfer news when no transfers occurred', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        query.mockResolvedValueOnce([]) // No standing games
        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )
        expect(insertCalls.length).toBe(0)
      })
    })

    describe('highest win news', () => {
      it('creates news for game with highest goal difference', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers

        // Highest win query - FOUND
        query.mockResolvedValueOnce([{
          id: 1,
          team_1_id: 1,
          team_2_id: 2,
          goals_team_1: 5,
          goals_team_2: 1,
          team1_name: 'Dominant FC',
          team2_name: 'Weak United',
          goal_diff: 4,
          game_day: 5,
          season: 1,
          level: 1,
          league: 1
        }])

        // Insert HIGHEST_WIN news
        query.mockResolvedValueOnce({ insertId: 1 })

        query.mockResolvedValueOnce([]) // No standing games
        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('HIGHEST_WIN')
        expect(insertedNews.title).toContain('Dominant FC')
        expect(insertedNews.title).toContain('4')
        expect(insertedNews.text).toContain('5-1')
        expect(insertedNews.team_id).toBe(1)
      })

      it('creates news for team 2 when they are the winner', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers

        query.mockResolvedValueOnce([{
          id: 1,
          team_1_id: 1,
          team_2_id: 2,
          goals_team_1: 0,
          goals_team_2: 4,
          team1_name: 'Home Team',
          team2_name: 'Away Winners',
          goal_diff: 4,
          game_day: 5,
          season: 1,
          level: 1,
          league: 1
        }])

        // Insert HIGHEST_WIN news
        query.mockResolvedValueOnce({ insertId: 1 })

        query.mockResolvedValueOnce([]) // No standing games
        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('HIGHEST_WIN')
        expect(insertedNews.title).toContain('Away Winners')
        expect(insertedNews.team_id).toBe(2)
      })

      it('does not create news for wins with less than 2 goal difference', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers

        query.mockResolvedValueOnce([{
          id: 1,
          team_1_id: 1,
          team_2_id: 2,
          goals_team_1: 2,
          goals_team_2: 1,
          team1_name: 'Home Team',
          team2_name: 'Away Team',
          goal_diff: 1, // Only 1 goal difference
          game_day: 5,
          season: 1,
          level: 1,
          league: 1
        }])

        query.mockResolvedValueOnce([]) // No standing games
        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )
        expect(insertCalls.length).toBe(0)
      })
    })

    describe('standing position news', () => {
      it('creates news when a new team takes first place', async () => {
        const team1 = testData.team({ id: 1, name: 'New Leaders FC' })
        const team2 = testData.team({ id: 2, name: 'Former Leaders' })

        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins

        // Current games - Team 1 has 6 points (2 wins), Team 2 has 6 points but worse goal diff
        query.mockResolvedValueOnce([
          testData.gameResult({ id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 3, goals_team_2: 0, game_day: 5 }),
          testData.gameResult({ id: 2, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1, game_day: 4 }),
          testData.gameResult({ id: 3, team_1_id: 2, team_2_id: 1, goals_team_1: 1, goals_team_2: 0, game_day: 3 }),
          testData.gameResult({ id: 4, team_1_id: 2, team_2_id: 1, goals_team_1: 2, goals_team_2: 0, game_day: 2 })
        ])

        // Teams query
        query.mockResolvedValueOnce([team1, team2])

        // Previous games - Team 2 was leading
        query.mockResolvedValueOnce([
          testData.gameResult({ id: 2, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 1, game_day: 4 }),
          testData.gameResult({ id: 3, team_1_id: 2, team_2_id: 1, goals_team_1: 1, goals_team_2: 0, game_day: 3 }),
          testData.gameResult({ id: 4, team_1_id: 2, team_2_id: 1, goals_team_1: 2, goals_team_2: 0, game_day: 2 })
        ])

        // Insert POSITION_FIRST news (happens inside _generateStandingNews)
        query.mockResolvedValueOnce({ insertId: 1 })

        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('POSITION_FIRST')
        expect(insertedNews.title).toContain('New Leaders FC')
        expect(insertedNews.team_id).toBe(1)
      })

      it('does not create standing news on game day 1', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        // Standing news is skipped for gameDay < 2, so no standing queries
        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(1, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )
        expect(insertCalls.length).toBe(0)
      })

      it('does not create last place news for leagues with less than 10 teams', async () => {
        const team1 = testData.team({ id: 1, name: 'Team A' })
        const team2 = testData.team({ id: 2, name: 'Team B' })

        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins

        // Current games - Only 2 teams
        query.mockResolvedValueOnce([
          testData.gameResult({ id: 1, team_1_id: 1, team_2_id: 2, goals_team_1: 2, goals_team_2: 0, game_day: 5 }),
          testData.gameResult({ id: 2, team_1_id: 2, team_2_id: 1, goals_team_1: 0, goals_team_2: 1, game_day: 4 })
        ])
        query.mockResolvedValueOnce([team1, team2])
        query.mockResolvedValueOnce([
          testData.gameResult({ id: 2, team_1_id: 2, team_2_id: 1, goals_team_1: 0, goals_team_2: 1, game_day: 4 })
        ])

        query.mockResolvedValueOnce([]) // No level ups
        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        // Should only have POSITION_FIRST if any, not POSITION_LAST
        const positionLastCalls = insertCalls.filter(call =>
          call[1].type === 'POSITION_LAST'
        )
        expect(positionLastCalls.length).toBe(0)
      })
    })

    describe('stadium extension news', () => {
      it('creates news for stadium expansions', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        query.mockResolvedValueOnce([]) // No standing games
        query.mockResolvedValueOnce([]) // No level ups

        // Stadium expansion - FOUND
        query.mockResolvedValueOnce([{
          id: 1,
          team_id: 1,
          team_name: 'Building FC',
          value: -100000,
          reason: 'Stadium construction build',
          game_day: 5,
          season: 1,
          level: 1,
          league: 1
        }])

        // Insert STADIUM_EXTENSION news
        query.mockResolvedValueOnce({ insertId: 1 })

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('STADIUM_EXTENSION')
        expect(insertedNews.title).toContain('Building FC')
        expect(insertedNews.team_id).toBe(1)
      })
    })

    describe('level up news', () => {
      it('creates news for significant level ups (level 4, 7, 10)', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        query.mockResolvedValueOnce([]) // No standing games

        // Level up to level 7 - FOUND
        query.mockResolvedValueOnce([{
          id: 1,
          player_id: 10,
          player_name: 'Rising Star',
          new_level: 7,
          team_name: 'Development FC',
          current_team_id: 1,
          game_day: 5,
          season: 1,
          type: 'LEVEL_UP'
        }])

        // Insert LEVEL_UP news
        query.mockResolvedValueOnce({ insertId: 1 })

        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(1)
        const insertedNews = insertCalls[0][1]
        expect(insertedNews.type).toBe('LEVEL_UP')
        expect(insertedNews.title).toContain('Rising Star')
        expect(insertedNews.text).toContain('7') // Level is in the text
        expect(insertedNews.player_id).toBe(10)
        expect(insertedNews.team_id).toBe(1)
      })

      it('does not create news for non-significant level ups', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        query.mockResolvedValueOnce([]) // No standing games

        // Level up to level 5 (not significant)
        query.mockResolvedValueOnce([{
          id: 1,
          player_id: 10,
          player_name: 'Regular Player',
          new_level: 5,
          team_name: 'Some FC',
          current_team_id: 1,
          game_day: 5,
          season: 1,
          type: 'LEVEL_UP'
        }])

        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )
        expect(insertCalls.length).toBe(0)
      })

      it('creates news for level 4 and level 10', async () => {
        query.mockResolvedValueOnce([{ level: 1, league: 1 }])
        query.mockResolvedValueOnce([]) // No transfers
        query.mockResolvedValueOnce([]) // No high wins
        query.mockResolvedValueOnce([]) // No standing games

        // Multiple level ups - both significant
        query.mockResolvedValueOnce([
          {
            id: 1,
            player_id: 10,
            player_name: 'Player A',
            new_level: 10,
            team_name: 'Team A',
            current_team_id: 1,
            game_day: 5,
            season: 1,
            type: 'LEVEL_UP'
          },
          {
            id: 2,
            player_id: 11,
            player_name: 'Player B',
            new_level: 4,
            team_name: 'Team B',
            current_team_id: 2,
            game_day: 5,
            season: 1,
            type: 'LEVEL_UP'
          }
        ])

        // Insert LEVEL_UP news for level 10
        query.mockResolvedValueOnce({ insertId: 1 })
        // Insert LEVEL_UP news for level 4
        query.mockResolvedValueOnce({ insertId: 2 })

        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(2)
        expect(insertCalls[0][1].type).toBe('LEVEL_UP')
        expect(insertCalls[0][1].text).toContain('level 10') // Level is in the text
        expect(insertCalls[1][1].type).toBe('LEVEL_UP')
        expect(insertCalls[1][1].text).toContain('level 4') // Level is in the text
      })
    })

    describe('multiple leagues', () => {
      it('generates news for each league separately', async () => {
        query.mockResolvedValueOnce([
          { level: 1, league: 1 },
          { level: 1, league: 2 }
        ])

        // League 1 queries
        query.mockResolvedValueOnce([{
          id: 1,
          player_id: 10,
          from_team_id: 1,
          to_team_id: 2,
          price: 100000,
          player_name: 'Player 1',
          from_team_name: 'Team A',
          to_team_name: 'Team B'
        }])
        // Insert for league 1 transfer
        query.mockResolvedValueOnce({ insertId: 1 })
        query.mockResolvedValueOnce([]) // No high wins league 1
        query.mockResolvedValueOnce([]) // No standing games league 1
        query.mockResolvedValueOnce([]) // No level ups league 1

        // League 2 queries
        query.mockResolvedValueOnce([{
          id: 2,
          player_id: 20,
          from_team_id: 3,
          to_team_id: 4,
          price: 200000,
          player_name: 'Player 2',
          from_team_name: 'Team C',
          to_team_name: 'Team D'
        }])
        // Insert for league 2 transfer
        query.mockResolvedValueOnce({ insertId: 2 })
        query.mockResolvedValueOnce([]) // No high wins league 2
        query.mockResolvedValueOnce([]) // No standing games league 2
        query.mockResolvedValueOnce([]) // No level ups league 2

        query.mockResolvedValueOnce([]) // No stadium expansions

        await generateNewsForGameDay(5, 1)

        const insertCalls = query.mock.calls.filter(call =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO news')
        )

        expect(insertCalls.length).toBe(2)
        expect(insertCalls[0][1].league).toBe(1)
        expect(insertCalls[1][1].league).toBe(2)
      })
    })
  })

  describe('getNewsByLeague', () => {
    it('returns news filtered by game day, season, level, and league', async () => {
      const newsItems = [
        { id: 1, type: 'TRANSFER', title: 'Transfer News', game_day: 5, season: 1, level: 1, league: 1 },
        { id: 2, type: 'HIGHEST_WIN', title: 'Big Win', game_day: 5, season: 1, level: 1, league: 1 }
      ]

      query.mockResolvedValueOnce(newsItems)

      const result = await getNewsByLeague(5, 1, 1, 1)

      expect(result).toEqual(newsItems)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM news WHERE game_day=? AND season=? AND level=? AND league=? ORDER BY created_at DESC',
        [5, 1, 1, 1]
      )
    })

    it('returns empty array when no news exists', async () => {
      query.mockResolvedValueOnce([])

      const result = await getNewsByLeague(5, 1, 1, 1)

      expect(result).toEqual([])
    })
  })
})
