import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from './setup.js'

// Mock all dependencies
vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/tradeHelper.js', () => ({
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  getIncomingBuyOffers: vi.fn(),
  getOpenByOffersByTeamId: vi.fn(),
  getOpenSellOffersByTeamId: vi.fn()
}))

vi.mock('../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../helper/playerHelper.js', () => ({
  getAveragePlanPriceOfPlayer: vi.fn(),
  getPlayerById: vi.fn(),
  getPlayersByTeamId: vi.fn()
}))

vi.mock('../helper/actionCardHelper.js', () => ({
  getActionCards: vi.fn(),
  playActionCard: vi.fn()
}))

vi.mock('../helper/sponsorHelper.js', () => ({
  getSponsor: vi.fn(),
  getSponsorOffers: vi.fn()
}))

vi.mock('../helper/stadiumHelper.js', () => ({
  buildStadium: vi.fn(),
  calcuateStadiumBuild: vi.fn()
}))

vi.mock('../routes/players.js', () => ({
  default: {
    estimateValue: vi.fn()
  }
}))

vi.mock('../../client/util/formation.js', () => ({
  getPositionsOfFormation: vi.fn()
}))

import playersRoutes from '../routes/players.js'
import { makeBotMoves } from '../bot-move.js'
import { query } from '../lib/database.js'
import {
  acceptOffer,
  declineOffer,
  getIncomingBuyOffers,
  getOpenByOffersByTeamId,
  getOpenSellOffersByTeamId
} from '../helper/tradeHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId } from '../helper/playerHelper.js'
import { getActionCards } from '../helper/actionCardHelper.js'
import { getSponsor } from '../helper/sponsorHelper.js'
import { getPositionsOfFormation } from '../../client/util/formation.js'

