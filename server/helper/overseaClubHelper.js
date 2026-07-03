import { query } from '../lib/database.js'
import { Position } from '../../client/util/formation.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { getAveragePlanPriceOfPlayer, getPlayersByTeamId } from './playerHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { acceptOffer } from './tradeHelper.js'
import { getTeamById } from './teamHelper.js'
import { randomItem } from '../lib/util.js'

const POSITIONS = Object.values(Position)
const TIERS = [
  { name: 'bronze', minLevel: 1, maxLevel: 40, minOffers: 8 },
  { name: 'silver', minLevel: 41, maxLevel: 70, minOffers: 10 },
  { name: 'gold', minLevel: 71, maxLevel: 100, minOffers: 2 }
]

// Probability that the IOC makes a buy offer for a given user team on a single
// run. ~40% → on average an offer roughly every 2nd–3rd game day per team.
const IOC_OFFER_CHANCE_PER_TEAM = 0.4
// Random price deviation applied when the IOC offers at market value (±3%).
const IOC_PRICE_DEVIATION = 0.03

let cachedIOCTeamId = null

/**
 * Get the IOC system team ID (cached)
 * @returns {Promise<number|null>}
 */
export async function getIOCTeamId () {
  if (cachedIOCTeamId) return cachedIOCTeamId
  const [row] = await query('SELECT id FROM team WHERE is_system_team = 1 LIMIT 1')
  cachedIOCTeamId = row?.id ?? null
  return cachedIOCTeamId
}

/**
 * Determine which level tier a player level falls into
 * @param {number} level
 * @returns {{ name: string, minLevel: number, maxLevel: number }}
 */
function getTier (level) {
  if (level <= 40) return TIERS[0]
  if (level <= 70) return TIERS[1]
  return TIERS[2]
}

/**
 * Fill market gaps so every position/tier combination has at least MIN_OFFERS_PER_SLOT sell offers
 * @returns {Promise<number>} Number of offers created
 */
export async function fillMarketGaps () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) {
    console.log('IOC team not found, skipping fillMarketGaps')
    return 0
  }

  const { season } = await getGameDayAndSeason()

  // Count existing sell offers grouped by position and tier
  const existingOffers = await query(`
    SELECT p.position, p.level, COUNT(*) AS cnt
    FROM trade_offer tro
    JOIN player p ON p.id = tro.player_id
    WHERE tro.type = 'sell' AND tro.status = 'open'
    GROUP BY p.position, p.level
  `)

  // Build a map: position -> tier -> count
  const offerCounts = {}
  for (const pos of POSITIONS) {
    offerCounts[pos] = { bronze: 0, silver: 0, gold: 0 }
  }
  for (const row of existingOffers) {
    const tier = getTier(row.level)
    if (offerCounts[row.position]) {
      offerCounts[row.position][tier.name] += row.cnt
    }
  }

  let totalCreated = 0

  for (const position of POSITIONS) {
    for (const tier of TIERS) {
      const current = offerCounts[position][tier.name]
      const deficit = tier.minOffers - current
      if (deficit <= 0) continue

      for (let i = 0; i < deficit; i++) {
        await _createIOCPlayerWithOffer(iocTeamId, position, tier, season)
        totalCreated++
      }
    }
  }

  if (totalCreated > 0) {
    console.log(`IOC: Created ${totalCreated} sell offers to fill market gaps`)
  }
  return totalCreated
}

/**
 * Create an IOC player and a sell offer for them
 * @param {number} iocTeamId
 * @param {string} position
 * @param {{ minLevel: number, maxLevel: number }} tier
 * @param {number} season
 */
