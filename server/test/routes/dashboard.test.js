import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  getIncomingBuyOffers: vi.fn()
}))

vi.mock('../../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn()
}))

vi.mock('../../helper/youthPlayerHelper.js', () => ({
  getYouthPlayersByTeam: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getIncomingBuyOffers } from '../../helper/tradeHelper.js'
import { getSponsor } from '../../helper/sponsorHelper.js'
import { getYouthPlayersByTeam } from '../../helper/youthPlayerHelper.js'
import handlers from '../../routes/dashboard.js'

describe('dashboard routes', () => {
  let team

  beforeEach(() => {
    vi.clearAllMocks()
    team = testData.team()
    getTeam.mockResolvedValue(team)
    query.mockResolvedValue([])
    getYouthPlayersByTeam.mockResolvedValue([])
    getIncomingBuyOffers.mockResolvedValue([])
    getSponsor.mockResolvedValue({ sponsor: testData.sponsor() })
  })

  describe('getDashboardUrgencies', () => {
    it('returns INCOMPLETE_LINEUP when fewer than 11 players in lineup', async () => {
      const players = Array.from({ length: 8 }, (_, i) =>
        testData.player({ id: i + 1, in_game_position: 'CM' })
      )
      query.mockResolvedValue(players)

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'INCOMPLETE_LINEUP', count: 8 })
    })

    it('returns LOW_FRESHNESS when lineup player has freshness below 0.5', async () => {
      const players = Array.from({ length: 11 }, (_, i) =>
        testData.player({ id: i + 1, in_game_position: 'CM', freshness: i < 2 ? 0.3 : 0.9 })
      )
      query.mockResolvedValue(players)

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'LOW_FRESHNESS', count: 2 })
    })

    it('returns YOUTH_LOW_STATS when youth player has moral below 0.5', async () => {
      getYouthPlayersByTeam.mockResolvedValue([
        { id: 1, moral: 0.3, fitness: 0.8 }
      ])

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'YOUTH_LOW_STATS', count: 1 })
    })

    it('returns YOUTH_LOW_STATS when youth player has fitness below 0.5', async () => {
      getYouthPlayersByTeam.mockResolvedValue([
        { id: 1, moral: 0.8, fitness: 0.4 }
      ])

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'YOUTH_LOW_STATS', count: 1 })
    })

    it('returns INCOMING_OFFERS when there are open buy offers', async () => {
      getIncomingBuyOffers.mockResolvedValue([
        testData.tradeOffer({ type: 'buy' }),
        testData.tradeOffer({ id: 2, type: 'buy' })
      ])

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'INCOMING_OFFERS', count: 2 })
    })

    it('returns NO_SPONSOR when no active sponsor', async () => {
      getSponsor.mockResolvedValue({ sponsor: null })

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'NO_SPONSOR' })
    })

    it('returns INCOMPLETE_BENCH when bench positions are missing', async () => {
      const players = Array.from({ length: 11 }, (_, i) =>
        testData.player({ id: i + 1, in_game_position: 'CM', freshness: 0.9 })
      )
      // Only 1 bench position filled
      players.push(testData.player({ id: 12, bench_position: 'BENCH_GK' }))
      query.mockResolvedValue(players)

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toContainEqual({ type: 'INCOMPLETE_BENCH', count: 1 })
    })

    it('returns empty array when all checks pass', async () => {
      const benchPositions = ['BENCH_GK', 'BENCH_DEF', 'BENCH_MID', 'BENCH_ATT']
      const players = Array.from({ length: 11 }, (_, i) =>
        testData.player({ id: i + 1, in_game_position: 'CM', freshness: 0.9 })
      )
      // Add bench players
      benchPositions.forEach((pos, i) => {
        players.push(testData.player({ id: 20 + i, bench_position: pos }))
      })
      query.mockResolvedValue(players)
      getYouthPlayersByTeam.mockResolvedValue([
        { id: 1, moral: 0.8, fitness: 0.8 }
      ])
      getIncomingBuyOffers.mockResolvedValue([])
      getSponsor.mockResolvedValue({ sponsor: testData.sponsor() })

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      expect(result.urgencies).toEqual([])
    })

    it('returns multiple urgencies when several conditions apply', async () => {
      // Incomplete lineup (only 5 players), some with low freshness
      const players = Array.from({ length: 5 }, (_, i) =>
        testData.player({ id: i + 1, in_game_position: 'CM', freshness: i < 1 ? 0.2 : 0.9 })
      )
      query.mockResolvedValue(players)
      getSponsor.mockResolvedValue({ sponsor: null })
      getIncomingBuyOffers.mockResolvedValue([testData.tradeOffer({ type: 'buy' })])

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      const types = result.urgencies.map(u => u.type)
      expect(types).toContain('INCOMPLETE_LINEUP')
      expect(types).toContain('LOW_FRESHNESS')
      expect(types).toContain('NO_SPONSOR')
      expect(types).toContain('INCOMING_OFFERS')
    })

    it('does not return LOW_FRESHNESS for players not in lineup', async () => {
      const players = [
        testData.player({ id: 1, in_game_position: 'CM', freshness: 0.9 }),
        ...Array.from({ length: 10 }, (_, i) =>
          testData.player({ id: i + 2, in_game_position: 'CM', freshness: 0.9 })
        ),
        // Player not in lineup with low freshness
        testData.player({ id: 12, in_game_position: '', freshness: 0.1 }),
        testData.player({ id: 13, in_game_position: null, freshness: 0.1 })
      ]
      query.mockResolvedValue(players)

      const req = createMockRequest()
      const result = await handlers.getDashboardUrgencies(req)

      const types = result.urgencies.map(u => u.type)
      expect(types).not.toContain('LOW_FRESHNESS')
      expect(types).not.toContain('INCOMPLETE_LINEUP')
    })
  })
})
