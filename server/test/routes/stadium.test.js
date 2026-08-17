import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 5, season: 1 })
}))

vi.mock('../../helper/stadiumHelper.js', () => ({
  getStadiumOfCurrentUser: vi.fn(),
  calcuateStadiumBuild: vi.fn(),
  buildStadium: vi.fn(),
  getConstructionInfo: vi.fn().mockReturnValue({
    north: { underConstruction: false },
    south: { underConstruction: false },
    east: { underConstruction: false },
    west: { underConstruction: false }
  }),
  isStandUnderConstruction: vi.fn().mockReturnValue(false),
  calculateConstructionTime: vi.fn().mockReturnValue(3)
}))

import { query } from '../../lib/database.js'
import { getStadiumOfCurrentUser, calcuateStadiumBuild, buildStadium, getConstructionInfo, isStandUnderConstruction } from '../../helper/stadiumHelper.js'
import handlers from '../../routes/stadium.js'

describe('stadium routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getStadiumByTeamId', () => {
    it('returns stadium for team id', async () => {
      const stadium = testData.stadium()
      query.mockResolvedValue([stadium])

      const result = await handlers.getStadiumByTeamId(1)

      expect(result).toEqual(stadium)
      expect(query).toHaveBeenCalledWith('SELECT * FROM stadium WHERE team_id=? LIMIT 1', [1])
    })
  })

  describe('getStadium', () => {
    it('returns stadium for current user with construction info', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)

      const req = createMockRequest()
      const result = await handlers.getStadium(req)

      expect(result.stadium).toEqual(stadium)
      expect(result.constructionInfo).toBeDefined()
      expect(getConstructionInfo).toHaveBeenCalled()
    })
  })

  describe('calculateStadiumPrice', () => {
    it('calculates price and construction times for stadium upgrade', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)

      const req = createMockRequest()
      const result = await handlers.calculateStadiumPrice(plannedStadium, req)

      expect(result.totalPrice).toEqual(500000)
      expect(result.constructionTimes).toBeDefined()
      expect(result.constructionTimes.north).toBeDefined()
    })

    it('throws error for unauthorized stadium', async () => {
      const currentStadium = testData.stadium({ id: 1 })
      const plannedStadium = testData.stadium({ id: 999 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)

      const req = createMockRequest()

      await expect(handlers.calculateStadiumPrice(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('reports construction time for an expanded corner stand', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ corner_ne_stand_size: 500 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(300000)

      const req = createMockRequest()
      const result = await handlers.calculateStadiumPrice(plannedStadium, req)

      expect(result.totalPrice).toEqual(300000)
      expect(result.constructionTimes.corner_ne).toBeDefined()
      expect(result.constructionTimes.corner_ne.seatsDiff).toBe(500)
    })

    it('flags a stand that gets a brand new roof', async () => {
      getStadiumOfCurrentUser.mockResolvedValue(testData.stadium())
      calcuateStadiumBuild.mockReturnValue(600000)

      const result = await handlers.calculateStadiumPrice(
        testData.stadium({ north_stand_size: 6000, north_stand_roof: 1 }),
        createMockRequest()
      )

      expect(result.constructionTimes.north).toMatchObject({
        addingRoof: true,
        extendingRoof: false,
        removingRoof: false
      })
    })

    it('flags a roofed stand that grows and keeps its roof as a roof extension', async () => {
      getStadiumOfCurrentUser.mockResolvedValue(testData.stadium({ north_stand_roof: 1 }))
      calcuateStadiumBuild.mockReturnValue(600000)

      const result = await handlers.calculateStadiumPrice(
        testData.stadium({ north_stand_size: 6000, north_stand_roof: 1 }),
        createMockRequest()
      )

      expect(result.constructionTimes.north).toMatchObject({
        addingRoof: false,
        extendingRoof: true,
        removingRoof: false
      })
    })

    it('flags a stand whose roof gets torn down', async () => {
      getStadiumOfCurrentUser.mockResolvedValue(testData.stadium({ north_stand_roof: 1 }))
      calcuateStadiumBuild.mockReturnValue(500000)

      const result = await handlers.calculateStadiumPrice(
        testData.stadium({ north_stand_size: 6000, north_stand_roof: 0 }),
        createMockRequest()
      )

      expect(result.constructionTimes.north).toMatchObject({
        addingRoof: false,
        extendingRoof: false,
        removingRoof: true
      })
    })
  })

  describe('buildStadium', () => {
    it('starts construction when user has enough money', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })
      const team = testData.team({ balance: 1000000 })
      const constructionInfo = {
        north: { underConstruction: true, remainingGameDays: 5 },
        south: { underConstruction: false },
        east: { underConstruction: false },
        west: { underConstruction: false }
      }

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)
      query.mockResolvedValue([team])
      buildStadium.mockResolvedValue({ constructionInfo })

      const req = createMockRequest()
      const result = await handlers.buildStadium(plannedStadium, req)

      expect(result.success).toBe(true)
      expect(result.constructionInfo).toEqual(constructionInfo)
      expect(buildStadium).toHaveBeenCalledWith(team, currentStadium, plannedStadium, 500000)
    })

    it('throws error when not enough money', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })
      const team = testData.team({ balance: 100000 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)
      query.mockResolvedValue([team])

      const req = createMockRequest()

      await expect(handlers.buildStadium(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Not enough money' })
    })

    it('throws error when stand is already under construction', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })
      const team = testData.team({ balance: 1000000 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)
      query.mockResolvedValue([team])
      isStandUnderConstruction.mockReturnValue(true)

      const req = createMockRequest()

      await expect(handlers.buildStadium(plannedStadium, req))
        .rejects.toMatchObject({ message: 'This stand is already under construction' })
    })
  })

  describe('getStadiumAttendance', () => {
    /**
     * @param {object} overrides
     * @returns {object}
     */
    function gameRow (overrides = {}) {
      return {
        gameId: 1,
        season: 0,
        gameDay: 5,
        matchDay: 6,
        cupRound: null,
        gameType: 'league',
        stadiumDetails: { northGuests: 4000, southGuests: 3500, eastGuests: 2000, westGuests: 2000 },
        opponentId: 2,
        opponentName: 'FC Test',
        opponentShortName: 'Test',
        opponentEmblem: 'shield|solid|#fff',
        opponentColor: '#fff',
        ...overrides
      }
    }

    it('returns attendance data for past home games', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      const games = [
        gameRow(),
        gameRow({ gameId: 2, gameDay: 3, matchDay: 4, stadiumDetails: { northGuests: 4500 } })
      ]
      // First query is for the team, second for games
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce(games)

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance).toHaveLength(2)
      expect(result.attendance[0].stands.north.guests).toBe(4000)
      expect(result.attendance[0].stands.north.percentage).toBe(80)
      expect(result.attendance[0].season).toBe(0)
      expect(result.attendance[0].gameDay).toBe(5)
      expect(result.attendance[0].gameId).toBe(1)
      expect(result.attendance[0].matchDay).toBe(6)
      expect(result.attendance[0].gameType).toBe('league')
      expect(result.attendance[0].opponent).toEqual({
        id: 2,
        name: 'FC Test',
        short_name: 'Test',
        emblem: 'shield|solid|#fff',
        color: '#fff'
      })
    })

    it('includes cup and friendly home games', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      const games = [
        gameRow({ gameId: 1, gameType: 'cup', cupRound: 8, matchDay: null }),
        gameRow({ gameId: 2, gameType: 'friendly', matchDay: null })
      ]
      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(games)
        .mockResolvedValueOnce([{ season: 0, maxRound: 32 }])

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance.map(row => row.gameType)).toEqual(['cup', 'friendly'])
      // 32 teams in the first round → 6 rounds in total
      expect(result.attendance[0].totalCupRounds).toBe(6)
      expect(result.attendance[0].cupRound).toBe(8)
    })

    it('does not query cup rounds when there is no cup game', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce([gameRow()])

      const req = createMockRequest()
      await handlers.getStadiumAttendance(req)

      expect(query).toHaveBeenCalledTimes(2)
    })

    it('returns empty attendance when no home games played', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce([])

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance).toEqual([])
    })

    it('handles missing stadiumDetails gracefully', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce([gameRow({ stadiumDetails: null })])

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance).toHaveLength(1)
      expect(result.attendance[0].stands.north.guests).toBe(0)
      expect(result.attendance[0].stands.north.percentage).toBe(0)
    })

    it('parses stadiumDetails that arrive as a JSON string', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce([
        gameRow({ stadiumDetails: JSON.stringify({ northGuests: 2500 }) })
      ])

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance[0].stands.north.percentage).toBe(50)
    })

    it('caps the percentage at 100 for stands that have grown since the game', async () => {
      const stadium = testData.stadium({ north_stand_size: 1000 })
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const team = testData.team()
      query.mockResolvedValueOnce([team]).mockResolvedValueOnce([
        gameRow({ stadiumDetails: { northGuests: 4000 } })
      ])

      const req = createMockRequest()
      const result = await handlers.getStadiumAttendance(req)

      expect(result.attendance[0].stands.north.percentage).toBe(100)
    })
  })

  describe('getConstructionHistory', () => {
    it('returns construction history for current user stadium', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      const history = [
        { id: 1, stadium_id: 1, stand: 'north', old_size: 5000, new_size: 8000, added_roof: 1, started_game_day: 5, started_season: 0, completed_game_day: 10, completed_season: 0 }
      ]
      query.mockResolvedValue(history)

      const req = createMockRequest()
      const result = await handlers.getConstructionHistory(req)

      expect(result.history).toEqual(history)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM stadium_construction_history WHERE stadium_id=? ORDER BY created_at DESC',
        [1]
      )
    })

    it('returns empty history for new stadium', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)
      query.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getConstructionHistory(req)

      expect(result.history).toEqual([])
    })
  })

  describe('updatePrices', () => {
    it('updates stadium prices', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({
        north_stand_price: 25,
        south_stand_price: 25,
        east_stand_price: 25,
        west_stand_price: 25
      })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updatePrices(plannedStadium, req)

      expect(result).toEqual({ success: true })
    })

    it('throws error for invalid price', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_price: 0 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)

      const req = createMockRequest()

      await expect(handlers.updatePrices(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Invalid ticket price' })
    })

    it('throws error for price over 100', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_price: 150 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)

      const req = createMockRequest()

      await expect(handlers.updatePrices(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Invalid ticket price' })
    })
  })
})
