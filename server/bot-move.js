import { query } from './lib/database.js'
import { getActionCards, playActionCard } from './helper/actionCardHelper.js'
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
  const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL')
  if (botTeams.length === 0) {
    console.log('No bot teams to process')
    return
  }
  const botTeamIds = botTeams.map(t => t.id).join(', ')
  /** @type {PlayerType[]} */
  const players = await query(`SELECT * FROM player WHERE team_id IN (${botTeamIds})`)
  const t1 = Date.now()
  const promises = []
  for (const botTeam of botTeams) {
    promises.push(_makeBotMove(botTeam, players))
  }
  await Promise.all(promises)
  console.log(`Made bot moves in ${Math.floor((Date.now() - t1) / 1000)}sec`)
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _makeBotMove (botTeam, players) {
  const isStrongTeam = botTeam.id % 2 === 0
  const playersOfTeam = players.filter(p => p.team_id === botTeam.id)
  await _checkTactic(botTeam, playersOfTeam, isStrongTeam)
  await _checkActionCards(botTeam, playersOfTeam, isStrongTeam)
  await _chooseSponsor(botTeam, isStrongTeam)
  await _checkStadium(botTeam)
  await _checkTrades(botTeam, playersOfTeam)
}

/**
 * @param {TeamType} botTeam
 * @returns {Promise<void>}
 */
