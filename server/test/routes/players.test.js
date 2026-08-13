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
  getAveragePlanPriceOfPlayer: vi.fn(),
  getPlayersByTeamId: vi.fn(),
  MIN_TEAM_SIZE: 14,
  MAX_TEAM_SIZE: 42
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  getPastTrades: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn()
}))

vi.mock('../../helper/playerHistoryHelper.js', () => ({
  addPlayerHistory: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getPlayerById, getPlayerAge, getAveragePlanPriceOfPlayer, getPlayersByTeamId } from '../../helper/playerHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
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

      const req = { locale: 'en' }
      const result = await handlers.getPlayersWithIds([1, 2], req)

      expect(result).toEqual({ players })
    })

    it('throws error for missing playerIds', async () => {
      const req = { locale: 'en' }
      await expect(handlers.getPlayersWithIds([], req))
        .rejects.toMatchObject({ message: 'Invalid request' })

      await expect(handlers.getPlayersWithIds(null, req))
        .rejects.toMatchObject({ message: 'Invalid request' })
    })
  })

  describe('firePlayer', () => {
    it('fires player from team', async () => {
      const team = testData.team()
      const player = testData.player({ name: 'John Doe' })

      getTeam.mockResolvedValue(team)
      getPlayersByTeamId.mockResolvedValue(Array(15).fill(testData.player()))
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
        .rejects.toMatchObject({ message: 'This is not your player' })
    })

    it('throws error when team would have fewer than 14 players', async () => {
      const team = testData.team()
      const player = testData.player({ name: 'John Doe' })

      getTeam.mockResolvedValue(team)
      getPlayersByTeamId.mockResolvedValue(Array(14).fill(testData.player()))
      query.mockResolvedValueOnce([player]) // SELECT player

      const req = createMockRequest()

      await expect(handlers.firePlayer({ id: 1 }, req))
        .rejects.toMatchObject({ message: 'Your team must have at least 14 players.' })
    })

    it('allows firing when team has more than 14 players', async () => {
      const team = testData.team()
      const player = testData.player({ name: 'John Doe' })

      getTeam.mockResolvedValue(team)
      getPlayersByTeamId.mockResolvedValue(Array(15).fill(testData.player()))
      query
        .mockResolvedValueOnce([player])  // SELECT player
        .mockResolvedValueOnce({})        // UPDATE player
        .mockResolvedValueOnce({})        // DELETE trade_offer

      const req = createMockRequest()
      const result = await handlers.firePlayer({ id: 1 }, req)

      expect(result).toEqual({ success: true })
    })
  })

  describe('getPlayersWithoutTeam', () => {
    // `carrier_end_season` is inclusive: a player in their final season is
    // still signable, only players whose end season is in the past are gone.
    it('returns players without team, excluding retired ones', async () => {
      const players = [testData.player({ team_id: null, carrier_end_season: 10 })]
      getGameDayAndSeason.mockResolvedValue({ season: 5, gameDay: 3 })
      query.mockResolvedValue(players)

      const result = await handlers.getPlayersWithoutTeam()

      expect(result).toEqual(players)
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM player WHERE team_id IS NULL AND carrier_end_season >= ?',
        [5]
      )
    })
  })

  describe('givePlayerContract', () => {
    beforeEach(() => {
      getGameDayAndSeason.mockResolvedValue({ season: 5, gameDay: 3 })
    })

    it('gives contract to player without team', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, name: 'Free Player' })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue(Array(20).fill(testData.player()))
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.givePlayerContract(1, req)

      expect(query).toHaveBeenCalledWith('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
      expect(addLogMessage).toHaveBeenCalled()
    })

    it('#512 clears any stale trade offers when signing a free agent', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, name: 'Free Player' })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue(Array(20).fill(testData.player()))
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.givePlayerContract(1, req)

      expect(query).toHaveBeenCalledWith('DELETE FROM trade_offer WHERE player_id=?', [player.id])
    })

    it('throws error when player has team', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: 5 })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)

      const req = createMockRequest()

      await expect(handlers.givePlayerContract(1, req))
        .rejects.toMatchObject({ message: 'Player not found' })
    })

    it('throws error when team is already at maximum squad size', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, name: 'Free Player' })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue(Array(42).fill(testData.player()))

      const req = createMockRequest()

      await expect(handlers.givePlayerContract(1, req))
        .rejects.toMatchObject({ message: 'Your team cannot have more than 42 players.' })
    })

    // A squad page opened before the season transition keeps offering players
    // the transition has just retired. Ten of them were signed that way in
    // production and never left again, because nothing re-checks a career end
    // once a player has a club.
    it('rejects a player whose career has already ended', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, carrier_end_season: 4 })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue(Array(20).fill(testData.player()))

      const req = createMockRequest()

      await expect(handlers.givePlayerContract(1, req))
        .rejects.toMatchObject({ message: 'This player has ended his career and cannot be signed.' })
      expect(query).not.toHaveBeenCalledWith('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
    })

    it('still signs a player who is in their final season', async () => {
      const team = testData.team()
      const player = testData.player({ team_id: null, carrier_end_season: 5 })

      getTeam.mockResolvedValue(team)
      getPlayerById.mockResolvedValue(player)
      getPlayersByTeamId.mockResolvedValue(Array(20).fill(testData.player()))
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.givePlayerContract(1, req)

      expect(query).toHaveBeenCalledWith('UPDATE player SET team_id=? WHERE id=?', [team.id, player.id])
    })
  })

  describe('estimateValue', () => {
    it('blends the past-trade average 50/50 with the plan price', async () => {
      const player = testData.player({ position: 'CM', level: 5 })
      const trades = [
        { price: 100000 },
        { price: 120000 },
        { price: 80000 }
      ]

      getPlayerById.mockResolvedValue(player)
      getPlayerAge.mockResolvedValue(25)
      getPastTrades.mockResolvedValue(trades)
      getAveragePlanPriceOfPlayer.mockResolvedValue(200000)

      const result = await handlers.estimateValue(1)

      // trade avg 100000 blended 50/50 with plan price 200000 → 150000
      expect(result).toBe(150000)
    })

    it('anchors a deflated trade average back up towards the plan price', async () => {
      // Cheap outlier trades (bot dumps) would pull a pure average far below
      // fundamental value; the blend keeps the estimate anchored to plan price.
      const player = testData.player({ position: 'CM', level: 5 })
      const trades = [
        { price: 20000 },
        { price: 25000 },
        { price: 15000 }
      ]

      getPlayerById.mockResolvedValue(player)
      getPlayerAge.mockResolvedValue(25)
      getPastTrades.mockResolvedValue(trades)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)

      const result = await handlers.estimateValue(1)

      // trade avg 20000 blended 50/50 with plan price 100000 → 60000 (not 20000)
      expect(result).toBe(60000)
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
