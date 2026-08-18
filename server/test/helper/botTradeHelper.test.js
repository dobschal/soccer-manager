import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/tradeHelper.js', () => ({
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  getOpenSellOffersByTeamId: vi.fn()
}))

vi.mock('../../helper/playerHelper.js', () => ({
  getAveragePlanPriceOfPlayer: vi.fn(),
  getPlayerById: vi.fn(),
  getPlayersByTeamId: vi.fn()
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeamById: vi.fn()
}))

import { query } from '../../lib/database.js'
import { acceptOffer, declineOffer, getOpenSellOffersByTeamId } from '../../helper/tradeHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId } from '../../helper/playerHelper.js'
import { getGameDayAndSeason } from '../../helper/gameDayHelper.js'
import { getTeamById } from '../../helper/teamHelper.js'
import {
  BOT_DECISION_MAX_DELAY_MS,
  BOT_DECISION_MIN_DELAY_MS,
  botDecisionDate,
  isBotDecisionDue,
  mayBotBuyPlayer,
  processDueBotOfferDecisions,
  randomBotDecisionDelayMs,
  shouldBotAcceptBuyOffer
} from '../../helper/botTradeHelper.js'

describe('botTradeHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOpenSellOffersByTeamId.mockResolvedValue([])
    getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
    getGameDayAndSeason.mockResolvedValue({ gameDay: 5, season: 3 })
  })

  describe('randomBotDecisionDelayMs', () => {
    it('stays between the 15 minute and 24 hour bounds', () => {
      for (let i = 0; i < 200; i++) {
        const delay = randomBotDecisionDelayMs()
        expect(delay).toBeGreaterThanOrEqual(BOT_DECISION_MIN_DELAY_MS)
        expect(delay).toBeLessThanOrEqual(BOT_DECISION_MAX_DELAY_MS)
      }
    })

    it('never answers instantly', () => {
      // A user must not be able to read the bot's verdict off their own request.
      vi.spyOn(Math, 'random').mockReturnValue(0)
      expect(randomBotDecisionDelayMs()).toBe(BOT_DECISION_MIN_DELAY_MS)
      Math.random.mockRestore()
    })

    it('reaches the full 24 hours at the top of the range', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1)
      expect(randomBotDecisionDelayMs()).toBe(BOT_DECISION_MAX_DELAY_MS)
      Math.random.mockRestore()
    })

    it('is biased towards the lower end of the range', () => {
      // Squared randomness: most answers arrive in the first few hours.
      const delays = Array.from({ length: 500 }, () => randomBotDecisionDelayMs())
      const withinHalfADay = delays.filter(d => d <= 12 * 60 * 60 * 1000).length
      expect(withinHalfADay).toBeGreaterThan(delays.length * 0.6)
    })
  })

  describe('botDecisionDate', () => {
    it('is in the future', () => {
      expect(botDecisionDate().getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('isBotDecisionDue', () => {
    it('treats an offer without a scheduled date as due', () => {
      // Offers created before the delay existed must not get stuck forever.
      expect(isBotDecisionDue(testData.tradeOffer({ bot_decision_at: null }))).toBe(true)
      expect(isBotDecisionDue(testData.tradeOffer({}))).toBe(true)
    })

    it('is not due while the scheduled date is in the future', () => {
      const offer = testData.tradeOffer({ bot_decision_at: new Date(Date.now() + 60000) })
      expect(isBotDecisionDue(offer)).toBe(false)
    })

    it('is due once the scheduled date has passed', () => {
      const offer = testData.tradeOffer({ bot_decision_at: new Date(Date.now() - 60000) })
      expect(isBotDecisionDue(offer)).toBe(true)
    })

    it('accepts a date string as stored by the driver', () => {
      const offer = testData.tradeOffer({ bot_decision_at: new Date(Date.now() - 60000).toISOString() })
      expect(isBotDecisionDue(offer)).toBe(true)
    })
  })

  describe('mayBotBuyPlayer', () => {
    it('rejects a player in their final season', () => {
      expect(mayBotBuyPlayer(testData.player({ carrier_end_season: 3 }), 3)).toBe(false)
    })

    it('allows a player with seasons left', () => {
      expect(mayBotBuyPlayer(testData.player({ carrier_end_season: 5 }), 3)).toBe(true)
    })
  })

  describe('shouldBotAcceptBuyOffer', () => {
    // 352 needs one GK and two DMs.
    const botTeam = testData.team({ id: 10, user_id: null, formation: '352' })
    // Three DMs, so selling one leaves no hole in the formation.
    const squad = [
      testData.player({ id: 1, position: 'DM', level: 50, team_id: 10 }),
      testData.player({ id: 2, position: 'DM', level: 50, team_id: 10 }),
      testData.player({ id: 4, position: 'DM', level: 50, team_id: 10 }),
      testData.player({ id: 3, position: 'GK', level: 50, team_id: 10 })
    ]

    it('always accepts an offer that meets its own asking price', async () => {
      const player = squad[0]
      getOpenSellOffersByTeamId.mockResolvedValue([
        testData.tradeOffer({ type: 'sell', player_id: 1, offer_value: 200000 })
      ])
      const offer = testData.tradeOffer({ type: 'buy', player_id: 1, offer_value: 200000 })

      expect(await shouldBotAcceptBuyOffer(botTeam, player, offer, squad)).toBe(true)
    })

    it('declines an offer clearly below market value', async () => {
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      const offer = testData.tradeOffer({ type: 'buy', player_id: 1, offer_value: 10000 })

      expect(await shouldBotAcceptBuyOffer(botTeam, squad[0], offer, squad)).toBe(false)
    })

    it('accepts a generous offer for a player with backup', async () => {
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      const offer = testData.tradeOffer({ type: 'buy', player_id: 1, offer_value: 1000000 })

      expect(await shouldBotAcceptBuyOffer(botTeam, squad[0], offer, squad)).toBe(true)
    })

    it('declines any offer for the only goalkeeper', async () => {
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)
      const onlyGoalkeeper = squad.find(p => p.position === 'GK')
      const offer = testData.tradeOffer({ type: 'buy', player_id: onlyGoalkeeper.id, offer_value: 10000000 })

      expect(await shouldBotAcceptBuyOffer(botTeam, onlyGoalkeeper, offer, squad)).toBe(false)
    })
  })

  describe('processDueBotOfferDecisions', () => {
    const botTeam = testData.team({ id: 10, name: 'Bot FC', user_id: null, formation: '352' })
    const squad = [
      testData.player({ id: 1, position: 'DM', level: 50, team_id: 10 }),
      testData.player({ id: 2, position: 'DM', level: 50, team_id: 10 }),
      testData.player({ id: 4, position: 'DM', level: 50, team_id: 10 })
    ]

    it('only looks at open buy offers of bot teams whose decision is due', async () => {
      query.mockResolvedValue([])

      await processDueBotOfferDecisions()

      const [sql, params] = query.mock.calls[0]
      expect(sql).toContain("tro.type = 'buy'")
      expect(sql).toContain("tro.status = 'open'")
      expect(sql).toContain('tro.bot_decision_at <= ?')
      expect(sql).toContain('t.user_id IS NULL')
      expect(sql).toContain('t.is_system_team = 0')
      expect(params[0]).toBeInstanceOf(Date)
    })

    it('accepts a due offer that meets the asking price', async () => {
      const dueOffer = testData.tradeOffer({
        id: 7,
        type: 'buy',
        player_id: 1,
        from_team_id: 20,
        offer_value: 500000,
        bot_decision_at: new Date(Date.now() - 1000)
      })
      query.mockResolvedValue([dueOffer])
      getPlayerById.mockResolvedValue(squad[0])
      getTeamById.mockResolvedValue(botTeam)
      getPlayersByTeamId.mockResolvedValue(squad)
      getOpenSellOffersByTeamId.mockResolvedValue([
        testData.tradeOffer({ type: 'sell', player_id: 1, offer_value: 400000 })
      ])

      const answered = await processDueBotOfferDecisions()

      expect(answered).toBe(1)
      expect(acceptOffer).toHaveBeenCalledWith(dueOffer, botTeam, 5, 3)
      expect(declineOffer).not.toHaveBeenCalled()
    })

    it('declines a due offer that is too low', async () => {
      const dueOffer = testData.tradeOffer({
        id: 8,
        type: 'buy',
        player_id: 1,
        from_team_id: 20,
        offer_value: 1000,
        bot_decision_at: new Date(Date.now() - 1000)
      })
      query.mockResolvedValue([dueOffer])
      getPlayerById.mockResolvedValue(squad[0])
      getTeamById.mockResolvedValue(botTeam)
      getPlayersByTeamId.mockResolvedValue(squad)
      getAveragePlanPriceOfPlayer.mockResolvedValue(100000)

      const answered = await processDueBotOfferDecisions()

      expect(answered).toBe(1)
      expect(declineOffer).toHaveBeenCalledWith(dueOffer)
      expect(acceptOffer).not.toHaveBeenCalled()
    })

    it('answers only the highest offer for a player it sells', async () => {
      // The lower offers are removed by acceptOffer itself, so touching them
      // afterwards would just produce "offer not found" noise.
      const high = testData.tradeOffer({ id: 1, type: 'buy', player_id: 1, offer_value: 900000 })
      const low = testData.tradeOffer({ id: 2, type: 'buy', player_id: 1, offer_value: 500000 })
      query.mockResolvedValue([high, low])
      getPlayerById.mockResolvedValue(squad[0])
      getTeamById.mockResolvedValue(botTeam)
      getPlayersByTeamId.mockResolvedValue(squad)
      getOpenSellOffersByTeamId.mockResolvedValue([
        testData.tradeOffer({ type: 'sell', player_id: 1, offer_value: 400000 })
      ])

      const answered = await processDueBotOfferDecisions()

      expect(answered).toBe(1)
      expect(acceptOffer).toHaveBeenCalledTimes(1)
      expect(acceptOffer).toHaveBeenCalledWith(high, botTeam, 5, 3)
      expect(declineOffer).not.toHaveBeenCalled()
    })

    it('survives an offer that was consumed in the meantime', async () => {
      const dueOffer = testData.tradeOffer({ id: 9, type: 'buy', player_id: 1, offer_value: 900000 })
      query.mockResolvedValue([dueOffer])
      getPlayerById.mockResolvedValue(squad[0])
      getTeamById.mockResolvedValue(botTeam)
      getPlayersByTeamId.mockResolvedValue(squad)
      getOpenSellOffersByTeamId.mockResolvedValue([
        testData.tradeOffer({ type: 'sell', player_id: 1, offer_value: 400000 })
      ])
      acceptOffer.mockRejectedValue(new Error('Offer not found'))

      await expect(processDueBotOfferDecisions()).resolves.toBe(0)
    })

    it('does nothing when no decision is due', async () => {
      query.mockResolvedValue([])

      expect(await processDueBotOfferDecisions()).toBe(0)
      expect(acceptOffer).not.toHaveBeenCalled()
      expect(declineOffer).not.toHaveBeenCalled()
    })
  })
})
