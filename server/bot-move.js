import { query } from './lib/database.js'
import { getActionCards, mergeActionCards, playActionCard, generateYouthPlayerOptions, YOUTH_PLAYER_CARD_RANGES } from './helper/actionCardHelper.js'
import { randomItem } from './lib/util.js'
import { getSponsor, getSponsorOffers } from './helper/sponsorHelper.js'
import { Sponsor } from './entities/sponsor.js'
import { TradeOffer } from './entities/tradeOffer.js'
import {
  acceptOffer,
  declineOffer,
  getIncomingBuyOffers,
  getOpenByOffersByTeamId,
  getOpenSellOffersByTeamId
} from './helper/tradeHelper.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { buildStadium, calcuateStadiumBuild } from './helper/stadiumHelper.js'
import { getAveragePlanPriceOfPlayer, getPlayerById, getPlayersByTeamId } from './helper/playerHelper.js'
import { getPositionsOfFormation } from '../client/util/formation.js'
import { addPlayerHistory } from './helper/playerHistoryHelper.js'
import { placeBotCardBids } from './helper/actionCardMarketHelper.js'
import { isBotDecisionDue, shouldBotAcceptBuyOffer } from './helper/botTradeHelper.js'
import playersRoutes from './routes/players.js'

// 1. Check Tactic (/)
// 2. Play Action Cards (/)
// 3. Choose Sponsor (/)
// 4. Expand Stadium (/)
// 5. Trade Players (/)

/**
 * @returns {Promise<void>}
 */
