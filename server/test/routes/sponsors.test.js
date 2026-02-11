import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn(),
  getSponsorOffers: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getSponsor, getSponsorOffers } from '../../helper/sponsorHelper.js'
import handlers, { clearAllSponsorOffersCache } from '../../routes/sponsors.js'

describe('sponsors routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllSponsorOffersCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getSponsor', () => {
    it('returns sponsor for authenticated user', async () => {
      const team = testData.team()
      const sponsor = testData.sponsor()

      getTeam.mockResolvedValue(team)
      getSponsor.mockResolvedValue({ sponsor })

      const req = createMockRequest()
      const result = await handlers.getSponsor(req)

      expect(result).toEqual({ sponsor })
      expect(getTeam).toHaveBeenCalledWith(req)
    })

    it('returns null sponsor when no sponsor', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      getSponsor.mockResolvedValue({ sponsor: null })

      const req = createMockRequest()
      const result = await handlers.getSponsor(req)

      expect(result).toEqual({ sponsor: null })
    })
  })

  describe('getSponsorOffers', () => {
    it('returns sponsor offers for authenticated user', async () => {
      const team = testData.team()
      const sponsors = [
        testData.sponsor({ id: 1, name: 'Sponsor A' }),
        testData.sponsor({ id: 2, name: 'Sponsor B' })
      ]

      getTeam.mockResolvedValue(team)
      getSponsorOffers.mockResolvedValue(sponsors)

      const req = createMockRequest()
      const result = await handlers.getSponsorOffers(req)

      expect(result).toEqual({ sponsors })
      expect(getTeam).toHaveBeenCalledWith(req)
      expect(getSponsorOffers).toHaveBeenCalledWith(team)
    })
  })

  describe('chooseSponsor', () => {
    it('creates sponsor for team', async () => {
      const team = testData.team()
      const sponsor = {
        name: 'New Sponsor',
        value: 5000,
        duration: 10,
        start_season: 0,
        start_game_day: 1
      }

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({ insertId: 1 })

      const req = createMockRequest()
      const result = await handlers.chooseSponsor(sponsor, req)

      expect(result).toBe(true)
      expect(query).toHaveBeenCalledWith('INSERT INTO sponsor SET ?', expect.objectContaining({
        name: 'New Sponsor',
        value: 5000,
        duration: 10,
        team_id: team.id
      }))
    })
  })

  describe('sponsor offers cache', () => {
    it('returns cached offers on subsequent requests for same team', async () => {
      const team = testData.team({ id: 1 })
      const sponsors = [
        testData.sponsor({ id: 1, name: 'Sponsor A' }),
        testData.sponsor({ id: 2, name: 'Sponsor B' })
      ]

      getTeam.mockResolvedValue(team)
      getSponsorOffers.mockResolvedValue(sponsors)

      const req = createMockRequest()

      // First request - should call getSponsorOffers
      const result1 = await handlers.getSponsorOffers(req)
      expect(result1).toEqual({ sponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(1)

      // Second request - should return cached offers, not call getSponsorOffers again
      const result2 = await handlers.getSponsorOffers(req)
      expect(result2).toEqual({ sponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(1) // Still only 1 call
    })

    it('caches offers per team (different teams get separate caches)', async () => {
      const team1 = testData.team({ id: 1 })
      const team2 = testData.team({ id: 2 })
      const sponsors1 = [testData.sponsor({ id: 1, name: 'Team1 Sponsor' })]
      const sponsors2 = [testData.sponsor({ id: 2, name: 'Team2 Sponsor' })]

      const req = createMockRequest()

      // First team
      getTeam.mockResolvedValue(team1)
      getSponsorOffers.mockResolvedValue(sponsors1)
      const result1 = await handlers.getSponsorOffers(req)
      expect(result1).toEqual({ sponsors: sponsors1 })

      // Second team - should generate new offers
      getTeam.mockResolvedValue(team2)
      getSponsorOffers.mockResolvedValue(sponsors2)
      const result2 = await handlers.getSponsorOffers(req)
      expect(result2).toEqual({ sponsors: sponsors2 })

      // Both teams should have had getSponsorOffers called
      expect(getSponsorOffers).toHaveBeenCalledTimes(2)

      // First team again - should return cached
      getTeam.mockResolvedValue(team1)
      const result3 = await handlers.getSponsorOffers(req)
      expect(result3).toEqual({ sponsors: sponsors1 })
      expect(getSponsorOffers).toHaveBeenCalledTimes(2) // No new call
    })

    it('clears cache after 24 hours and generates new offers', async () => {
      vi.useFakeTimers()
      const team = testData.team({ id: 1 })
      const oldSponsors = [testData.sponsor({ id: 1, name: 'Old Sponsor' })]
      const newSponsors = [testData.sponsor({ id: 2, name: 'New Sponsor' })]

      getTeam.mockResolvedValue(team)
      getSponsorOffers.mockResolvedValueOnce(oldSponsors)

      const req = createMockRequest()

      // First request
      const result1 = await handlers.getSponsorOffers(req)
      expect(result1).toEqual({ sponsors: oldSponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(1)

      // Advance time by 23 hours - cache should still be valid
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)
      const result2 = await handlers.getSponsorOffers(req)
      expect(result2).toEqual({ sponsors: oldSponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(1) // Still cached

      // Advance time by 2 more hours (total 25 hours) - cache should expire
      getSponsorOffers.mockResolvedValueOnce(newSponsors)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
      const result3 = await handlers.getSponsorOffers(req)
      expect(result3).toEqual({ sponsors: newSponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(2) // New call after expiry
    })

    it('clears cache when sponsor is chosen', async () => {
      const team = testData.team({ id: 1 })
      const oldSponsors = [testData.sponsor({ id: 1, name: 'Old Sponsor' })]
      const newSponsors = [testData.sponsor({ id: 2, name: 'New Sponsor' })]

      getTeam.mockResolvedValue(team)
      getSponsorOffers.mockResolvedValueOnce(oldSponsors)
      query.mockResolvedValue({ insertId: 1 })

      const req = createMockRequest()

      // First request - cache offers
      const result1 = await handlers.getSponsorOffers(req)
      expect(result1).toEqual({ sponsors: oldSponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(1)

      // Choose a sponsor - should clear cache
      await handlers.chooseSponsor({
        name: 'Chosen Sponsor',
        value: 5000,
        duration: 10,
        start_season: 0,
        start_game_day: 1
      }, req)

      // Next request - should generate new offers (cache was cleared)
      getSponsorOffers.mockResolvedValueOnce(newSponsors)
      const result2 = await handlers.getSponsorOffers(req)
      expect(result2).toEqual({ sponsors: newSponsors })
      expect(getSponsorOffers).toHaveBeenCalledTimes(2) // New call after cache clear
    })
  })
})