describe('Bot Trading', () => {
  // Bot team (no user_id)
  const botTeam = testData.team({
    id: 10,
    name: 'Bot FC',
    user_id: null,
    balance: 500000,
    formation: '4-4-2'
  })

  // User team (has user_id)
  const userTeam = testData.team({
    id: 20,
    name: 'User FC',
    user_id: 1,
    balance: 1000000
  })

  // Another bot team for bot-to-bot trading
  const botTeam2 = testData.team({
    id: 30,
    name: 'Bot United',
    user_id: null,
    balance: 600000,
    formation: '4-3-3'
  })

  // Players for bot team - full squad for 4-4-2
  const botPlayers = [
    testData.player({ id: 101, name: 'Bot GK', position: 'GK', level: 5, team_id: 10, in_game_position: 'GK' }),
    testData.player({ id: 102, name: 'Bot LB', position: 'LB', level: 5, team_id: 10, in_game_position: 'LB' }),
    testData.player({ id: 103, name: 'Bot CB1', position: 'CB', level: 6, team_id: 10, in_game_position: 'CB' }),
    testData.player({ id: 104, name: 'Bot CB2', position: 'CB', level: 5, team_id: 10, in_game_position: 'CB' }),
    testData.player({ id: 105, name: 'Bot RB', position: 'RB', level: 5, team_id: 10, in_game_position: 'RB' }),
    testData.player({ id: 106, name: 'Bot LM', position: 'LM', level: 7, team_id: 10, in_game_position: 'LM' }),
    testData.player({ id: 107, name: 'Bot CM1', position: 'CM', level: 6, team_id: 10, in_game_position: 'CM' }),
    testData.player({ id: 108, name: 'Bot CM2', position: 'CM', level: 5, team_id: 10, in_game_position: 'CM' }),
    testData.player({ id: 109, name: 'Bot RM', position: 'RM', level: 5, team_id: 10, in_game_position: 'RM' }),
    testData.player({ id: 110, name: 'Bot ST1', position: 'ST', level: 8, team_id: 10, in_game_position: 'ST' }),
    testData.player({ id: 111, name: 'Bot ST2', position: 'ST', level: 6, team_id: 10, in_game_position: 'ST' }),
    // Backup players
    testData.player({ id: 112, name: 'Bot GK2', position: 'GK', level: 3, team_id: 10, in_game_position: null }),
    testData.player({ id: 113, name: 'Bot CB3', position: 'CB', level: 4, team_id: 10, in_game_position: null }),
    testData.player({ id: 114, name: 'Bot ST3', position: 'ST', level: 4, team_id: 10, in_game_position: null })
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks for all tests
    getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 1 })
    getPositionsOfFormation.mockReturnValue(['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'])
    getActionCards.mockResolvedValue([])
    getSponsor.mockResolvedValue({ sponsor: { id: 1 } })
    getOpenSellOffersByTeamId.mockResolvedValue([])
    getOpenByOffersByTeamId.mockResolvedValue([])
    getIncomingBuyOffers.mockResolvedValue([])
    getPlayersByTeamId.mockImplementation(async (teamId) => {
      if (teamId === 10) return [...botPlayers]
      return []
    })
    playersRoutes.estimateValue.mockResolvedValue(50000)
    // Default fair-value & player-fetch mocks (high enough not to cap legitimate test buys)
    getAveragePlanPriceOfPlayer.mockResolvedValue(50_000_000)
    getPlayerById.mockResolvedValue(testData.player({ id: 999, level: 5, carrier_start_season: 0 }))

    // Default query mock
    query.mockImplementation(async (sql, params) => {
      // Return bot teams for SELECT * FROM team WHERE user_id IS NULL
      if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
        return [botTeam]
      }
      // Return players for bot teams
      if (sql.includes('SELECT * FROM player WHERE team_id IN')) {
        return botPlayers
      }
      // Return stadium
      if (sql.includes('SELECT * FROM stadium WHERE team_id')) {
        return [testData.stadium({ team_id: params[0] })]
      }
      // Return no games
      if (sql.includes('SELECT * FROM game')) {
        return []
      }
      return []
    })
  })

  describe('Bot accepts buy offers from users', () => {
    it('accepts buy offer when price is high enough', async () => {
      const targetPlayer = botPlayers.find(p => p.id === 114) // ST3 backup
      const buyOffer = testData.tradeOffer({
        id: 1,
        player_id: 114,
        from_team_id: userTeam.id, // From user team
        type: 'buy',
        offer_value: 100000,
        created_at: new Date().toISOString()
      })

      // Mock incoming buy offer from user
      getIncomingBuyOffers.mockResolvedValue([buyOffer])
      getPlayerById.mockResolvedValue(targetPlayer)
      getAveragePlanPriceOfPlayer.mockResolvedValue(50000)

      await makeBotMoves()

      // Should accept the offer (100k is well above 50k average)
      expect(acceptOffer).toHaveBeenCalled()
      expect(declineOffer).not.toHaveBeenCalled()
    })

    it('declines buy offer when price is too low', async () => {
      const targetPlayer = botPlayers.find(p => p.id === 114) // ST3 backup
      const lowOffer = testData.tradeOffer({
        id: 2,
        player_id: 114,
        from_team_id: userTeam.id,
        type: 'buy',
        offer_value: 20000, // Too low
        created_at: new Date().toISOString()
      })

      getIncomingBuyOffers.mockResolvedValue([lowOffer])
      getPlayerById.mockResolvedValue(targetPlayer)
      getAveragePlanPriceOfPlayer.mockResolvedValue(50000)

      await makeBotMoves()

      // Should decline (20k is way below 50k average * 0.8 = 40k minimum)
      expect(declineOffer).toHaveBeenCalled()
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('protects formation - declines offer for only goalkeeper', async () => {
      // Make this the only GK (remove backup GK)
      const playersWithOneGK = botPlayers.filter(p => p.id !== 112) // Remove GK2
      getPlayersByTeamId.mockResolvedValue(playersWithOneGK)
      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
          return [botTeam]
        }
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) {
          return playersWithOneGK
        }
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) {
          return [testData.stadium({ team_id: params[0] })]
        }
        return []
      })

      const onlyGK = playersWithOneGK.find(p => p.position === 'GK')
      const offerForOnlyGK = testData.tradeOffer({
        id: 3,
        player_id: onlyGK.id,
        from_team_id: userTeam.id,
        type: 'buy',
        offer_value: 500000, // Very high offer
        created_at: new Date().toISOString()
      })

      getIncomingBuyOffers.mockResolvedValue([offerForOnlyGK])
      getPlayerById.mockResolvedValue(onlyGK)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)

      await makeBotMoves()

      // Should decline - can't sell only GK even for high price
      expect(declineOffer).toHaveBeenCalled()
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('accepts premium offer for formation player with adequate backup', async () => {
      // Bot has 2 GKs (101 and 112), so can sell one for premium
      const mainGK = botPlayers.find(p => p.id === 101)
      const highOffer = testData.tradeOffer({
        id: 4,
        player_id: 101,
        from_team_id: userTeam.id,
        type: 'buy',
        offer_value: 200000, // 2x the average price
        created_at: new Date().toISOString()
      })

      getIncomingBuyOffers.mockResolvedValue([highOffer])
      getPlayerById.mockResolvedValue(mainGK)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)

      await makeBotMoves()

      // Should accept - has backup GK and price is 2x average (above 1.5x premium)
      expect(acceptOffer).toHaveBeenCalled()
    })
  })

  describe('Bot-to-bot trading', () => {
    it('bot creates buy offer for needed position', async () => {
      // Bot team missing a CM (remove both CMs from roster)
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)
      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
          return [botTeam]
        }
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) {
          return playersNeedingCM
        }
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) {
          return [testData.stadium({ team_id: params[0] })]
        }
        // Simulate sell offers from another bot for CM players
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [
            {
              id: 100,
              player_id: 200,
              from_team_id: botTeam2.id,
              type: 'sell',
              offer_value: 80000,
              player_name: 'Other CM',
              player_level: 6,
              player_position: 'CM'
            }
          ]
        }
        if (sql.includes('INSERT INTO trade_offer')) {
          return { insertId: 999 }
        }
        return []
      })

      await makeBotMoves()

      // Should have created a buy offer for the CM
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer')
      )
      expect(insertCalls.length).toBeGreaterThan(0)
    })

    it('bot creates sell offer for unneeded player', async () => {
      // Add extra players that don't fit formation
      const extraPlayers = [
        ...botPlayers,
        testData.player({ id: 120, name: 'Extra CAM', position: 'CAM', level: 5, team_id: 10, in_game_position: null })
      ]
      getPlayersByTeamId.mockResolvedValue(extraPlayers)
      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
          return [botTeam]
        }
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) {
          return extraPlayers
        }
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) {
          return [testData.stadium({ team_id: params[0] })]
        }
        if (sql.includes('INSERT INTO trade_offer')) {
          return { insertId: 888 }
        }
        // Return no sell offers from other teams
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return []
        }
        return []
      })

      // Mock estimate value for the CAM
      const playersRoutes = await import('../routes/players.js')
      playersRoutes.default.estimateValue.mockResolvedValue(60000)

      await makeBotMoves()

      // Should have created a sell offer for the CAM (position not in 4-4-2)
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer')
      )
      expect(insertCalls.length).toBeGreaterThan(0)
    })

    it('bot accepts buy offer from another bot', async () => {
      const targetPlayer = botPlayers.find(p => p.id === 114) // ST3 backup
      const botBuyOffer = testData.tradeOffer({
        id: 5,
        player_id: 114,
        from_team_id: botTeam2.id, // From another bot
        type: 'buy',
        offer_value: 90000,
        created_at: new Date().toISOString()
      })

      getIncomingBuyOffers.mockResolvedValue([botBuyOffer])
      getPlayerById.mockResolvedValue(targetPlayer)
      getAveragePlanPriceOfPlayer.mockResolvedValue(50000)

      await makeBotMoves()

      // Should accept the offer from another bot
      expect(acceptOffer).toHaveBeenCalled()
    })
  })

  describe('Value-based buying decisions', () => {
    it('prefers higher level player for critical need', async () => {
      // Bot missing CM entirely
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
          return [botTeam]
        }
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) {
          return playersNeedingCM
        }
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) {
          return [testData.stadium({ team_id: params[0] })]
        }
        // Two CM options: one cheap low level, one expensive high level
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [
            {
              id: 201,
              player_id: 301,
              from_team_id: botTeam2.id,
              type: 'sell',
              offer_value: 50000,
              player_name: 'Low Level CM',
              player_level: 3,
              player_position: 'CM'
            },
            {
              id: 202,
              player_id: 302,
              from_team_id: botTeam2.id,
              type: 'sell',
              offer_value: 150000,
              player_name: 'High Level CM',
              player_level: 8,
              player_position: 'CM'
            }
          ]
        }
        if (sql.includes('INSERT INTO trade_offer')) {
          return { insertId: 777 }
        }
        return []
      })

      await makeBotMoves()

      // Should prefer the higher level CM for critical need
      const insertBuyCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'buy'
      )

      if (insertBuyCalls.length > 0) {
        const insertedOffer = insertBuyCalls[0][1]
        // The high level player (302) should be selected due to critical need priority
        expect(insertedOffer.player_id).toBe(302)
      }
    })
  })

  describe('Buy offer fair-value cap', () => {
    it('does not buy a player listed far above fair market value', async () => {
      // Bot has a critical CM need, so it would normally pay a 1.5x premium.
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)

      const inflatedPlayer = testData.player({
        id: 999,
        name: 'Inflated CM',
        position: 'CM',
        level: 6,
        carrier_start_season: 0
      })
      // Fair market value ~50k, but listing is 6x that
      getAveragePlanPriceOfPlayer.mockResolvedValue(50_000)
      getPlayerById.mockResolvedValue(inflatedPlayer)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return playersNeedingCM
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [{
            id: 555,
            player_id: 999,
            from_team_id: userTeam.id,
            type: 'sell',
            offer_value: 300_000, // way above fair value
            player_name: 'Inflated CM',
            player_level: 6,
            player_position: 'CM'
          }]
        }
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 1234 }
        return []
      })

      await makeBotMoves()

      const insertBuyCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'buy' && call[1]?.player_id === 999
      )
      expect(insertBuyCalls.length).toBe(0)
    })

    it('caps buy offer at fair value premium even when listing is slightly inflated', async () => {
      // Bot has critical CM need (1.5x fair value cap).
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)

      const cmPlayer = testData.player({
        id: 888,
        name: 'CM',
        position: 'CM',
        level: 6,
        carrier_start_season: 0
      })
      getAveragePlanPriceOfPlayer.mockResolvedValue(100_000)
      getPlayerById.mockResolvedValue(cmPlayer)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return playersNeedingCM
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [{
            id: 556,
            player_id: 888,
            from_team_id: userTeam.id,
            type: 'sell',
            offer_value: 140_000, // listing slightly above 1x fair value
            player_name: 'CM',
            player_level: 6,
            player_position: 'CM'
          }]
        }
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 1235 }
        return []
      })

      await makeBotMoves()

      const insertBuyCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'buy' && call[1]?.player_id === 888
      )
      // If the bot makes an offer, it must not exceed 1.5x fair value
      for (const call of insertBuyCalls) {
        expect(call[1].offer_value).toBeLessThanOrEqual(150_000)
      }
    })
  })

  describe('Edge cases', () => {
    it('handles no bot teams gracefully', async () => {
      query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) {
          return []
        }
        return []
      })

      // Should not throw
      await expect(makeBotMoves()).resolves.not.toThrow()
    })

    it('handles no incoming offers gracefully', async () => {
      getIncomingBuyOffers.mockResolvedValue([])
      getOpenSellOffersByTeamId.mockResolvedValue([])
      getOpenByOffersByTeamId.mockResolvedValue([])

      await expect(makeBotMoves()).resolves.not.toThrow()
      expect(acceptOffer).not.toHaveBeenCalled()
      expect(declineOffer).not.toHaveBeenCalled()
    })

    it('declines offer for non-existent player', async () => {
      const offerForMissingPlayer = testData.tradeOffer({
        id: 6,
        player_id: 9999, // Non-existent
        from_team_id: userTeam.id,
        type: 'buy',
        offer_value: 100000,
        created_at: new Date().toISOString()
      })

      getIncomingBuyOffers.mockResolvedValue([offerForMissingPlayer])
      getPlayerById.mockResolvedValue(null) // Player doesn't exist

      await makeBotMoves()

      expect(declineOffer).toHaveBeenCalledWith(offerForMissingPlayer)
      expect(acceptOffer).not.toHaveBeenCalled()
    })
  })

  describe('Guaranteed minimum sell offer', () => {
    it('lists weakest bench player when no sell offers exist', async () => {
      // All players fit the formation, no excess → normal logic produces 0 sell offers
      // But the guarantee should list the weakest non-starter
      getOpenSellOffersByTeamId.mockResolvedValue([]) // no existing sell offers

      playersRoutes.estimateValue.mockResolvedValue(50000)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return botPlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 500 }
        // No sell offers from other teams for buying
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        return []
      })

      await makeBotMoves()

      // Should create at least one sell offer for a bench player
      const insertCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'sell'
      )
      expect(insertCalls.length).toBeGreaterThanOrEqual(1)

      // The player should be a non-starter (one of id 112, 113, 114)
      const soldPlayerId = insertCalls[0][1].player_id
      const benchPlayerIds = [112, 113, 114]
      expect(benchPlayerIds).toContain(soldPlayerId)
    })

    it('does not add guaranteed offer when sell offers already exist', async () => {
      // Bot already has a sell offer
      getOpenSellOffersByTeamId.mockResolvedValue([
        testData.tradeOffer({ id: 50, player_id: 114, from_team_id: botTeam.id, type: 'sell' })
      ])

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return botPlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 500 }
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        return []
      })

      await makeBotMoves()

      // Should NOT create a guaranteed sell offer (already has one)
      const insertSellCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'sell'
      )
      expect(insertSellCalls.length).toBe(0)
    })
  })

  describe('Opportunistic buying', () => {
    it('bot makes opportunistic buy when market has better player than weakest', async () => {
      // All positions filled, squad depth good, but weakest player is level 3 (GK2, id=112)
      // A level 10 GK is on the market → opportunistic buy
      getPlayersByTeamId.mockResolvedValue([...botPlayers])
      getOpenByOffersByTeamId.mockResolvedValue([])

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return botPlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        // Market: a higher-level GK available
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [{
            id: 300,
            player_id: 400,
            from_team_id: botTeam2.id,
            type: 'sell',
            offer_value: 100000,
            player_name: 'Better GK',
            player_level: 10,
            player_position: 'GK'
          }]
        }
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 600 }
        return []
      })

      await makeBotMoves()

      const insertBuyCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'buy'
      )
      expect(insertBuyCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('bot with upgrade threshold 70 tries to buy when weakest is level 50', async () => {
      // Modify players so all are level 50+ except one at level 50
      const upgradePlayers = botPlayers.map(p => ({ ...p, level: p.id === 112 ? 50 : 60 }))
      getPlayersByTeamId.mockResolvedValue(upgradePlayers)
      getOpenByOffersByTeamId.mockResolvedValue([])

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return upgradePlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) {
          return [{
            id: 301,
            player_id: 401,
            from_team_id: botTeam2.id,
            type: 'sell',
            offer_value: 200000,
            player_name: 'Upgrade GK',
            player_level: 65,
            player_position: 'GK'
          }]
        }
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 601 }
        return []
      })

      await makeBotMoves()

      // With threshold raised to 70, level 50 triggers upgrade need
      const insertBuyCalls = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO trade_offer') && call[1]?.type === 'buy'
      )
      expect(insertBuyCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Unsolicited offers (#451)', () => {
    it('makes an unsolicited buy offer for an unlisted user player above market value', async () => {
      // Force the probability gate open.
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05)
      getPlayersByTeamId.mockResolvedValue([...botPlayers])
      getOpenByOffersByTeamId.mockResolvedValue([])
      // Keep the market value affordable (bot balance 500k -> maxPrice 400k).
      getAveragePlanPriceOfPlayer.mockResolvedValue(200000)

      const userPlayer = {
        ...testData.player({ id: 500, name: 'Star GK', position: 'GK', level: 80, team_id: 20 }),
        owner_user_id: 1
      }

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return botPlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        // No listed sell offers on the market.
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        // Unsolicited-offer candidate query.
        if (sql.includes('owner_user_id')) return [userPlayer]
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 700 }
        return []
      })

      await makeBotMoves()

      const unsolicitedInsert = query.mock.calls.find(call =>
        call[0].includes('INSERT INTO trade_offer') &&
        call[1]?.type === 'buy' &&
        call[1]?.player_id === 500
      )
      expect(unsolicitedInsert).toBeTruthy()
      // Offer is above the 200k market value.
      expect(unsolicitedInsert[1].offer_value).toBeGreaterThan(200000)

      randomSpy.mockRestore()
    })

    it('does not make an unsolicited offer when the probability gate is closed', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
      getPlayersByTeamId.mockResolvedValue([...botPlayers])
      getOpenByOffersByTeamId.mockResolvedValue([])
      getAveragePlanPriceOfPlayer.mockResolvedValue(200000)

      const userPlayer = {
        ...testData.player({ id: 501, name: 'Star GK', position: 'GK', level: 80, team_id: 20 }),
        owner_user_id: 1
      }

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return botPlayers
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        if (sql.includes('owner_user_id')) return [userPlayer]
        if (sql.includes('INSERT INTO trade_offer')) return { insertId: 701 }
        return []
      })

      await makeBotMoves()

      const unsolicitedInsert = query.mock.calls.find(call =>
        call[0].includes('INSERT INTO trade_offer') &&
        call[1]?.type === 'buy' &&
        call[1]?.player_id === 501
      )
      expect(unsolicitedInsert).toBeFalsy()

      randomSpy.mockRestore()
    })
  })

  describe('Free player signing race conditions', () => {
    const freePlayer = testData.player({
      id: 999,
      name: 'Henry Kramer',
      position: 'CM',
      level: 5,
      team_id: null
    })

    it('does not log HIRED entry when conditional UPDATE finds no free player (lost race)', async () => {
      // Bot has critical CM need
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return playersNeedingCM
        if (sql.includes('SELECT * FROM player WHERE team_id IS NULL')) return [freePlayer]
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        // Simulate that another parallel bot has already signed the player.
        if (sql.includes('UPDATE player SET team_id=?') && sql.includes('AND team_id IS NULL')) {
          return { affectedRows: 0, changedRows: 0 }
        }
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        return []
      })

      await makeBotMoves()

      const historyInserts = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO player_history')
      )
      expect(historyInserts).toHaveLength(0)
    })

    it('logs a single HIRED entry when bot wins the race', async () => {
      const playersNeedingCM = botPlayers.filter(p => p.position !== 'CM')
      getPlayersByTeamId.mockResolvedValue(playersNeedingCM)

      query.mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT * FROM team WHERE user_id IS NULL')) return [botTeam]
        if (sql.includes('SELECT * FROM player WHERE team_id IN')) return playersNeedingCM
        if (sql.includes('SELECT * FROM player WHERE team_id IS NULL')) return [freePlayer]
        if (sql.includes('SELECT * FROM stadium WHERE team_id')) return [testData.stadium({ team_id: params[0] })]
        if (sql.includes('UPDATE player SET team_id=?') && sql.includes('AND team_id IS NULL')) {
          return { affectedRows: 1, changedRows: 1 }
        }
        if (sql.includes('FROM trade_offer') && sql.includes('JOIN player')) return []
        return []
      })

      await makeBotMoves()

      const historyInserts = query.mock.calls.filter(call =>
        call[0].includes('INSERT INTO player_history')
      )
      expect(historyInserts).toHaveLength(1)
    })
  })
})