async function _createIOCPlayerWithOffer (iocTeamId, position, tier, season) {
  const level = tier.minLevel + Math.floor(Math.random() * (tier.maxLevel - tier.minLevel + 1))
  const age = 20 + Math.floor(Math.random() * 9) // 20-28
  const carrierStartSeason = season - age + 16
  const carrierEndSeason = carrierStartSeason + 20 + Math.floor(Math.random() * 4)

  const player = {
    hair_color: Math.floor(Math.random() * 7),
    skin_color: Math.floor(Math.random() * 4),
    team_id: iocTeamId,
    name: await generateRandomPlayerName(),
    carrier_start_season: carrierStartSeason,
    carrier_end_season: carrierEndSeason,
    level,
    in_game_position: '',
    position,
    freshness: 0.7 + Math.random() * 0.3 // 70-100%
  }

  const { insertId: playerId } = await query('INSERT INTO player SET ?', player)

  // Calculate price based on market value with +/- 10% randomness
  const marketValue = await getAveragePlanPriceOfPlayer({ ...player, id: playerId })
  const priceFactor = 0.9 + Math.random() * 0.2 // 0.9 to 1.1
  const price = Math.max(1000, Math.floor(marketValue * priceFactor))

  await query('INSERT INTO trade_offer SET ?', {
    offer_value: price,
    type: 'sell',
    player_id: playerId,
    from_team_id: iocTeamId
  })
}

/**
 * Market value with ±{@link IOC_PRICE_DEVIATION} random deviation. Floored,
 * never below 1000.
 * @param {number} marketValue
 * @returns {number}
 */
function _marketValueWithDeviation (marketValue) {
  const factor = 1 - IOC_PRICE_DEVIATION + Math.random() * (IOC_PRICE_DEVIATION * 2)
  return Math.max(1000, Math.floor(marketValue * factor))
}

/**
 * For every user-managed team the IOC may make a single buy offer per run
 * (~{@link IOC_OFFER_CHANCE_PER_TEAM} chance per team). At most one open IOC buy
 * offer exists per team at any time: while an offer is pending the user has to
 * accept or decline it before the IOC offers for that team again.
 *
 * Three cases per team:
 *  (1) The user lists a player at or below market value → IOC buys directly
 *      (auto-accepts the sale at the asking price).
 *  (2) The user lists a player only above market value → IOC offers the market
 *      value with ±3% deviation (user sees it as an incoming offer).
 *  (3) The user lists no player → IOC offers for a random player of the team at
 *      market value with ±3% deviation.
 *
 * @returns {Promise<number>} Number of buys/offers made
 */
export async function iocBuyFromUsers () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) {
    console.log('IOC team not found, skipping iocBuyFromUsers')
    return 0
  }

  const { gameDay, season } = await getGameDayAndSeason()

  // All user-managed (non-system) teams
  const userTeams = await query(
    'SELECT * FROM team WHERE user_id IS NOT NULL AND is_system_team = 0'
  )

  let actionCount = 0

  for (const team of userTeams) {
    // ~40% chance per team per run
    if (Math.random() >= IOC_OFFER_CHANCE_PER_TEAM) continue

    // Only one open IOC buy offer per team at a time. If one is already pending
    // on any of this team's players, leave it — the user must accept or decline
    // before the IOC offers again.
    const [existingIOCOffer] = await query(`
      SELECT tro.id FROM trade_offer tro
      JOIN player p ON p.id = tro.player_id
      WHERE tro.from_team_id = ? AND tro.type = 'buy' AND tro.status = 'open'
        AND p.team_id = ?
      LIMIT 1
    `, [iocTeamId, team.id])
    if (existingIOCOffer) continue

    // The team's own open sell offers, with each player's market value
    const sellOffers = await query(`
      SELECT tro.*, p.level, p.name AS player_name, p.carrier_start_season, p.carrier_end_season
      FROM trade_offer tro
      JOIN player p ON p.id = tro.player_id
      WHERE tro.from_team_id = ? AND tro.type = 'sell' AND tro.status = 'open'
    `, [team.id])

    const offersWithValue = []
    for (const offer of sellOffers) {
      const marketValue = await getAveragePlanPriceOfPlayer({
        level: offer.level,
        carrier_start_season: offer.carrier_start_season,
        carrier_end_season: offer.carrier_end_season
      }, season)
      offersWithValue.push({ offer, marketValue })
    }

    // (1) Player listed at or below market value → buy directly
    const affordableListed = offersWithValue.filter(o => o.offer.offer_value <= o.marketValue)
    if (affordableListed.length > 0) {
      const { offer } = randomItem(affordableListed)
      try {
        const { insertId } = await query('INSERT INTO trade_offer SET ?', {
          offer_value: offer.offer_value,
          type: 'buy',
          player_id: offer.player_id,
          from_team_id: iocTeamId,
          game_day: gameDay,
          season
        })
        const [buyOffer] = await query('SELECT * FROM trade_offer WHERE id = ?', [insertId])
        if (buyOffer) {
          await acceptOffer(buyOffer, team, gameDay, season)
          actionCount++
          console.log(`🤝 IOC directly bought ${offer.player_name} from ${team.name} for ${offer.offer_value}`)
        }
      } catch (e) {
        // Player may have been sold/transferred since we fetched the sell offers
        console.log(`⚠️ IOC could not buy player ${offer.player_id} from ${team.name}: ${e.message}`)
      }
      continue
    }

    // (2) Player(s) listed but all above market value → offer market value ±3%
    if (offersWithValue.length > 0) {
      const { offer, marketValue } = randomItem(offersWithValue)
      const offerValue = _marketValueWithDeviation(marketValue)
      await query('INSERT INTO trade_offer SET ?', {
        offer_value: offerValue,
        type: 'buy',
        player_id: offer.player_id,
        from_team_id: iocTeamId,
        game_day: gameDay,
        season
      })
      actionCount++
      console.log(`✉️ IOC offered ${offerValue} for listed ${offer.player_name} of ${team.name} (above-market listing)`)
      continue
    }

    // (3) No sell offers → offer for a random player of the team at market ±3%
    const players = await getPlayersByTeamId(team.id)
    if (players.length === 0) continue
    const player = randomItem(players)
    const marketValue = await getAveragePlanPriceOfPlayer(player, season)
    const offerValue = _marketValueWithDeviation(marketValue)
    await query('INSERT INTO trade_offer SET ?', {
      offer_value: offerValue,
      type: 'buy',
      player_id: player.id,
      from_team_id: iocTeamId,
      game_day: gameDay,
      season
    })
    actionCount++
    console.log(`✉️ IOC made unsolicited offer of ${offerValue} for ${player.name} of ${team.name}`)
  }

  if (actionCount > 0) {
    console.log(`IOC: Made ${actionCount} buy action(s) for user teams`)
  }
  return actionCount
}

