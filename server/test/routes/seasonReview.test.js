import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/standingHelper.js', () => ({
  getCachedStanding: vi.fn()
}))

vi.mock('../../helper/playerStatsHelper.js', () => ({
  getTopScorers: vi.fn()
}))

vi.mock('../../lib/util.js', () => ({
  calculateStanding: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getCachedStanding } from '../../helper/standingHelper.js'
import { getTopScorers } from '../../helper/playerStatsHelper.js'
import handlers from '../../routes/seasonReview.js'

const userTeam = testData.team({ id: 100, level: 1, league: 0, name: 'User FC' })

function mockStanding (totalTeams, userPosition) {
  const standing = []
  for (let i = 0; i < totalTeams; i++) {
    const id = i + 1
    standing.push({
      team: { id, name: `Team ${id}`, color: '#fff', emblem: '{}' },
      points: 80 - i * 4,
      wins: 0,
      draws: 0,
      losses: 0
    })
  }
  if (userPosition > 0 && userPosition <= totalTeams) {
    standing[userPosition - 1].team.id = userTeam.id
    standing[userPosition - 1].team.name = userTeam.name
  }
  return standing
}

describe('seasonReview routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSeasonReview', () => {
    it('returns isSeasonEnd:false when unauthenticated', async () => {
      const result = await handlers.getSeasonReview({ user: null })
      expect(result).toEqual({ isSeasonEnd: false })
    })

    it('returns isSeasonEnd:false when there are still unplayed games', async () => {
      query.mockResolvedValueOnce([{ unplayedCount: 5 }])
      const result = await handlers.getSeasonReview(createMockRequest())
      expect(result).toEqual({ isSeasonEnd: false })
      expect(getTeam).not.toHaveBeenCalled()
    })

    it('builds review when season ended: champion at top league', async () => {
      const champTeam = { ...userTeam, level: 0, league: 0 }
      const standing = mockStanding(18, 1)
      // Refresh team rows
      const freshTeams = standing.map(s => ({ ...s.team }))

      query
        .mockResolvedValueOnce([{ unplayedCount: 0 }]) // unplayed check
        .mockResolvedValueOnce([{ season: 2, gameDay: 34 }]) // last played season for user's league
        .mockResolvedValueOnce([{ gameDay: 34 }]) // final game day
        .mockResolvedValueOnce(freshTeams) // refresh team display fields
        .mockResolvedValueOnce([null]) // cup winner row (none)
        .mockResolvedValueOnce([{ maxLevel: 3 }]) // max level

      getTeam.mockResolvedValue(champTeam)
      getCachedStanding.mockResolvedValue(standing)
      getTopScorers.mockResolvedValue([
        { id: 7, name: 'Striker McGoals', goals: 27, team: { id: 5, name: 'Team 5', color: '#fff', emblem: '{}' } }
      ])

      const result = await handlers.getSeasonReview(createMockRequest())

      expect(result.isSeasonEnd).toBe(true)
      expect(result.season).toBe(2)
      expect(result.position).toBe(1)
      expect(result.outcome).toBe('champion')
      expect(result.leagueChampion.teamId).toBe(champTeam.id)
      expect(result.leagueChampion.isUser).toBe(true)
      expect(result.topScorer.goals).toBe(27)
      expect(result.relegatedTeams).toHaveLength(4)
      expect(result.cupWinner).toBeNull()
      expect(result.userWonCup).toBe(false)
    })

    it('flags outcome as promoted when finishing top 2 in a non-top league', async () => {
      const standing = mockStanding(18, 2)
      const freshTeams = standing.map(s => ({ ...s.team }))

      query
        .mockResolvedValueOnce([{ unplayedCount: 0 }])
        .mockResolvedValueOnce([{ season: 3, gameDay: 34 }])
        .mockResolvedValueOnce([{ gameDay: 34 }])
        .mockResolvedValueOnce(freshTeams)
        .mockResolvedValueOnce([null])
        .mockResolvedValueOnce([{ maxLevel: 3 }])

      getTeam.mockResolvedValue({ ...userTeam, level: 1 })
      getCachedStanding.mockResolvedValue(standing)
      getTopScorers.mockResolvedValue([])

      const result = await handlers.getSeasonReview(createMockRequest())
      expect(result.outcome).toBe('promoted')
      expect(result.position).toBe(2)
    })

    it('flags outcome as relegated when finishing in the last 4 (and a lower league exists)', async () => {
      const standing = mockStanding(18, 17)
      const freshTeams = standing.map(s => ({ ...s.team }))

      query
        .mockResolvedValueOnce([{ unplayedCount: 0 }])
        .mockResolvedValueOnce([{ season: 4, gameDay: 34 }])
        .mockResolvedValueOnce([{ gameDay: 34 }])
        .mockResolvedValueOnce(freshTeams)
        .mockResolvedValueOnce([null])
        .mockResolvedValueOnce([{ maxLevel: 3 }])

      getTeam.mockResolvedValue({ ...userTeam, level: 1 })
      getCachedStanding.mockResolvedValue(standing)
      getTopScorers.mockResolvedValue([])

      const result = await handlers.getSeasonReview(createMockRequest())
      expect(result.outcome).toBe('relegated')
      expect(result.position).toBe(17)
    })

    it('does not flag relegation when the team is already in the lowest league', async () => {
      const standing = mockStanding(18, 18)
      const freshTeams = standing.map(s => ({ ...s.team }))

      query
        .mockResolvedValueOnce([{ unplayedCount: 0 }])
        .mockResolvedValueOnce([{ season: 4, gameDay: 34 }])
        .mockResolvedValueOnce([{ gameDay: 34 }])
        .mockResolvedValueOnce(freshTeams)
        .mockResolvedValueOnce([null])
        .mockResolvedValueOnce([{ maxLevel: 3 }])

      // team.level === maxLevel → cannot relegate
      getTeam.mockResolvedValue({ ...userTeam, level: 3 })
      getCachedStanding.mockResolvedValue(standing)
      getTopScorers.mockResolvedValue([])

      const result = await handlers.getSeasonReview(createMockRequest())
      expect(result.outcome).toBe('lowerHalf')
      expect(result.relegatedTeams).toEqual([])
    })

    it('includes cup winner and sets userWonCup when the user team is the cup winner', async () => {
      const standing = mockStanding(18, 10)
      const freshTeams = standing.map(s => ({ ...s.team }))

      query
        .mockResolvedValueOnce([{ unplayedCount: 0 }])
        .mockResolvedValueOnce([{ season: 5, gameDay: 34 }])
        .mockResolvedValueOnce([{ gameDay: 34 }])
        .mockResolvedValueOnce(freshTeams)
        .mockResolvedValueOnce([{
          team_id: userTeam.id,
          user_id: 1,
          team_name: userTeam.name,
          emblem: '{}',
          color: '#FF0000',
          username: 'testuser'
        }])
        .mockResolvedValueOnce([{ maxLevel: 3 }])

      getTeam.mockResolvedValue({ ...userTeam, level: 1 })
      getCachedStanding.mockResolvedValue(standing)
      getTopScorers.mockResolvedValue([])

      const result = await handlers.getSeasonReview(createMockRequest())
      expect(result.cupWinner).not.toBeNull()
      expect(result.cupWinner.teamId).toBe(userTeam.id)
      expect(result.cupWinner.isUser).toBe(true)
      expect(result.userWonCup).toBe(true)
    })
  })
})
