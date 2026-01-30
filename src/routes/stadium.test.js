import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/stadiumHelper.js', () => ({
  getStadiumOfCurrentUser: vi.fn(),
  calcuateStadiumBuild: vi.fn(),
  buildStadium: vi.fn()
}))

import { query } from '../lib/database.js'
import { getStadiumOfCurrentUser, calcuateStadiumBuild, buildStadium } from '../helper/stadiumHelper.js'
import handlers from './stadium.js'

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
    it('returns stadium for current user', async () => {
      const stadium = testData.stadium()
      getStadiumOfCurrentUser.mockResolvedValue(stadium)

      const req = createMockRequest()
      const result = await handlers.getStadium(req)

      expect(result).toEqual({ stadium })
    })
  })

  describe('calculateStadiumPrice', () => {
    it('calculates price for stadium upgrade', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)

      const req = createMockRequest()
      const result = await handlers.calculateStadiumPrice(plannedStadium, req)

      expect(result).toEqual({ totalPrice: 500000 })
    })

    it('throws error for unauthorized stadium', async () => {
      const currentStadium = testData.stadium({ id: 1 })
      const plannedStadium = testData.stadium({ id: 999 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)

      const req = createMockRequest()

      await expect(handlers.calculateStadiumPrice(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Not your stadium dude' })
    })
  })

  describe('buildStadium', () => {
    it('builds stadium when user has enough money', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_size: 10000 })
      const team = testData.team({ balance: 1000000 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)
      calcuateStadiumBuild.mockReturnValue(500000)
      query.mockResolvedValue([team])
      buildStadium.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.buildStadium(plannedStadium, req)

      expect(result).toEqual({ success: true })
      expect(buildStadium).toHaveBeenCalledWith(team, plannedStadium, 500000)
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
        .rejects.toMatchObject({ message: 'Not enough money...' })
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
        .rejects.toMatchObject({ message: 'Price needs to be a integer number greater than 0 and less than 100.' })
    })

    it('throws error for price over 100', async () => {
      const currentStadium = testData.stadium()
      const plannedStadium = testData.stadium({ north_stand_price: 150 })

      getStadiumOfCurrentUser.mockResolvedValue(currentStadium)

      const req = createMockRequest()

      await expect(handlers.updatePrices(plannedStadium, req))
        .rejects.toMatchObject({ message: 'Price needs to be a integer number greater than 0 and less than 100.' })
    })
  })
})
