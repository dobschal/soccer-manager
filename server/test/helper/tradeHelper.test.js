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
  getPlayerById: vi.fn(),
  getPlayersByTeamId: vi.fn(),
  MIN_TEAM_SIZE: 14,
  MAX_TEAM_SIZE: 42
}))

vi.mock('../../helper/playerHistoryHelper.js', () => ({
  addPlayerHistory: vi.fn()
}))

vi.mock('../../lib/websocket.js', () => ({
  sendToTeam: vi.fn().mockResolvedValue(true),
  sendToUser: vi.fn().mockReturnValue(true)
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'error.offerNotFound': 'Offer not found',
      'error.playerNotFound': 'Player not found',
      'error.teamTooSmall': 'Your team must have at least 14 players.',
      'error.teamTooLarge': 'Your team cannot have more than 42 players.',
      'finance.playerSold': `Selling player ${params.playerName} to ${params.buyerTeam}`,
      'finance.playerBought': `Buying player ${params.playerName} from ${params.sellerTeam}`,
      'log.playerSold': `You sold your player ${params.playerName} to the team ${params.buyerTeam}.`,
      'log.playerBought': `You bought the player ${params.playerName} from ${params.sellerTeam}.`,
      'log.offerRejected': `Your offer for ${params.playerName} was rejected.`
    }
    return translations[key] || key
  }),
  getUserLocale: vi.fn().mockResolvedValue('en')
}))

import { query } from '../../lib/database.js'
import { updateTeamBalance } from '../../helper/financeHelper.js'
import { addLogMessage } from '../../helper/logMessageHelper.js'
import { getTeamById } from '../../helper/teamHelper.js'
import { getPlayerById, getPlayersByTeamId } from '../../helper/playerHelper.js'
import { addPlayerHistory } from '../../helper/playerHistoryHelper.js'
import { sendToTeam } from '../../lib/websocket.js'
import { acceptOffer, declineOffer, enforceSellOfferLimits, MAX_SELL_OFFERS_PER_TEAM, MAX_TRANSFERS_PER_SEASON } from '../../helper/tradeHelper.js'