async function _checkStadium (botTeam) {
  if (Math.random() > 0.1) return
  /** @type {StadiumType} */
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [botTeam.id])
  /** @type {GameType[]} */
  const [game] = await query('SELECT * FROM game where team_1_id=? AND played=1 ORDER BY season DESC, game_day DESC', [botTeam.id])
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
    await buildStadium(botTeam, newStadium, price)
    console.log(`🏗️ ${botTeam.name} is getting a new stadium!`)
    botTeam.balance -= price
  }
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _checkIncomingOffers (botTeam, players) {
  const { gameDay, season } = await getGameDayAndSeason()
  const openSellOffers = await getOpenSellOffersByTeamId(botTeam.id)
  const incomingOffers = await getIncomingBuyOffers(botTeam.id)

  // Group incoming offers by player, sorted by highest offer first
  /** @type {{[playerId: number]: Array<TradeOfferType>}} */
  const incomingOffersPerPlayer = {}
  incomingOffers.forEach(offer => {
    incomingOffersPerPlayer[offer.player_id] = incomingOffersPerPlayer[offer.player_id] ?? []
    incomingOffersPerPlayer[offer.player_id].push(offer)
  })

  // Calculate minimum players needed per position for the formation
  const positionsNeeded = getPositionsOfFormation(botTeam.formation)

  for (let playerId in incomingOffersPerPlayer) {
    playerId = Number(playerId)
    const offer = incomingOffersPerPlayer[playerId][0] // take first as it is highest offer
    const player = await getPlayerById(playerId)
    if (!player) {
      await declineOffer(offer)
      continue
    }

    // Check if we can afford to sell this player (need at least 1 player per position in formation)
    const playersInSamePosition = players.filter(p => p.position === player.position && p.id !== playerId)
    const positionsRequiredForFormation = positionsNeeded.filter(p => p === player.position).length
    if (playersInSamePosition.length < positionsRequiredForFormation) {
      // Can't sell - would leave formation incomplete
      await declineOffer(offer)
      continue
    }

    const matchingSellOffer = openSellOffers.find(sellOffer => sellOffer.player_id === playerId)
    const averagePrice = await getAveragePlanPriceOfPlayer(player)

    // Determine minimum acceptable price with randomization (80% - 120% of average/sell price)
    const basePrice = matchingSellOffer ? matchingSellOffer.offer_value : averagePrice
    const randomFactor = 0.8 + Math.random() * 0.4 // 0.8 to 1.2
    const minAcceptablePrice = basePrice * randomFactor

    if (offer.offer_value >= minAcceptablePrice) {
      await acceptOffer(offer, botTeam, gameDay, season)
      // Update local players array to reflect the sale
      const soldPlayerIndex = players.findIndex(p => p.id === playerId)
      if (soldPlayerIndex !== -1) players.splice(soldPlayerIndex, 1)
      console.log(`🤝 ${botTeam.name} sold player ${player.name} for ${offer.offer_value}`)
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
      // Sell the weakest player(s) in this position
      const sortedByLevel = [...playersInPosition].sort((a, b) => a.level - b.level)
      const weakestPlayer = sortedByLevel[0]
      if (weakestPlayer.id === player.id && !playerIdsWithOffers.has(player.id)) {
        playersToSell.push(player)
      }
    }
  }

  // Create sell offers for players to sell (max 3 at a time to not flood market)
  const maxNewOffers = Math.min(3 - currentOffers.length, playersToSell.length)
  for (let i = 0; i < maxNewOffers; i++) {
    const playerToSell = playersToSell[i]
    const price = await playersRoutes.estimateValue(playerToSell.id)
    // Randomize price between 70% and 130% of estimated value
    const randomFactor = 0.7 + Math.random() * 0.6
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
}

/**
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @returns {Promise<void>}
 */
async function _checkBuyOffers (botTeam, players) {
  // First, delete old buy offers that haven't been answered
  const existingOffers = await getOpenByOffersByTeamId(botTeam.id)
  await deleteTooOldOffers(existingOffers, 24)

  // Get updated list of buy offers after cleanup
  const currentBuyOffers = await getOpenByOffersByTeamId(botTeam.id)

  // Don't create too many buy offers at once
  if (currentBuyOffers.length >= 2) return

  const maxPrice = Math.floor(botTeam.balance * 0.8)
  if (maxPrice <= 0) return // no money to buy a player...

  const positionsNeeded = getPositionsOfFormation(botTeam.formation)

  // Find positions where we need players or could upgrade
  const positionsToBuy = new Set()
  const playerIdsAlreadyBidding = new Set(currentBuyOffers.map(o => o.player_id))

  for (const position of positionsNeeded) {
    const minPlayersNeeded = positionsNeeded.filter(p => p === position).length
    const playersInPosition = players.filter(p => p.position === position)

    // Need more players for this position
    if (playersInPosition.length < minPlayersNeeded) {
      positionsToBuy.add(position)
      continue
    }

    // Look for upgrades - if there's a player on market better than our weakest
    const weakestLevel = Math.min(...playersInPosition.map(p => p.level))
    if (weakestLevel < 8) { // Only look for upgrades if we don't have max level
      positionsToBuy.add(position)
    }
  }

  if (positionsToBuy.size === 0) return

  // Find sell offers for positions we want
  const positionsArray = Array.from(positionsToBuy)
  /** @type {(TradeOfferType & PlayerType)[]} */
  const sellOffers = await query(`
      SELECT t.*, p.name as player_name, p.level as player_level, p.position as player_position
      FROM trade_offer t
      JOIN player p ON t.player_id = p.id
      WHERE t.from_team_id <> ?
        AND t.offer_value <= ?
        AND t.type = 'sell'
        AND p.position IN ("${positionsArray.join('", "')}")
      ORDER BY p.level DESC
  `, [botTeam.id, maxPrice])

  if (sellOffers.length === 0) return

  // Filter out players we're already bidding on
  const availableOffers = sellOffers.filter(o => !playerIdsAlreadyBidding.has(o.player_id))
  if (availableOffers.length === 0) return

  // Prefer offers where the player is better than our current players
  let bestOffer = null
  for (const offer of availableOffers) {
    const ourPlayersInPosition = players.filter(p => p.position === offer.player_position)
    const ourWeakestLevel = ourPlayersInPosition.length > 0
      ? Math.min(...ourPlayersInPosition.map(p => p.level))
      : 0

    // This player would be an upgrade or we need more players
    if (offer.player_level > ourWeakestLevel || ourPlayersInPosition.length < positionsNeeded.filter(p => p === offer.player_position).length) {
      bestOffer = offer
      break
    }
  }

  // If no upgrade found, pick a random affordable offer
  if (!bestOffer) {
    bestOffer = randomItem(availableOffers)
  }

  // Create buy offer with slight randomization (90% - 110% of asking price)
  // Higher offers are more likely to be accepted
  const randomFactor = 0.9 + Math.random() * 0.2
  const offerValue = Math.min(maxPrice, Math.floor(bestOffer.offer_value * randomFactor))

  const tradeOffer = new TradeOffer({
    offer_value: offerValue,
    type: 'buy',
    player_id: bestOffer.player_id,
    from_team_id: botTeam.id
  })
  await query('INSERT INTO trade_offer SET ?', tradeOffer)
  console.log(`💰 ${botTeam.name} made buy offer of ${offerValue} for ${bestOffer.player_name}`)
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

  // 4. Create sell offers for unneeded players
  await _checkSellOffers(botTeam, currentPlayers)

  // 5. Look for players to buy that would improve the team
  await _checkBuyOffers(botTeam, currentPlayers)
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
async function _checkActionCards (botTeam, players, _isStrongTeam) {
  const actionCards = await getActionCards(botTeam)
  for (const actionCard of actionCards) {
    try {
      if (actionCard.action === 'NEW_YOUTH_PLAYER') {
        await playActionCard({ actionCard }, botTeam)
        console.log(`${botTeam.name} got a new player`)
        continue
      }
      if (actionCard.action.startsWith('LEVEL_UP_PLAYER')) {
        const player = randomItem(players.filter(p => {
          if (actionCard.action.endsWith('_4')) {
            return p.level < 4
          }
          if (actionCard.action.endsWith('_7')) {
            return p.level < 7
          }
          return p.level < 10
        }))
        if (!player) continue
        await playActionCard({
          actionCard,
          player
        }, botTeam)
        console.log(`${botTeam.name} got a level up`)
      }
    } catch (e) {
      console.warn('Playing action card failed: ', e)
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

  // find best freshest player for formation
  const positions = getPositionsOfFormation(botTeam.formation)
  for (const position of positions) {
    let selectedPlayer
    for (const player of players) {
      if (player.in_game_position || player.position !== position) {
        continue
      }
      if (!selectedPlayer || selectedPlayer.freshness < player.freshness || selectedPlayer.level < player.level) {
        selectedPlayer = player
      }
    }
    if (!selectedPlayer) {
      console.error('Team has no player for position! ', botTeam, position)
      continue
    }
    selectedPlayer.in_game_position = position
  }

  // Update database
  const promises = []
  for (const player of players) {
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [player.in_game_position, player.id]))
  }
  await Promise.all(promises)
}