export async function makeBotMoves () {
  /** @type {TeamType[]} */
  const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL AND is_system_team = 0')
  if (botTeams.length === 0) {
    console.log('No bot teams to process')
    return
  }
  const botTeamIds = botTeams.map(t => t.id).join(', ')
  /** @type {PlayerType[]} */
  const players = await query(`SELECT *
                               FROM player
                               WHERE team_id IN (${botTeamIds})`)
  /** @type {import('./entities/actionCard.js').ActionCardType[]} */
  const allActionCards = await query(`SELECT *
                                      FROM action_card
                                      WHERE team_id IN (${botTeamIds})
                                        AND played = 0
                                        AND state = 'received'`)
  const t1 = Date.now()
  const promises = []
  for (const botTeam of botTeams) {
    const teamCards = allActionCards.filter(c => c.team_id === botTeam.id)
    promises.push(_makeBotMove(botTeam, players, teamCards))
  }
  await Promise.all(promises)
  // Runs once per tick, not per bot team: it picks its own bidder per offer
  // and enforces the one-bid-per-manager-per-day cap globally (#505).
  try { await placeBotCardBids() } catch (e) { console.error('placeBotCardBids failed:', e) }
  console.log(`Made bot moves in ${Math.floor((Date.now() - t1) / 1000)}sec`)
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {import('./entities/actionCard.js').ActionCardType[]} actionCards
 * @returns {Promise<void>}
 */
async function _makeBotMove (botTeam, players, actionCards) {
  const isStrongTeam = botTeam.id % 2 === 0
  const playersOfTeam = players.filter(p => p.team_id === botTeam.id)
  await _checkTactic(botTeam, playersOfTeam, isStrongTeam)
  await _checkActionCards(botTeam, playersOfTeam, isStrongTeam, actionCards)
  await _chooseSponsor(botTeam, isStrongTeam)
  await _checkStadium(botTeam)
  await _checkTrades(botTeam, playersOfTeam)
  // Re-check lineup after trades to fill holes left by sold/fired players
  const updatedPlayers = await getPlayersByTeamId(botTeam.id)
  await _checkTactic(botTeam, updatedPlayers, isStrongTeam)
}

/**
 * @param {TeamType} botTeam
 * @returns {Promise<void>}
 */
async function _checkStadium (botTeam) {
  if (Math.random() > 0.1) return
  /** @type {StadiumType} */
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [botTeam.id])
  // A bot team may not have a stadium row yet — nothing to adjust in that case.
  if (!stadium) return
  /** @type {GameType[]} */
  const [game] = await query('SELECT details FROM game WHERE team_1_id=? AND played=1 AND game_type=\'league\' ORDER BY season DESC, game_day DESC LIMIT 1', [botTeam.id])
  if (game && game.details) {
    const details = JSON.parse(game.details)
    const totalGuests = details.stadiumDetails.northGuests + details.stadiumDetails.southGuests + details.stadiumDetails.eastGuests + details.stadiumDetails.westGuests
    const totalSize = stadium.north_stand_size + stadium.south_stand_size + stadium.east_stand_size + stadium.west_stand_size
    if (totalGuests >= 0.99 * totalSize) {
      stadium.north_stand_price += 1
      stadium.south_stand_price += 1
      stadium.east_stand_price += 1
      stadium.west_stand_price += 1
      await query('UPDATE stadium SET north_stand_price=?, south_stand_price=?, east_stand_price=?, west_stand_price=? WHERE id=?', [
        stadium.north_stand_price,
        stadium.south_stand_price,
        stadium.east_stand_price,
        stadium.west_stand_price,
        stadium.id
      ])
    } else if (stadium.north_stand_price > 5 && totalGuests < 0.8 * totalSize) {
      stadium.north_stand_price -= 1
      stadium.south_stand_price -= 1
      stadium.east_stand_price -= 1
      stadium.west_stand_price -= 1
      await query('UPDATE stadium SET north_stand_price=?, south_stand_price=?, east_stand_price=?, west_stand_price=? WHERE id=?', [
        stadium.north_stand_price,
        stadium.south_stand_price,
        stadium.east_stand_price,
        stadium.west_stand_price,
        stadium.id
      ])
    }
  }
  // Check if any stand is under construction - if so, skip expansion
  const stands = ['north', 'south', 'east', 'west']
  const anyUnderConstruction = stands.some(stand => stadium[`${stand}_construction_end_game_day`] != null)
  if (anyUnderConstruction) return

  /** @type {StadiumType} */
  const newStadium = JSON.parse(JSON.stringify(stadium))
  if (Math.random() > 0.5) newStadium.east_stand_size = Math.floor(newStadium.east_stand_size * (1 + Math.random()))
  if (Math.random() > 0.5) newStadium.north_stand_size = Math.floor(newStadium.north_stand_size * (1 + Math.random()))
  if (Math.random() > 0.5) newStadium.west_stand_size = Math.floor(newStadium.west_stand_size * (1 + Math.random()))
  if (Math.random() > 0.5) newStadium.south_stand_size = Math.floor(newStadium.south_stand_size * (1 + Math.random()))
  if (Math.random() > 0.5) newStadium.east_stand_roof = 1
  if (Math.random() > 0.5) newStadium.west_stand_roof = 1
  if (Math.random() > 0.5) newStadium.north_stand_roof = 1
  if (Math.random() > 0.5) newStadium.south_stand_roof = 1
  const price = calcuateStadiumBuild(stadium, newStadium)
  if (price > 0 && price < botTeam.balance * 0.8) {
    await buildStadium(botTeam, stadium, newStadium, price)
    console.log(`🏗️ ${botTeam.name} is starting stadium construction!`)
    botTeam.balance -= price
  }
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _checkIncomingOffers (botTeam, players) {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  // Offers whose scheduled answer time has not come yet are left alone: they are
  // handled by processDueBotOfferDecisions() once they are due. This run is only
  // the backstop for offers that never got a due date.
  const incomingOffers = (await getIncomingBuyOffers(botTeam.id)).filter(offer => isBotDecisionDue(offer))

  // Group incoming offers by player, sorted by highest offer first
  /** @type {{[playerId: number]: Array<TradeOfferType>}} */
  const incomingOffersPerPlayer = {}
  incomingOffers.forEach(offer => {
    incomingOffersPerPlayer[offer.player_id] = incomingOffersPerPlayer[offer.player_id] ?? []
    incomingOffersPerPlayer[offer.player_id].push(offer)
  })

  for (let playerId in incomingOffersPerPlayer) {
    playerId = Number(playerId)
    const offer = incomingOffersPerPlayer[playerId][0] // take first as it is highest offer
    const player = await getPlayerById(playerId)
    if (!player) {
      await declineOffer(offer)
      continue
    }

    if (await shouldBotAcceptBuyOffer(botTeam, player, offer, players)) {
      try {
        await acceptOffer(offer, botTeam, gameDay, season)
        // Update local players array to reflect the sale
        const soldPlayerIndex = players.findIndex(p => p.id === playerId)
        if (soldPlayerIndex !== -1) players.splice(soldPlayerIndex, 1)
        console.log(`🤝 ${botTeam.name} sold player ${player.name} for ${offer.offer_value}`)
      } catch (e) {
        // Offer may have been consumed by another parallel bot move - skip gracefully
        console.log(`⚠️ ${botTeam.name} could not accept offer for ${player.name}: ${e.message}`)
      }
    } else {
      await declineOffer(offer)
    }
  }
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _checkSellOffers (botTeam, players) {
  // First, delete old offers that haven't been answered
  const existingOffers = await getOpenSellOffersByTeamId(botTeam.id)
  await deleteTooOldOffers(existingOffers, 24)

  // Get updated list of offers after cleanup
  const currentOffers = await getOpenSellOffersByTeamId(botTeam.id)
  const playerIdsWithOffers = new Set(currentOffers.map(o => o.player_id))

  // Determine which positions are needed for the formation
  const positionsNeeded = getPositionsOfFormation(botTeam.formation)

  // Find players to sell:
  // 1. Players whose position doesn't fit the formation
  // 2. Excess players for positions (keep 2x what formation needs)
  const playersToSell = []

  for (const player of players) {
    // Skip if already has a sell offer
    if (playerIdsWithOffers.has(player.id)) continue

    // Check if position is not in formation at all
    if (!positionsNeeded.includes(player.position)) {
      playersToSell.push(player)
      continue
    }

    // Check if we have too many players for this position
    const positionsRequiredForFormation = positionsNeeded.filter(p => p === player.position).length
    const maxPlayersWanted = positionsRequiredForFormation * 2 // Keep 2x formation requirement
    const playersInPosition = players.filter(p => p.position === player.position)

    if (playersInPosition.length > maxPlayersWanted) {
      // Sell the weakest excess players in this position
      const excessCount = playersInPosition.length - maxPlayersWanted
      const sortedByLevel = [...playersInPosition].sort((a, b) => a.level - b.level)
      const excessPlayers = sortedByLevel.slice(0, excessCount)
      if (excessPlayers.some(p => p.id === player.id)) {
        playersToSell.push(player)
      }
    }
  }

  // Create sell offers for players to sell (max 5 at a time to clear excess positions)
  const maxNewOffers = Math.min(5 - currentOffers.length, playersToSell.length)
  for (let i = 0; i < maxNewOffers; i++) {
    const playerToSell = playersToSell[i]
    const price = await playersRoutes.estimateValue(playerToSell.id)
    // Randomize price between 90% and 130% of estimated value. The lower bound is
    // kept at 90% (not 70%) so bots never dump players well below market: cheap
    // outliers used to feed back into estimateValue and drag the whole market
    // average down, which active traders exploited to buy at ~half plan value.
    const randomFactor = 0.9 + Math.random() * 0.4
    const offerValue = Math.floor(price * randomFactor)

    const tradeOffer = new TradeOffer({
      offer_value: offerValue,
      type: 'sell',
      player_id: playerToSell.id,
      from_team_id: botTeam.id
    })
    await query('INSERT INTO trade_offer SET ?', tradeOffer)
    console.log(`📢 ${botTeam.name} put ${playerToSell.name} on market for ${offerValue}`)
  }

  // Ensure at least 1 sell offer: if none exist after above logic, list weakest non-starter
  const totalOffers = currentOffers.length + maxNewOffers
  if (totalOffers === 0) {
    const nonStarters = players.filter(p => !p.in_game_position && !playerIdsWithOffers.has(p.id))
    if (nonStarters.length > 0) {
      const weakest = nonStarters.sort((a, b) => a.level - b.level)[0]
      const price = await playersRoutes.estimateValue(weakest.id)
      // Slight premium (100-130%) since this player isn't truly "for sale"
      const premiumFactor = 1.0 + Math.random() * 0.3
      const offerValue = Math.floor(price * premiumFactor)

      const tradeOffer = new TradeOffer({
        offer_value: offerValue,
        type: 'sell',
        player_id: weakest.id,
        from_team_id: botTeam.id
      })
      await query('INSERT INTO trade_offer SET ?', tradeOffer)
      console.log(`📢 ${botTeam.name} listed weakest bench player ${weakest.name} for ${offerValue} (guaranteed offer)`)
    }
  }
}

/**
 * Sign free players to fill gaps in the team roster.
 * Free players cost nothing - ideal for filling critical and depth needs.
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _signFreePlayers (botTeam, players) {
  const positionsNeeded = getPositionsOfFormation(botTeam.formation)
  const uniquePositions = [...new Set(positionsNeeded)]

  // Find positions where we need more players
  /** @type {{position: string, priority: 'critical'|'depth', deficit: number}[]} */
  const needs = []
  for (const position of uniquePositions) {
    const minPlayersNeeded = positionsNeeded.filter(p => p === position).length
    const targetSquadSize = minPlayersNeeded * 2
    const playersInPosition = players.filter(p => p.position === position)
    const availableInPosition = playersInPosition.filter(p => !p.is_injured)

    if (availableInPosition.length < minPlayersNeeded) {
      needs.push({
        position,
        priority: 'critical',
        deficit: minPlayersNeeded - availableInPosition.length
      })
    } else if (playersInPosition.length < targetSquadSize) {
      needs.push({
        position,
        priority: 'depth',
        deficit: targetSquadSize - playersInPosition.length
      })
    }
  }

  if (needs.length === 0) return

  // Sort: critical first, then by deficit
  needs.sort((a, b) => {
    if (a.priority === 'critical' && b.priority !== 'critical') return -1
    if (a.priority !== 'critical' && b.priority === 'critical') return 1
    return b.deficit - a.deficit
  })

  // Get available free players (exclude retired players still kept for
  // history). `carrier_end_season` is inclusive — a player in their final
  // season can still be signed, same as for human teams.
  const { season } = await getGameDayAndSeason()
  /** @type {PlayerType[]} */
  const freePlayers = await query('SELECT * FROM player WHERE team_id IS NULL AND carrier_end_season >= ?', [season])
  if (freePlayers.length === 0) return

  let signed = 0
  const maxSignings = 5 // Don't sign too many at once

  for (const need of needs) {
    if (signed >= maxSignings) break

    // Find free players matching this position, sorted by level desc
    const candidates = freePlayers
      .filter(p => p.position === need.position)
      .sort((a, b) => b.level - a.level)

    const toSign = Math.min(need.deficit, maxSignings - signed, candidates.length)
    for (let i = 0; i < toSign; i++) {
      const player = candidates[i]
      const result = await query('UPDATE player SET team_id=? WHERE id=? AND team_id IS NULL', [botTeam.id, player.id])
      // Remove from freePlayers regardless — either we got him, or another parallel bot did.
      const idx = freePlayers.indexOf(player)
      if (idx !== -1) freePlayers.splice(idx, 1)
      // Lost the race to another bot running in parallel — skip history & local state.
      if (!result?.affectedRows) continue
      await addPlayerHistory(player.id, 'HIRED', botTeam.name)
      player.team_id = botTeam.id
      players.push(player)
      signed++
      console.log(`📝 ${botTeam.name} signed free player ${player.name} (${player.position} L${player.level}) [${need.priority}]`)
    }
  }

  // If still have critical needs unfilled, sign any free player regardless of position
  const remainingCritical = needs.filter(n => n.priority === 'critical')
  for (const need of remainingCritical) {
    if (signed >= maxSignings) break
    const availableInPosition = players.filter(p => p.position === need.position && !p.is_injured)
    const minNeeded = positionsNeeded.filter(p => p === need.position).length
    const stillNeeded = minNeeded - availableInPosition.length
    if (stillNeeded <= 0) continue

    // Sign any remaining free player (position mismatch is better than no player)
    const anyCandidates = freePlayers
      .filter(p => p.position !== 'GK') // Don't sign random GKs for outfield
      .sort((a, b) => b.level - a.level)

    const toSign = Math.min(stillNeeded, maxSignings - signed, anyCandidates.length)
    for (let i = 0; i < toSign; i++) {
      const player = anyCandidates[i]
      const result = await query('UPDATE player SET team_id=? WHERE id=? AND team_id IS NULL', [botTeam.id, player.id])
      const idx = freePlayers.indexOf(player)
      if (idx !== -1) freePlayers.splice(idx, 1)
      if (!result?.affectedRows) continue
      await addPlayerHistory(player.id, 'HIRED', botTeam.name)
      player.team_id = botTeam.id
      players.push(player)
      signed++
      console.log(`📝 ${botTeam.name} signed free player ${player.name} (${player.position} L${player.level}) [critical-fallback for ${need.position}]`)
    }
  }
}

/**
 * Calculate value-for-money score (higher is better)
 * @param {number} level
 * @param {number} price
 * @returns {number}
 */
function _calculateValueScore (level, price) {
  // Base value per level (exponential - higher levels are worth more)
  const levelValue = Math.pow(2, level)
  // Return value per unit of price (higher = better deal)
  return levelValue / (price / 100000)
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _checkBuyOffers (botTeam, players) {
  const { season } = await getGameDayAndSeason()
  // First, delete old buy offers that haven't been answered
  const existingOffers = await getOpenByOffersByTeamId(botTeam.id)
  await deleteTooOldOffers(existingOffers, 24)

  // Get updated list of buy offers after cleanup
  const currentBuyOffers = await getOpenByOffersByTeamId(botTeam.id)

  const maxPrice = Math.floor(botTeam.balance * 0.8)
  if (maxPrice <= 0) return // no money to buy a player...

  const positionsNeeded = getPositionsOfFormation(botTeam.formation)

  // Analyze team needs with priority scoring
  /** @type {{position: string, priority: 'critical'|'freshness'|'depth'|'upgrade', currentLevel: number}[]} */
  const teamNeeds = []
  const playerIdsAlreadyBidding = new Set(currentBuyOffers.map(o => o.player_id))

  const uniquePositions = [...new Set(positionsNeeded)]
  for (const position of uniquePositions) {
    const minPlayersNeeded = positionsNeeded.filter(p => p === position).length
    const targetSquadSize = minPlayersNeeded * 2 // Want 2 players per formation slot
    const playersInPosition = players.filter(p => p.position === position)
    const currentWeakestLevel = playersInPosition.length > 0
      ? Math.min(...playersInPosition.map(p => p.level))
      : 0

    // Critical: Missing players for formation (can't even field a full lineup)
    if (playersInPosition.length < minPlayersNeeded) {
      teamNeeds.push({
        position,
        priority: 'critical',
        currentLevel: 0
      })
      continue
    }

    // Freshness: Lineup player is tired and no fresh backup available
    const lineupPlayers = playersInPosition.filter(p => p.in_game_position)
    const benchPlayers = playersInPosition.filter(p => !p.in_game_position)
    const tiredLineupPlayer = lineupPlayers.find(p => p.freshness < 0.5)
    const hasFreshBackup = benchPlayers.some(p => p.freshness >= 0.7)
    if (tiredLineupPlayer && !hasFreshBackup) {
      teamNeeds.push({
        position,
        priority: 'freshness',
        currentLevel: currentWeakestLevel
      })
      continue
    }

    // Depth: Don't have 2 players per formation slot
    if (playersInPosition.length < targetSquadSize) {
      teamNeeds.push({
        position,
        priority: 'depth',
        currentLevel: currentWeakestLevel
      })
      continue
    }

    // Upgrade: Have enough players but weakest is below level 70
    if (currentWeakestLevel < 70) {
      teamNeeds.push({
        position,
        priority: 'upgrade',
        currentLevel: currentWeakestLevel
      })
    }
  }

  // Opportunistic: look for any market deal better than our weakest player overall
  const allPlayerLevels = players.map(p => p.level)
  const weakestOverallLevel = allPlayerLevels.length > 0 ? Math.min(...allPlayerLevels) : 0
  if (teamNeeds.length === 0 && weakestOverallLevel > 0) {
    // Find the position of the weakest player to target upgrades there
    const weakestPlayer = players.reduce((a, b) => a.level < b.level ? a : b)
    teamNeeds.push({
      position: weakestPlayer.position,
      priority: 'opportunistic',
      currentLevel: weakestOverallLevel
    })
  }

  if (teamNeeds.length === 0) return

  // Sort needs by priority: critical > freshness > depth > upgrade > opportunistic
  const priorityOrder = {
    critical: 0,
    freshness: 1,
    depth: 2,
    upgrade: 3,
    opportunistic: 4
  }
  teamNeeds.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  // Find sell offers for positions we need. `carrier_end_season > season` keeps
  // players in their final season out: users listed veterans in the very season
  // they retire and let bots pay full market value for a squad member who
  // disappears at the season transition.
  const positionsArray = teamNeeds.map(n => n.position)
  /** @type {(TradeOfferType & {player_name: string, player_level: number, player_position: string})[]} */
  const sellOffers = await query(`
      SELECT t.*, p.name as player_name, p.level as player_level, p.position as player_position
      FROM trade_offer t
               JOIN player p ON t.player_id = p.id
      WHERE t.from_team_id <> ?
        AND t.offer_value <= ?
        AND t.type = 'sell'
        AND t.status = 'open'
        AND p.carrier_end_season > ?
        AND p.position IN ("${positionsArray.join('", "')}")
      ORDER BY p.level DESC
  `, [botTeam.id, maxPrice, season])

  // Shared bidding budget/state used by both the listed-market pass below and
  // the unsolicited pass at the end. Declared up front so the unsolicited pass
  // still runs even when nobody has listed a player for sale (#451).
  const maxNewOffers = Math.max(1, 5 - currentBuyOffers.length)
  const positionsFilled = new Set()
  let offersMade = 0
  let remainingBudget = maxPrice

  // Filter out players we're already bidding on
  const availableOffers = sellOffers.filter(o => !playerIdsAlreadyBidding.has(o.player_id))

  // Rank all listed offers by score and make multiple buy offers
  /** @type {{offer: typeof availableOffers[0], score: number, need: typeof teamNeeds[0]}[]} */
  const scoredOffers = []
  for (const offer of availableOffers) {
    const need = teamNeeds.find(n => n.position === offer.player_position)
    if (!need) continue
    if (need.priority !== 'critical' && need.priority !== 'depth' && need.priority !== 'freshness' && offer.player_level <= need.currentLevel) {
      continue
    }
    let score = 0
    if (need.priority === 'critical') {
      score += 1000
    } else if (need.priority === 'freshness') {
      score += 800
    } else if (need.priority === 'depth') {
      score += 600
    } else if (need.priority === 'upgrade') {
      score += 400
    } else if (need.priority === 'opportunistic') score += 200
    const levelImprovement = offer.player_level - need.currentLevel
    score += levelImprovement * 100
    score += _calculateValueScore(offer.player_level, offer.offer_value) * 10
    score += offer.player_level * 50
    scoredOffers.push({
      offer,
      score,
      need
    })
  }

  scoredOffers.sort((a, b) => b.score - a.score)

  // Make up to maxNewOffers buy offers on listed players, one per position need
  for (const {
    offer: bestOffer,
    need
  } of scoredOffers) {
    if (offersMade >= maxNewOffers) break
    if (remainingBudget <= 0) break
    // Only one buy offer per position to avoid overspending
    if (positionsFilled.has(bestOffer.player_position)) continue

    let offerValue
    const isEagerBuyer = Math.random() < 0.1
    if (isEagerBuyer) {
      const overpayFactor = 1.05 + Math.random() * 0.15
      offerValue = Math.floor(bestOffer.offer_value * overpayFactor)
    } else {
      const normalFactor = 0.95 + Math.random() * 0.1
      offerValue = Math.floor(bestOffer.offer_value * normalFactor)
    }

    // Cap at fair market value so users can't extract money by listing players at inflated prices.
    // Critical/freshness needs allow a 1.5x premium; depth/upgrade/opportunistic stay at fair value.
    const player = await getPlayerById(bestOffer.player_id)
    if (!player) continue
    const fairValue = await getAveragePlanPriceOfPlayer(player)
    const fairValueCap = Math.floor(
      fairValue * (need.priority === 'critical' || need.priority === 'freshness' ? 1.5 : 1.0)
    )
    offerValue = Math.min(offerValue, fairValueCap)

    offerValue = Math.min(remainingBudget, offerValue)
    if (offerValue < bestOffer.offer_value * 0.9) continue // Don't lowball too much

    const tradeOffer = new TradeOffer({
      offer_value: offerValue,
      type: 'buy',
      player_id: bestOffer.player_id,
      from_team_id: botTeam.id
    })
    await query('INSERT INTO trade_offer SET ?', tradeOffer)
    remainingBudget -= offerValue
    positionsFilled.add(bestOffer.player_position)
    playerIdsAlreadyBidding.add(bestOffer.player_id)
    offersMade++
    console.log(`💰 ${botTeam.name} made ${isEagerBuyer ? 'eager ' : ''}buy offer of ${offerValue} for ${bestOffer.player_name} (${need?.priority} need)`)
  }

  // Unsolicited offers (#451): the listed-market logic above only ever bids on
  // players someone put up for sale. A manager who never lists a player would
  // therefore never receive any offer. To keep the transfer scene alive — and
  // to actively court human-managed squads — a bot occasionally makes an offer
  // slightly above market value for a strong, unlisted player at a position of
  // need. The probability gate keeps the whole bot population from flooding
  // users every match day.
  if (offersMade < maxNewOffers && remainingBudget > 0 && Math.random() < UNSOLICITED_OFFER_CHANCE) {
    await _makeUnsolicitedBuyOffer(botTeam, teamNeeds, remainingBudget, playerIdsAlreadyBidding, positionsFilled, season)
  }
}

// Probability that a bot with spare budget makes an unsolicited buy offer on a
// given match day. Kept low so the (large) bot population does not flood
// managers with offers, while still guaranteeing a steady trickle (#451).
const UNSOLICITED_OFFER_CHANCE = 0.15

/**
 * Make a single unsolicited buy offer for a strong, unlisted player at a
 * position of need. Human-managed squads are courted first so managers reliably
 * receive offers even when they never list a player for sale (#451).
 *
 * @param {TeamType} botTeam
 * @param {{position: string, priority: string, currentLevel: number}[]} teamNeeds
 * @param {number} maxSpend - remaining budget the bot may spend
 * @param {Set<number>} playerIdsAlreadyBidding
 * @param {Set<string>} positionsFilled
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _makeUnsolicitedBuyOffer (botTeam, teamNeeds, maxSpend, playerIdsAlreadyBidding, positionsFilled, season) {
  const positions = teamNeeds.map(n => n.position).filter(p => !positionsFilled.has(p))
  if (positions.length === 0) return

  // Candidate players on other (non-system) teams, at a needed position, that
  // this bot is not already bidding on. Human-managed teams rank first, then by
  // level so the bot chases the best realistic upgrade. Players in their final
  // season are skipped — a bot never pays for a career that ends in weeks.
  const candidates = await query(`
      SELECT p.*, t.user_id AS owner_user_id
      FROM player p
               JOIN team t ON p.team_id = t.id
      WHERE p.team_id <> ?
        AND t.is_system_team = 0
        AND p.carrier_end_season > ?
        AND p.position IN ("${positions.join('", "')}")
        AND NOT EXISTS (
          SELECT 1 FROM trade_offer o
          WHERE o.player_id = p.id AND o.from_team_id = ? AND o.type = 'buy' AND o.status = 'open'
        )
      ORDER BY (t.user_id IS NOT NULL) DESC, p.level DESC
      LIMIT 25
  `, [botTeam.id, season, botTeam.id])

  for (const candidate of candidates) {
    if (playerIdsAlreadyBidding.has(candidate.id)) continue
    const need = teamNeeds.find(n => n.position === candidate.position)
    if (!need) continue
    // Only chase genuine upgrades (except when a slot is unfillable).
    if (need.priority !== 'critical' && candidate.level <= need.currentLevel) continue

    const marketValue = await getAveragePlanPriceOfPlayer(candidate)
    // Offer slightly above market value so the deal is attractive to the seller.
    const premiumFactor = 1.05 + Math.random() * 0.1
    const offerValue = Math.floor(marketValue * premiumFactor)
    if (offerValue > maxSpend) continue // can't afford this one, try the next

    const tradeOffer = new TradeOffer({
      offer_value: offerValue,
      type: 'buy',
      player_id: candidate.id,
      from_team_id: botTeam.id
    })
    await query('INSERT INTO trade_offer SET ?', tradeOffer)
    playerIdsAlreadyBidding.add(candidate.id)
    positionsFilled.add(candidate.position)
    console.log(`✉️ ${botTeam.name} made unsolicited buy offer of ${offerValue} for ${candidate.name} (${candidate.owner_user_id ? 'user' : 'bot'} team)`)
    return // one unsolicited offer per match day
  }
}

/**
 * @param {TradeOfferType[]} offers
 * @param {number} [hours=24]
 * @returns {Promise<boolean>}
 */
async function deleteTooOldOffers (offers, hours = 24) {
  let removedAnOffer = false
  for (const offer of offers) {
    const diff = (Date.now() - Date.parse(offer.created_at)) / 1000 / 60 / 60
    if (diff > hours) { // older than 24 hours
      await query('DELETE FROM trade_offer WHERE id=?', [offer.id])
      console.log('Deleted old offer for player with id and price: ', offer.player_id, offer.offer_value)
      removedAnOffer = true
    }
  }
  return removedAnOffer
}

/**
 * @param {TeamType} botTeam
 * @returns {Promise<void>}
 */
async function _firePlayerIfTooMany (botTeam) {
  const players = await getPlayersByTeamId(botTeam.id)
  if (players.length > 25) {
    const playerToFire = randomItem(players.filter(p => !p.in_game_position))
    await query('UPDATE player SET team_id=NULL WHERE id=?', [playerToFire.id])
    await query('DELETE FROM trade_offer WHERE player_id=?', [playerToFire.id])
    await addPlayerHistory(playerToFire.id, 'FIRED', botTeam.name)
    console.log('Bot fired player, as has too many...')
  }
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} _players - Not used directly, we fetch fresh data
 * @returns {Promise<void>}
 */
async function _checkTrades (botTeam, _players) {
  // 1. First, clean up old unanswered offers from this bot
  const ownSellOffers = await getOpenSellOffersByTeamId(botTeam.id)
  const ownBuyOffers = await getOpenByOffersByTeamId(botTeam.id)
  await deleteTooOldOffers([...ownSellOffers, ...ownBuyOffers], 48)

  // 2. Fire players if team has too many
  await _firePlayerIfTooMany(botTeam)

  // Refresh player list after potential firing
  const currentPlayers = await getPlayersByTeamId(botTeam.id)

  // 3. Check incoming buy offers and accept/decline them
  await _checkIncomingOffers(botTeam, currentPlayers)

  // 4. Sign free players to fill critical gaps (free, immediate)
  await _signFreePlayers(botTeam, currentPlayers)

  // Refresh player list after signing free players
  const playersAfterSigning = await getPlayersByTeamId(botTeam.id)

  // 5. Create sell offers for unneeded players
  await _checkSellOffers(botTeam, playersAfterSigning)

  // 6. Look for players to buy that would improve the team
  await _checkBuyOffers(botTeam, playersAfterSigning)
}

/**
 * @param {TeamType} botTeam
 * @param {boolean} isStrongTeam
 * @returns {Promise<void>}
 */
async function _chooseSponsor (botTeam, _isStrongTeam) {
  let { sponsor } = await getSponsor(botTeam)
  if (sponsor) return
  const sponsors = await getSponsorOffers(botTeam)
  sponsor = new Sponsor(randomItem(sponsors))
  await query('INSERT INTO sponsor SET ?', sponsor)
  console.log('Team signed sponsor: ', sponsor)
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @returns {Promise<void>}
 */
async function _checkActionCards (botTeam, players, _isStrongTeam, actionCards) {

  // First, try to merge level up cards
  const level4Cards = actionCards.filter(c => c.action === 'LEVEL_UP_PLAYER_40')
  const level7Cards = actionCards.filter(c => c.action === 'LEVEL_UP_PLAYER_70')

  // Merge pairs of LEVEL_UP_PLAYER_40 cards
  for (let i = 0; i + 1 < level4Cards.length; i += 2) {
    try {
      await mergeActionCards(level4Cards[i], level4Cards[i + 1], botTeam)
      console.log(`${botTeam.name} merged two Level 40 cards into Level 70`)
    } catch (e) {
      console.warn('Merging Level 40 cards failed: ', e.message)
    }
  }

  // Merge pairs of LEVEL_UP_PLAYER_70 cards
  for (let i = 0; i + 1 < level7Cards.length; i += 2) {
    try {
      await mergeActionCards(level7Cards[i], level7Cards[i + 1], botTeam)
      console.log(`${botTeam.name} merged two Level 70 cards into Level 100`)
    } catch (e) {
      console.warn('Merging Level 70 cards failed: ', e.message)
    }
  }

  // Re-fetch cards after merging
  const remainingCards = await getActionCards(botTeam)

  for (const actionCard of remainingCards) {
    try {
      // NEW_YOUTH_PLAYER_X - bot picks the first of the 3 generated options
      if (actionCard.action in YOUTH_PLAYER_CARD_RANGES) {
        const options = await generateYouthPlayerOptions(actionCard.action)
        await playActionCard({ actionCard, player: options[0] }, botTeam)
        console.log(`${botTeam.name} used ${actionCard.action} card`)
        continue
      }

      // BONUS_100K / MILLION_BONUS - free money
      if (actionCard.action === 'BONUS_100K' || actionCard.action === 'MILLION_BONUS') {
        await playActionCard({ actionCard }, botTeam)
        console.log(`${botTeam.name} used ${actionCard.action} card`)
        continue
      }

      // FRESHNESS_10 - apply to player with lowest freshness
      if (actionCard.action === 'FRESHNESS_10') {
        const tiredPlayers = players.filter(p => p.freshness < 1.0).sort((a, b) => a.freshness - b.freshness)
        const player = tiredPlayers[0]
        if (player) {
          await playActionCard({
            actionCard,
            player
          }, botTeam)
          console.log(`${botTeam.name} used FRESHNESS card on ${player.name}`)
        }
        continue
      }

      // LEVEL_UP_PLAYER_* - apply to eligible player
      if (actionCard.action.startsWith('LEVEL_UP_PLAYER')) {
        let maxLevel = 100
        if (actionCard.action.endsWith('_40')) maxLevel = 40
        if (actionCard.action.endsWith('_70')) maxLevel = 70

        const eligiblePlayers = players.filter(p => p.level < maxLevel)
        const player = randomItem(eligiblePlayers)
        if (player) {
          await playActionCard({
            actionCard,
            player
          }, botTeam)
          console.log(`${botTeam.name} used ${actionCard.action} on ${player.name}`)
        }
        continue
      }
    } catch (e) {
      console.warn('Playing action card failed: ', e.message)
    }
  }
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @returns {Promise<void>}
 */
async function _checkTactic (botTeam, players, _isStrongTeam) {
  // remove all players from formation
  players.forEach(p => (p.in_game_position = null))

  // find best available player for each formation position
  const positions = getPositionsOfFormation(botTeam.formation)
  for (const position of positions) {
    let selectedPlayer
    for (const player of players) {
      // Skip if already in lineup, wrong position, suspended, or injured
      if (player.in_game_position || player.position !== position || player.is_suspended || player.is_injured || player.tour_days_left) {
        continue
      }

      if (!selectedPlayer) {
        selectedPlayer = player
        continue
      }

      // Compare players: prioritize freshness, then level as tiebreaker
      // A player with significantly higher freshness (>0.2 difference) is preferred
      const freshnessDiff = player.freshness - selectedPlayer.freshness
      if (freshnessDiff > 0.2) {
        // New player is significantly fresher
        selectedPlayer = player
      } else if (freshnessDiff >= -0.2) {
        // Similar freshness - prefer higher level
        if (player.level > selectedPlayer.level) {
          selectedPlayer = player
        } else if (player.level === selectedPlayer.level && player.freshness > selectedPlayer.freshness) {
          // Same level - prefer fresher player
          selectedPlayer = player
        }
      }
      // If new player is significantly less fresh (>0.2 diff), keep current selection
    }

    if (!selectedPlayer) {
      // Try to find any available player (even if suspended, as last resort for incomplete lineup)
      const anyPlayer = players.find(p => !p.in_game_position && p.position === position && !p.is_injured)
      if (anyPlayer) {
        selectedPlayer = anyPlayer
        console.warn(`${botTeam.name}: Using suspended player ${anyPlayer.name} for ${position} (no alternatives)`)
      } else {
        console.error(`${botTeam.name} has no player for position ${position}!`)
        continue
      }
    }
    selectedPlayer.in_game_position = position
  }

  // Assign bench positions: best available player per position group
  const benchGroups = {
    BENCH_GK: 'GK',
    BENCH_DEF: p => ['LD', 'CD', 'RD'].includes(p.position),
    BENCH_MID: p => ['DM', 'LM', 'CM', 'RM', 'OM'].includes(p.position),
    BENCH_ATT: p => ['LA', 'CA', 'RA'].includes(p.position)
  }
  const benchAssigned = new Set()
  for (const [benchPos, matcher] of Object.entries(benchGroups)) {
    const candidates = players.filter(p => {
      if (p.in_game_position || p.is_suspended || p.is_injured || benchAssigned.has(p.id)) return false
      return typeof matcher === 'function' ? matcher(p) : p.position === matcher
    })
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.level - a.level)
      candidates[0].bench_position = benchPos
      benchAssigned.add(candidates[0].id)
    }
  }

  // Clear bench for all players not assigned
  for (const player of players) {
    if (!benchAssigned.has(player.id)) {
      player.bench_position = null
    }
  }

  // Update database
  const promises = []
  for (const player of players) {
    promises.push(query('UPDATE player SET in_game_position=?, bench_position=? WHERE id=?', [player.in_game_position, player.bench_position || null, player.id]))
  }
  await Promise.all(promises)
}