/**
 * Auto-accept all open buy offers on IOC players.
 * This ensures bots (and users) can actually purchase from the IOC market.
 * @returns {Promise<number>} Number of offers accepted
 */
export async function iocAutoAcceptBuyOffers () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) {
    console.log('IOC team not found, skipping iocAutoAcceptBuyOffers')
    return 0
  }

  const { gameDay, season } = await getGameDayAndSeason()
  const iocTeam = await getTeamById(iocTeamId)
  if (!iocTeam) return 0

  // Find all open buy offers on IOC players
  const buyOffers = await query(`
    SELECT tro.*
    FROM trade_offer tro
    JOIN player p ON p.id = tro.player_id
    WHERE tro.type = 'buy' AND tro.status = 'open'
      AND p.team_id = ?
      AND tro.from_team_id <> ?
  `, [iocTeamId, iocTeamId])

  let acceptedCount = 0

  for (const offer of buyOffers) {
    try {
      await acceptOffer(offer, iocTeam, gameDay, season)
      acceptedCount++
    } catch (e) {
      console.log(`⚠️ IOC could not accept buy offer ${offer.id}: ${e.message}`)
    }
  }

  if (acceptedCount > 0) {
    console.log(`IOC: Auto-accepted ${acceptedCount} incoming buy offer(s)`)
  }
  return acceptedCount
}

/**
 * Delete IOC players that have no active sell offer (orphans)
 * @returns {Promise<number>} Number of players cleaned up
 */
export async function cleanupIOCPlayers () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) return 0

  // Find IOC players with no active sell offer
  const orphanedPlayers = await query(`
    SELECT p.id FROM player p
    LEFT JOIN trade_offer tro ON tro.player_id = p.id AND tro.type = 'sell'
    WHERE p.team_id = ? AND tro.id IS NULL
  `, [iocTeamId])

  for (const player of orphanedPlayers) {
    await query('DELETE FROM player_history WHERE player_id = ?', [player.id])
    await query('DELETE FROM trade_offer WHERE player_id = ?', [player.id])
    await query('DELETE FROM trade_history WHERE player_id = ?', [player.id])
    await query('DELETE FROM player WHERE id = ?', [player.id])
  }

  if (orphanedPlayers.length > 0) {
    console.log(`IOC: Cleaned up ${orphanedPlayers.length} orphaned player(s)`)
  }
  return orphanedPlayers.length
}