describe('tradeHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enforceSellOfferLimits', () => {
    it('removes the excess offers of a user team down to the limit and notifies the user', async () => {
      const team = testData.team({ id: 7, user_id: 3 })
      const offers = new Array(MAX_SELL_OFFERS_PER_TEAM + 2)
        .fill(null)
        .map((_, i) => testData.tradeOffer({ id: i + 1, from_team_id: team.id, type: 'sell', status: 'open' }))

      query
        .mockResolvedValueOnce([{ from_team_id: team.id }]) // teams over the limit
        .mockResolvedValueOnce(offers) // getOpenSellOffersByTeamId
        .mockResolvedValueOnce({}) // DELETE
      getTeamById.mockResolvedValue(team)

      await enforceSellOfferLimits()

      const deleteCall = query.mock.calls.find(c => String(c[0]).startsWith('DELETE FROM trade_offer WHERE id IN'))
      expect(deleteCall).toBeTruthy()
      // Exactly the two excess offers get removed.
      const idList = deleteCall[0].match(/\(([^)]+)\)/)[1].split(',').map(s => s.trim())
      expect(idList).toHaveLength(2)
      expect(addLogMessage).toHaveBeenCalledWith(
        expect.any(String), team, 'OPEN_MARKET', null, 'tag', 'NEW_LOG_MESSAGE', 'warning'
      )
    })

    it('skips bot teams (no user_id)', async () => {
      const team = testData.team({ id: 8, user_id: null })

      query.mockResolvedValueOnce([{ from_team_id: team.id }])
      getTeamById.mockResolvedValue(team)

      await enforceSellOfferLimits()

      const deleteCall = query.mock.calls.find(c => String(c[0]).startsWith('DELETE'))
      expect(deleteCall).toBeUndefined()
      expect(addLogMessage).not.toHaveBeenCalled()
    })
  })

  describe('acceptOffer', () => {
    const gameDay = 5
    const season = 1

    beforeEach(() => {
      // Default: selling team has enough players
      getPlayersByTeamId.mockResolvedValue(Array(18).fill(testData.player()))
    })

    it('throws error when offer does not exist', async () => {
      const sellingTeam = testData.team({ id: 1 })
      const offer = testData.tradeOffer({ id: 999, type: 'buy' })

      query.mockResolvedValueOnce([]) // No matching offers

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Offer not found' })
    })

    it('throws error when player does not exist', async () => {
      const sellingTeam = testData.team({ id: 1 })
      const offer = testData.tradeOffer({ id: 1, type: 'buy', player_id: 99 })

      query.mockResolvedValueOnce([{ id: 1, player_id: 99, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(null)

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Player not found' })
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      }) // For UPDATE and INSERT queries

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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Selling team receives money (positive)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        sellingTeam,
        75000,
        expect.stringContaining('Star Player'),
        gameDay,
        season
      )

      // Buying team pays money (negative)
      expect(updateTeamBalance).toHaveBeenCalledWith(
        buyingTeam,
        -75000,
        expect.stringContaining('Star Player'),
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Verify the accepted offer is claimed atomically (guarded on status='open')
      expect(query).toHaveBeenCalledWith(
        'UPDATE trade_offer SET status=\'accepted\' WHERE id=? AND type=\'buy\' AND status=\'open\'',
        [offer.id]
      )
      // Verify other offers for this player are deleted
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM trade_offer WHERE player_id=? AND id != ?',
        [10, offer.id]
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(addLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Star Player'),
        sellingTeam,
        'OPEN_TEAM_PAGE',
        2,
        'exchange',
        undefined,
        'success'
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(addLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Star Player'),
        buyingTeam,
        'OPEN_PLAYER',
        10,
        'exchange',
        undefined,
        'success'
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

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
        price: 80000,
        player_level: expect.any(Number)
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      // Verify in_game_position is set to NULL
      expect(query).toHaveBeenCalledWith(
        'UPDATE player SET team_id=?, in_game_position=NULL WHERE id=?',
        [2, 10]
      )
    })

    it('sends BUY_OFFER_ACCEPTED websocket event to buying team', async () => {
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(sendToTeam).toHaveBeenCalledWith(2, 'BUY_OFFER_ACCEPTED', {
        playerName: 'Star Player',
        sellerTeamName: 'Selling FC',
        price: 50000
      })
    })

    it('sends PLAYER_SOLD websocket event to selling team', async () => {
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(sendToTeam).toHaveBeenCalledWith(1, 'PLAYER_SOLD', {
        playerId: 10,
        playerName: 'Star Player',
        buyerTeamName: 'Buying FC',
        price: 50000
      })
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

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

    it('throws error when selling team would drop below minimum team size', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC', user_id: 1 })
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
      getPlayersByTeamId.mockResolvedValueOnce(Array(14).fill(testData.player()))

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Your team must have at least 14 players.' })
    })

    it('throws error when buying team is user-owned and would exceed maximum team size', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC', user_id: 1 })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', user_id: 2 })
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
      // First call: selling team (18 players — ok), second call: buying team (42 players — at cap)
      getPlayersByTeamId
        .mockResolvedValueOnce(Array(18).fill(testData.player()))
        .mockResolvedValueOnce(Array(42).fill(testData.player()))

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Your team cannot have more than 42 players.' })
    })

    it('allows trade when buying team is a bot regardless of squad size', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC', user_id: 1 })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', user_id: null })
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
      // Selling team OK
      getPlayersByTeamId.mockResolvedValueOnce(Array(18).fill(testData.player()))
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .resolves.toBeUndefined()
    })

    it('allows trade for bot teams even with few players', async () => {
      const botTeam = testData.team({ id: 1, name: 'Bot FC', user_id: null })
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
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      // Should not throw - bot teams are not subject to minimum team size
      await expect(acceptOffer(offer, botTeam, gameDay, season))
        .resolves.toBeUndefined()
    })

    it('rejects a player that already changed clubs the maximum times this season (anti wash-trading)', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 1, type: 'buy', player_id: 10, from_team_id: 2, offer_value: 50000 })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }]) // validation SELECT
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      // trade_history already has MAX_TRANSFERS_PER_SEASON transfers for this player this season
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: MAX_TRANSFERS_PER_SEASON }])
        return Promise.resolve({})
      })

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'error.playerAlreadyTransferredThisSeason' })

      // No money moved and no history written when the transfer is blocked
      expect(updateTeamBalance).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalledWith('INSERT INTO trade_history SET ?', expect.anything())
    })

    it('allows a player that has only changed clubs once this season', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 1, type: 'buy', player_id: 10, from_team_id: 2, offer_value: 80000 })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }])
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      // One prior transfer this season — still below the limit of MAX_TRANSFERS_PER_SEASON
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 1 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })

      await acceptOffer(offer, sellingTeam, gameDay, season)

      expect(query).toHaveBeenCalledWith('INSERT INTO trade_history SET ?', expect.anything())
    })

    it('does not credit the seller twice on a concurrent double-accept (race guard)', async () => {
      const sellingTeam = testData.team({ id: 1, name: 'Selling FC' })
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 1, type: 'buy', player_id: 10, from_team_id: 2, offer_value: 50000 })

      query.mockResolvedValueOnce([{ id: 1, player_id: 10, type: 'buy' }]) // validation SELECT still sees it open
      getPlayerById.mockResolvedValueOnce(player)
      getTeamById.mockResolvedValueOnce(buyingTeam)
      // The other concurrent request already flipped the offer: our atomic claim hits 0 rows
      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 0 })
        return Promise.resolve({})
      })

      await expect(acceptOffer(offer, sellingTeam, gameDay, season))
        .rejects.toMatchObject({ message: 'Offer not found' })

      // The loser of the race must not move money or write a duplicate trade_history row
      expect(updateTeamBalance).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalledWith('INSERT INTO trade_history SET ?', expect.anything())
    })
  })

  describe('declineOffer', () => {
    it('updates the buy offer status to rejected', async () => {
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', user_id: 1 })
      const sellerTeam = testData.team({ id: 1, name: 'Seller FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 7, type: 'buy', player_id: 10, from_team_id: 2 })

      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })
      getPlayerById.mockResolvedValue(player)
      getTeamById.mockResolvedValueOnce(buyingTeam).mockResolvedValueOnce(sellerTeam)

      await declineOffer(offer)

      expect(query).toHaveBeenCalledWith(
        'UPDATE trade_offer SET status=\'rejected\' WHERE type=\'buy\' AND id=?',
        [7]
      )
    })

    it('sends a log message to the offering team', async () => {
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', user_id: 1 })
      const sellerTeam = testData.team({ id: 1, name: 'Seller FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 7, type: 'buy', player_id: 10, from_team_id: 2 })

      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })
      getPlayerById.mockResolvedValue(player)
      getTeamById.mockResolvedValueOnce(buyingTeam).mockResolvedValueOnce(sellerTeam)

      await declineOffer(offer)

      expect(addLogMessage).toHaveBeenCalledWith(
        expect.stringContaining('Star Player'),
        buyingTeam,
        'OPEN_PLAYER',
        10,
        'times-circle',
        undefined,
        'danger'
      )
    })

    it('looks up the offering team by from_team_id', async () => {
      const buyingTeam = testData.team({ id: 5, name: 'Other FC', user_id: 3 })
      const sellerTeam = testData.team({ id: 1, name: 'Seller FC' })
      const player = testData.player({ id: 20, name: 'Another Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 8, type: 'buy', player_id: 20, from_team_id: 5 })

      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })
      getPlayerById.mockResolvedValue(player)
      getTeamById.mockResolvedValueOnce(buyingTeam).mockResolvedValueOnce(sellerTeam)

      await declineOffer(offer)

      expect(getTeamById).toHaveBeenCalledWith(5)
    })

    it('sends websocket event to buying team', async () => {
      const { sendToTeam } = await import('../../lib/websocket.js')
      const buyingTeam = testData.team({ id: 2, name: 'Buying FC', user_id: 1 })
      const sellerTeam = testData.team({ id: 1, name: 'Seller FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 7, type: 'buy', player_id: 10, from_team_id: 2 })

      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })
      getPlayerById.mockResolvedValue(player)
      getTeamById.mockResolvedValueOnce(buyingTeam).mockResolvedValueOnce(sellerTeam)

      await declineOffer(offer)

      expect(sendToTeam).toHaveBeenCalledWith(buyingTeam.id, 'BUY_OFFER_REJECTED', {
        playerName: 'Star Player',
        sellerTeamName: 'Seller FC'
      })
    })

    it('handles bot teams (no user_id)', async () => {
      const botTeam = testData.team({ id: 3, name: 'Bot FC', user_id: null })
      const sellerTeam = testData.team({ id: 1, name: 'Seller FC' })
      const player = testData.player({ id: 10, name: 'Star Player', team_id: 1 })
      const offer = testData.tradeOffer({ id: 9, type: 'buy', player_id: 10, from_team_id: 3 })

      query.mockImplementation((sql) => {
        if (sql.includes('COUNT(*) AS count FROM trade_history')) return Promise.resolve([{ count: 0 }])
        if (sql.startsWith('UPDATE trade_offer SET status=\'accepted\'')) return Promise.resolve({ affectedRows: 1 })
        return Promise.resolve({})
      })
      getPlayerById.mockResolvedValue(player)
      getTeamById.mockResolvedValueOnce(botTeam).mockResolvedValueOnce(sellerTeam)

      await declineOffer(offer)

      // Offer should be updated to rejected
      expect(query).toHaveBeenCalledWith(
        'UPDATE trade_offer SET status=\'rejected\' WHERE type=\'buy\' AND id=?',
        [9]
      )
      // Log message is still called (addLogMessage handles bot teams gracefully)
      expect(addLogMessage).toHaveBeenCalled()
    })
  })
})
