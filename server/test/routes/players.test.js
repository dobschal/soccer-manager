import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayerById: vi.fn(),
  getPlayerAge: vi.fn(),
  getAveragePlanPriceOfPlayer: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  getPastTrades: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getPlayerById, getPlayerAge, getAveragePlanPriceOfPlayer } from '../../helper/playerHelper.js'
import { getPastTrades } from '../../helper/tradeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import handlers from '../../routes/players.js'

describe('players routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPlayerById', () => {
    it('returns player by id', async () => {
      const player = testData.player()
      getPlayerById.mockResolvedValue(player)

      const result = await handlers.getPlayerById(1)

      expect(result).toEqual(player)
      expect(getPlayerById).toHaveBeenCalledWith(1)
    })
  })

  describe('getPlayersWithIds', () => {
    it('returns players with specified ids', async () => {
      const players = [testData.player({ id: 1 }), testData.player({ id: 2 })]
      query.mockResolvedValue(players)

      const result = await handlers.getPlayersWithIds([1, 2])

      expect(result).toEqual({ players })
    })

    it('throws error for missing playerIds', async () => {
      await expect(handlers.getPlayersWithIds([]))
        .rejects.toMatchObject({ message: 'playerIds missing' })

      await expect(handlers.getPlayersWithIds(null))
        .rejects.toMatchObject({ message: 'playerIds missing' })
    })
  })

  describe('firePlayer', () => {
    it('fires player from team', async () => {
      const team = testData.team()
      const player = testData.player({ name: 'John Doe' })

      getTeam.mockResolvedValue(team)
      query
        .mockResolvedValueOnce([player])  // SELECT player
        .mockResolvedValueOnce({})        // UPDATE player
        .mockResolvedValueOnce({})        // DELETE trade_offer

      const req = createMockRequest()
      const result = await handlers.firePlayer({ id: 1 }, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE player SET team_id=NULL WHERE id=?', [1])
      expect(query).toHaveBeenCalledWith('DELETE FROM trade_offer WHERE player_id=?', [1])
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('throws error when player not owned by team', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()

      await expect(handlers.firePlayer({ id: 999 }, req))
        .rejects.toMatchObject({ message: 'Not your player...' })
    })
  })

  describe('getPlayersWithoutTeam', () => {
    it('returns players without team', async () => {
      const players = [testData.player({ team_id: null })]
      query.mockResolvedValue(players)

      const result = await handlers.getPlayersWithoutTeam()

      expect(result).toEqual(players)
      expect(query).toHaveBeenCalledWith('SELECT * FROM player WHERE team_id IS NULL')
    })
  })

  describe('givePlayerContract', () => {
    it('gives contract to player without team', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, name: 'Free Player' })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.givePlayerContract(1, req)

      expect(query).toHaveBeenCalledWith('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('throws error when player has team', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: 5 })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)

      const req = createMockRequest()

      await expect(handlers.givePlayerContract(1, req))
        .rejects.toMatchObject({ message: 'Player has a team already...' })
    })
  })

  describe('estimateValue', () => {
    it('returns value based on past trades when available', async () => {
      const player = testData.player({ position: 'CM', level: 5 })
      const trades = [
        { price: 100000 },
        { price: 120000 },
        { price: 80000 }
      ]

      getPlayerById.mockResolvedValue(player)
      getPlayerAge.mockResolvedValue(25)
      getPastTrades.mockResolvedValue(trades)

      const result = await handlers.estimateValue(1)

      expect(result).toBeCloseTo(100000) // average of trades
    })

    it('returns average plan price when no past trades', async () => {
      const player = testData.player()

      getPlayerById.mockResolvedValue(player)
      getPlayerAge.mockResolvedValue(25)
      getPastTrades.mockResolvedValue([])
      getAveragePlanPriceOfPlayer.mockResolvedValue(50000)

      const result = await handlers.estimateValue(1)

      expect(result).toBe(50000)
    })
  })

  describe('getPlayerHistory', () => {
    it('returns player history', async () => {
      const history = [{ player_id: 1, level: 5 }, { player_id: 1, level: 4 }]
      query.mockResolvedValue(history)

      const result = await handlers.getPlayerHistory(1)

      expect(result).toEqual(history)
    })
  })
})
