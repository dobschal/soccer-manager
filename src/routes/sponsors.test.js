import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn(),
  getSponsorOffers: vi.fn()
}))

import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import { getSponsor, getSponsorOffers } from '../helper/sponsorHelper.js'
import handlers from './sponsors.js'

describe('sponsors routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
