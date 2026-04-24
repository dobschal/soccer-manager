import { query } from '../lib/database.js'
import { Position } from '../../client/util/formation.js'
import { generateRandomPlayerName } from '../prepare-season.js'
import { getAveragePlanPriceOfPlayer } from './playerHelper.js'
import { getGameDayAndSeason } from './gameDayHelper.js'
import { acceptOffer } from './tradeHelper.js'
import { getTeamById } from './teamHelper.js'

const POSITIONS = Object.values(Position)
const TIERS = [
  { name: 'bronze', minLevel: 1, maxLevel: 40, minOffers: 8 },
  { name: 'silver', minLevel: 41, maxLevel: 70, minOffers: 5 },
  { name: 'gold', minLevel: 71, maxLevel: 100, minOffers: 2 }
]
const MAX_IOC_BUYS_PER_RUN = 10
const UNDERVALUED_THRESHOLD = 0.8

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
    skin_color: Math.floor(Math.random() * 3),
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
 * IOC buys undervalued sell offers (below 80% of market value), max 10 per run.
 * For bot sellers: auto-accept and delete the player.
 * For user sellers: place a buy offer at the sell price (user sees it in incoming offers).
 * @returns {Promise<number>} Number of buys made
 */
export async function iocBuyUndervaluedPlayers () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) {
    console.log('IOC team not found, skipping iocBuyUndervaluedPlayers')
    return 0
  }

  const { gameDay, season } = await getGameDayAndSeason()

  // Get all sell offers NOT from the IOC team
  const sellOffers = await query(`
    SELECT tro.*, p.level, p.position, p.carrier_start_season, p.carrier_end_season, p.team_id AS player_team_id
    FROM trade_offer tro
    JOIN player p ON p.id = tro.player_id
    WHERE tro.type = 'sell' AND tro.status = 'open' AND tro.from_team_id <> ?
  `, [iocTeamId])

  let buyCount = 0

  for (const offer of sellOffers) {
    if (buyCount >= MAX_IOC_BUYS_PER_RUN) break

    const marketValue = await getAveragePlanPriceOfPlayer({
      level: offer.level,
      carrier_start_season: offer.carrier_start_season,
      carrier_end_season: offer.carrier_end_season
    })

    if (offer.offer_value >= marketValue * UNDERVALUED_THRESHOLD) continue

    const sellingTeam = await getTeamById(offer.from_team_id)
    if (!sellingTeam) continue

    // Skip if IOC already has an offer for this player (open or rejected)
    const [existingOffer] = await query(
      'SELECT id FROM trade_offer WHERE from_team_id=? AND player_id=? AND status IN (\'open\', \'rejected\')',
      [iocTeamId, offer.player_id]
    )
    if (existingOffer) continue

    if (!sellingTeam.user_id) {
      // Bot seller: insert buy offer and auto-accept
      try {
        await query('INSERT INTO trade_offer SET ?', {
          offer_value: offer.offer_value,
          type: 'buy',
          player_id: offer.player_id,
          from_team_id: iocTeamId,
          game_day: gameDay,
          season
        })
        const [buyOffer] = await query(
          'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\'',
          [iocTeamId, offer.player_id]
        )
        if (buyOffer) {
          await acceptOffer(buyOffer, sellingTeam, gameDay, season)
        }
      } catch (e) {
        // Player may have been sold/transferred since we fetched the sell offers
        console.log(`⚠️ IOC could not buy player ${offer.player_id}: ${e.message}`)
      }
    } else {
      // User seller: place a buy offer at the sell price (user sees it in incoming offers)
      await query('INSERT INTO trade_offer SET ?', {
        offer_value: offer.offer_value,
        type: 'buy',
        player_id: offer.player_id,
        from_team_id: iocTeamId,
        game_day: gameDay,
        season
      })
    }

    buyCount++
  }

  if (buyCount > 0) {
    console.log(`IOC: Bought ${buyCount} undervalued player(s)`)
  }
  return buyCount
}

/**
 * Ensure a minimum number of transfers happen each game day.
 * If fewer than ceil(teamCount * 0.1) transfers occurred this game day,
 * IOC buys the cheapest available sell offers to reach the minimum.
 * @returns {Promise<number>} Number of additional buys made
 */
export async function iocEnsureMinimumTransfers () {
  const iocTeamId = await getIOCTeamId()
  if (!iocTeamId) {
    console.log('IOC team not found, skipping iocEnsureMinimumTransfers')
    return 0
  }

  const { gameDay, season } = await getGameDayAndSeason()

  // Count non-system teams to determine minimum transfers
  const [{ cnt: teamCount }] = await query('SELECT COUNT(*) AS cnt FROM team WHERE is_system_team = 0')
  const minTransfers = Math.ceil(teamCount * 0.1)

  // Count transfers that already happened this game day
  const [{ cnt: currentTransfers }] = await query(
    'SELECT COUNT(*) AS cnt FROM trade_history WHERE game_day = ? AND season = ?',
    [gameDay, season]
  )

  const deficit = minTransfers - currentTransfers
  if (deficit <= 0) return 0

  // Get cheapest available sell offers (not from IOC)
  const sellOffers = await query(`
    SELECT tro.*, p.level, p.position, p.team_id AS player_team_id
    FROM trade_offer tro
    JOIN player p ON p.id = tro.player_id
    WHERE tro.type = 'sell' AND tro.status = 'open' AND tro.from_team_id <> ?
    ORDER BY tro.offer_value ASC
    LIMIT ?
  `, [iocTeamId, deficit])

  let buyCount = 0

  for (const offer of sellOffers) {
    const sellingTeam = await getTeamById(offer.from_team_id)
    if (!sellingTeam) continue

    // Skip if IOC already has an offer for this player (open or rejected)
    const [existingOffer] = await query(
      'SELECT id FROM trade_offer WHERE from_team_id=? AND player_id=? AND status IN (\'open\', \'rejected\')',
      [iocTeamId, offer.player_id]
    )
    if (existingOffer) continue

    if (!sellingTeam.user_id) {
      // Bot seller: insert buy offer and auto-accept
      try {
        await query('INSERT INTO trade_offer SET ?', {
          offer_value: offer.offer_value,
          type: 'buy',
          player_id: offer.player_id,
          from_team_id: iocTeamId
        })
        const [buyOffer] = await query(
          'SELECT * FROM trade_offer WHERE from_team_id=? AND player_id=? AND type=\'buy\'',
          [iocTeamId, offer.player_id]
        )
        if (buyOffer) {
          await acceptOffer(buyOffer, sellingTeam, gameDay, season)
        }
      } catch (e) {
        console.log(`⚠️ IOC minimum transfer failed for player ${offer.player_id}: ${e.message}`)
      }
    } else {
      // User seller: place a buy offer at the sell price
      await query('INSERT INTO trade_offer SET ?', {
        offer_value: offer.offer_value,
        type: 'buy',
        player_id: offer.player_id,
        from_team_id: iocTeamId
      })
    }

    buyCount++
  }

  if (buyCount > 0) {
    console.log(`IOC: Ensured minimum transfers - bought ${buyCount} additional player(s) (target: ${minTransfers}, had: ${currentTransfers})`)
  }
  return buyCount
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
