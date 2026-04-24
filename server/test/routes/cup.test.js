import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/cupHelper.js', () => ({
  getCupGamesForTeam: vi.fn(),
  getCupResultsForRound: vi.fn(),
  getCupRoundsForSeason: vi.fn(),
  getCupSeasons: vi.fn(),
  getCupBracket: vi.fn(),
  getTotalRoundsForSeason: vi.fn().mockResolvedValue(5),
  getTotalRounds: vi.fn(maxRound => {
    if (!maxRound || maxRound < 1) return 0
    return Math.log2(maxRound) + 1
  })
}))

import { getTeam } from '../../helper/teamHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import {
  getCupGamesForTeam,
  getCupResultsForRound,
  getCupRoundsForSeason,
  getCupSeasons,
  getCupBracket
} from '../../helper/cupHelper.js'
import cupRoutes from '../../routes/cup.js'

describe('cup routes', () => {
  const mockReq = { user: { id: 1 } }
  const mockTeam = { id: 1, name: 'Test Team' }

  beforeEach(() => {
    vi.clearAllMocks()
    getTeam.mockResolvedValue(mockTeam)
    getGameDayAndSeason.mockResolvedValue({ season: 1, gameDay: 10 })
  })

  describe('getCupResults', () => {
    it('returns cup results for a round', async () => {
      const mockResults = [
        { id: 1, team1: 'Team A', team2: 'Team B', goalsTeam1: 2, goalsTeam2: 1 }
      ]
      const mockRounds = [{ round: 32, played: true }, { round: 16, played: false }]

      getCupRoundsForSeason.mockResolvedValue(mockRounds)
      getCupResultsForRound.mockResolvedValue(mockResults)

      const result = await cupRoutes.getCupResults(1, 32, mockReq)

      expect(result.results).toEqual(mockResults)
      expect(result.round).toEqual({ round: 32, played: true })
      expect(result.rounds).toEqual(mockRounds)
    })

    it('uses current season if not specified', async () => {
      getCupRoundsForSeason.mockResolvedValue([{ round: 32 }])
      getCupResultsForRound.mockResolvedValue([])

      const result = await cupRoutes.getCupResults(null, 32, mockReq)

      expect(result.season).toBe(1) // Current season from mock
    })

    it('defaults to first round if round not specified', async () => {
      getCupRoundsForSeason.mockResolvedValue([{ round: 64 }, { round: 32 }])
      getCupResultsForRound.mockResolvedValue([])

      await cupRoutes.getCupResults(1, null, mockReq)

      expect(getCupResultsForRound).toHaveBeenCalledWith(1, 64)
    })

    it('returns empty results when no rounds exist', async () => {
      getCupRoundsForSeason.mockResolvedValue([])

      const result = await cupRoutes.getCupResults(1, null, mockReq)

      expect(result.results).toEqual([])
      expect(result.rounds).toEqual([])
    })

    it('throws error for unauthorized user', async () => {
      await expect(cupRoutes.getCupResults(1, 32, { user: null }))
        .rejects.toThrow('Not authorized')
    })
  })

  describe('getMyCupGames', () => {
    it('returns cup games for user team', async () => {
      const mockGames = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1, team1: 'Test Team', team2: 'Opponent', cupRound: 32
      }))
      getCupGamesForTeam.mockResolvedValue(mockGames)

      const result = await cupRoutes.getMyCupGames(10, mockReq)

      expect(result.games.length).toBe(10)
      expect(getCupGamesForTeam).toHaveBeenCalledWith(1, 1, 10)
    })

    it('only returns games from current season even if fewer than limit', async () => {
      getCupGamesForTeam
        .mockResolvedValueOnce([{ id: 1 }]) // Current season - only 1 game

      const result = await cupRoutes.getMyCupGames(5, mockReq)

      expect(result.games.length).toBe(1)
      expect(getCupGamesForTeam).toHaveBeenCalledTimes(1)
    })

    it('throws error for unauthorized user', async () => {
      await expect(cupRoutes.getMyCupGames(10, { user: null }))
        .rejects.toThrow('Not authorized')
    })
  })

  describe('getCupBracket', () => {
    it('returns cup bracket for a season', async () => {
      const mockBracket = {
        32: { games: [], played: true },
        16: { games: [], played: false }
      }
      getCupBracket.mockResolvedValue(mockBracket)

      const result = await cupRoutes.getCupBracket(1, mockReq)

      expect(result.bracket).toEqual(mockBracket)
      expect(result.season).toBe(1)
    })

    it('uses current season if not specified', async () => {
      getCupBracket.mockResolvedValue({})

      const result = await cupRoutes.getCupBracket(null, mockReq)

      expect(result.season).toBe(1)
    })
  })

  describe('getAvailableCupSeasons', () => {
    it('returns all seasons with cup data', async () => {
      getCupSeasons.mockResolvedValue([2, 1])

      const result = await cupRoutes.getAvailableCupSeasons(mockReq)

      expect(result.seasons).toEqual([2, 1])
    })

    it('returns empty array when no cup data', async () => {
      getCupSeasons.mockResolvedValue([])

      const result = await cupRoutes.getAvailableCupSeasons(mockReq)

      expect(result.seasons).toEqual([])
    })
  })

  describe('getCupRounds', () => {
    it('returns cup rounds for a season', async () => {
      const mockRounds = [
        { round: 32, played: true },
        { round: 16, played: false }
      ]
      getCupRoundsForSeason.mockResolvedValue(mockRounds)

      const result = await cupRoutes.getCupRounds(1, mockReq)

      expect(result.rounds).toEqual(mockRounds)
      expect(result.season).toBe(1)
    })
  })
})
