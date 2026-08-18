import { query } from '../lib/database.js'
import { getPositionsOfFormation } from '../../client/util/formation.js'
import { willRetireNextSeason } from '../../client/util/player.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId } from './playerHelper.js'
import { acceptOffer, declineOffer, getOpenSellOffersByTeamId } from './tradeHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { getTeamById } from './teamHelper.js'

// A bot manager never answers a buy offer immediately. The decision is
// scheduled somewhere between these two bounds and executed by
// processDueBotOfferDecisions(). The delay is squared random, so most answers
// arrive within the first few hours while some take the better part of a day —
// that reads like a human manager checking in now and then, and it also stops
// users from probing a bot's acceptance threshold with a rapid series of offers.
export const BOT_DECISION_MIN_DELAY_MS = 15 * 60 * 1000
export const BOT_DECISION_MAX_DELAY_MS = 24 * 60 * 60 * 1000

/**
 * @returns {number} milliseconds until a bot answers, biased towards the lower end
 */
export function randomBotDecisionDelayMs () {
  const spread = BOT_DECISION_MAX_DELAY_MS - BOT_DECISION_MIN_DELAY_MS
  const random = Math.random()
  return Math.floor(BOT_DECISION_MIN_DELAY_MS + spread * random * random)
}

/**
 * The point in time a bot answers a buy offer created right now.
 * @returns {Date}
 */
export function botDecisionDate () {
  return new Date(Date.now() + randomBotDecisionDelayMs())
}

/**
 * Whether a computer-controlled team may spend money on this player.
 *
 * Players in their final season are off limits: users listed veterans in the
 * very season they retire and let the bots pay full market value for a squad
 * member that vanishes at the season transition. Human buyers may still take
 * the risk — they can see the retirement badge.
 *
 * @param {PlayerType} player
 * @param {number} season
 * @returns {boolean}
 */
export function mayBotBuyPlayer (player, season) {
  return !willRetireNextSeason(player, season)
}

/**
 * Whether a scheduled bot decision is due. Offers without a scheduled date
 * (created before the delay existed, or by a path that does not schedule) are
 * always due, so nothing can get stuck on the market forever.
 *
 * @param {TradeOfferType & {bot_decision_at?: Date|string|null}} offer
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isBotDecisionDue (offer, now = Date.now()) {
  const raw = offer.bot_decision_at
  if (!raw) return true
  const due = raw instanceof Date ? raw.getTime() : Date.parse(raw)
  if (Number.isNaN(due)) return true
  return due <= now
}

/**
 * The bot's verdict on an incoming buy offer for one of its players.
 *
 * Shared by the scheduled decision run and the bot move cron so a bot judges an
 * offer the same way no matter which path answers it.
 *
 * @param {TeamType} botTeam
 * @param {PlayerType} player - the player the offer is for
 * @param {TradeOfferType} offer
 * @param {PlayerType[]} squad - the bot's current players (including `player`)
 * @returns {Promise<boolean>}
 */
export async function shouldBotAcceptBuyOffer (botTeam, player, offer, squad) {
  const openSellOffers = await getOpenSellOffersByTeamId(botTeam.id)
  const matchingSellOffer = openSellOffers.find(sellOffer => sellOffer.player_id === player.id)

  // The bot's own asking price is binding: whoever meets it gets the player.
  if (matchingSellOffer && offer.offer_value >= matchingSellOffer.offer_value) return true

  const positionsNeeded = getPositionsOfFormation(botTeam.formation)
  const playersInSamePosition = squad.filter(p => p.position === player.position && p.id !== player.id)
  const positionsRequiredForFormation = positionsNeeded.filter(p => p === player.position).length

  // Would selling leave a hole in the formation?
  const wouldLeaveHole = playersInSamePosition.length < positionsRequiredForFormation

  const averagePrice = await getAveragePlanPriceOfPlayer(player)
  const basePrice = matchingSellOffer ? matchingSellOffer.offer_value : averagePrice

  if (wouldLeaveHole) {
    // Only sell a player the formation needs when a comparable backup exists…
    const remainingPlayersInPosition = playersInSamePosition.filter(p => p.level >= player.level - 2)
    const teamWouldBeOkAfterSale = remainingPlayersInPosition.length >= positionsRequiredForFormation
    if (!teamWouldBeOkAfterSale || playersInSamePosition.length === 0) return false
    // …and only for a premium of 1.5x - 2x the base price.
    const premiumFactor = 1.5 + Math.random() * 0.5
    return offer.offer_value >= basePrice * premiumFactor
  }

  // Normal sale - randomize acceptance threshold (80% - 120% of base price)
  const randomFactor = 0.8 + Math.random() * 0.4
  return offer.offer_value >= basePrice * randomFactor
}

/**
 * Answer all buy offers whose scheduled bot decision has come due.
 *
 * Runs far more often than the 12h game-day cron so the answers land spread
 * across the day instead of in two big batches.
 *
 * @returns {Promise<number>} number of offers answered
 */
export async function processDueBotOfferDecisions () {
  // The due date is compared through the driver (not against SQL NOW()) so the
  // comparison uses the same timezone conversion that stored the value.
  const dueOffers = await query(`
      SELECT tro.*
      FROM trade_offer tro
               JOIN player p ON p.id = tro.player_id
               JOIN team t ON t.id = p.team_id
      WHERE tro.type = 'buy'
        AND tro.status = 'open'
        AND tro.bot_decision_at IS NOT NULL
        AND tro.bot_decision_at <= ?
        AND t.user_id IS NULL
        AND t.is_system_team = 0
        AND t.id <> tro.from_team_id
      ORDER BY tro.offer_value DESC
  `, [new Date()])
  if (dueOffers.length === 0) return 0

  const { gameDay, season } = await getGameDayAndSeason()
  const soldPlayerIds = new Set()
  let answered = 0

  for (const offer of dueOffers) {
    // The highest offer comes first; once a player is sold their remaining
    // offers are gone already (acceptOffer cleans them up).
    if (soldPlayerIds.has(offer.player_id)) continue
    try {
      const player = await getPlayerById(offer.player_id)
      if (!player || !player.team_id) continue
      const botTeam = await getTeamById(player.team_id)
      if (!botTeam) continue
      const squad = await getPlayersByTeamId(botTeam.id)
      const accept = await shouldBotAcceptBuyOffer(botTeam, player, offer, squad)
      if (accept) {
        await acceptOffer(offer, botTeam, gameDay, season)
        soldPlayerIds.add(offer.player_id)
        console.log(`🤝 ${botTeam.name} sold player ${player.name} for ${offer.offer_value}`)
      } else {
        await declineOffer(offer)
      }
      answered++
    } catch (e) {
      // The offer may have been consumed elsewhere in the meantime - skip it.
      console.log(`⚠️ Bot could not answer buy offer ${offer.id}: ${e.message}`)
    }
  }

  if (answered > 0) console.log(`🤖 Answered ${answered} due bot buy offer decision(s)`)
  return answered
}
