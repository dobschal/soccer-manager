import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/financeHelper.js', () => ({
  updateTeamBalance: vi.fn()
}))

vi.mock('../../helper/logMessageHelper.js', () => ({
  addLogMessage: vi.fn(),
  checkTeamAndNotify: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getPlayerById: vi.fn()
}))

vi.mock('../../helper/playerHistoryHelper.js', () => ({
  addPlayerHistory: vi.fn()
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getTeamById } from '../../helper/teamHelper.js'
import { getPlayerById } from '../../helper/playerHelper.js'
import { addPlayerHistory } from '../../helper/playerHistoryHelper.js'
import { acceptOffer } from '../../helper/tradeHelper.js'

describe('tradeHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('acceptOffer', () => {
    const gameDay = 5
    const season = 1

    it('throws error when offer does not exist', async () => {
      const sellingTeam = testData.team({ id: 1 })
      const offer = testData.tradeOffer({ id: 999, type: 'buy' })

      query.mockResolvedValueOnce([]) // No matching offers

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'No offer exist' })
    })

    it('throws error when player does not exist', async () => {
      const sellingTeam = testData.team({ id: 1 })
      const offer = testData.tradeOffer({ id: 1, type: 'buy', player_id: 99 })

      query.mockResolvedValueOnce([{ id: 1, player_id: 99, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(null)

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Player does not exist' })
    })

    it('assigns player to buying team', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({}) // For UPDATE and INSERT queries

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Verify player is assigned to buying team
      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET team_id=?, in_game_position=NULL WHERE id=?',
        [2, 10]
      )
    })

    it('updates balance correctly for both teams', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC', balance: 100000 })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', balance: 200000 })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 75000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Selling team receives money (positive)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        sellingTeam,
        75000,
        'Selling player Star Player to Buying FC',
        gameDay,
        season
      )

      // Buying team pays money (negative)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        buyingTeam,
        -75000,
        'Buying player Star Player from Selling FC',
        gameDay,
        season
      )
    })

    it('removes all trade offers for the player', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Verify all offers for this player are deleted
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM trade_offer WHERE player_id=?',
        10
      )
    })

    it('creates correct log message for selling team', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(addLogMessage).toHaveBeenCalledWith(
        'You sold your player Star Player to the team Buying FC.',
        sellingTeam,
        'OPEN_TEAM_PAGE',
        2,
        'exchange'
      )
    })

    it('creates correct log message for buying team', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(addLogMessage).toHaveBeenCalledWith(
        'You bought the player Star Player from Selling FC.',
        buyingTeam,
        'OPEN_PLAYER',
        10,
        'exchange'
      )
    })

    it('creates player history with TRANSFER type', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(addPlayerHistory).toHaveBeenCalledWith(10, 'TRANSFER', 2)
    })

    it('creates trade history record with correct data', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 80000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Find the INSERT INTO trade_history call
      const insertCall = query.mock.calls.find(
        call => call[0] === 'INSERT INTO trade_history SET ?'
      )
      expect(insertCall).toBeDefined()
      expect(insertCall[1]).toMatchObject({
        season: 1,
        game_day: 5,
        player_id: 10,
        from_team_id: 1,
        to_team_id: 2,
        price: 80000
      })
    })

    it('clears player in_game_position when transferred', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({
        id: 10,
        name: 'Star Player',
        team_id: 1,
        in_game_position: 'CM'
      })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Verify in_game_position is set to NULL
      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET team_id=?, in_game_position=NULL WHERE id=?',
        [2, 10]
      )
    })

    it('allows transfer even if buying team would go negative (no balance validation)', async () => {
      // Note: This documents current behavior - balance validation happens
      // only when creating buy offers, not when accepting them.
      // The buying team's balance could have changed since the offer was made.
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', balance: 1000 })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({
        id: 1,
        type: 'buy',
        player_id: 10,
        from_team_id: 2,
        offer_value: 50000 // More than buying team's balance
      })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      query.mockResolvedValue({})

      // Should not throw - current behavior allows negative balance
      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .resolves.toBeUndefined()

      // Balance update is still called (will result in negative balance)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        buyingTeam,
        -50000,
        expect.any(String),
        gameDay,
        season
      )
    })
  })
})
