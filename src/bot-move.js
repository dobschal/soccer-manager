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

export async function makeBotMoves () {
  /** @type {TeamType[]} */
  const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL')
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

async function _makeBotMove (botTeam, players) {
  const isStrongTeam = botTeam.id % 2 === 0
  const playersOfTeam = players.filter(p => p.team_id === botTeam.id)
  await _checkTactic(botTeam, playersOfTeam, isStrongTeam)
  await _checkActionCards(botTeam, playersOfTeam, isStrongTeam)
  await _chooseSponsor(botTeam, isStrongTeam)
  await _checkStadium(botTeam)
  await _checkTrades(botTeam, playersOfTeam, isStrongTeam)
}

/**
 *
 * @param {TeamType} botTeam
 * @private
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
 * @returns {Promise<void>}
 * @private
 */
async function _checkIncomingOffers (botTeam) {
  const { gameDay, season } = await getGameDayAndSeason()
  const openSellOffers = await getOpenSellOffersByTeamId(botTeam.id)
  const incomingOffers = await getIncomingBuyOffers(botTeam.id)
  /** @type {{[playerId: number]: Array<TradeOfferType>}} */
  const incomingOffersPerPlayer = {}
  incomingOffers.forEach(offer => {
    incomingOffersPerPlayer[offer.player_id] = incomingOffersPerPlayer[offer.player_id] ?? []
    incomingOffersPerPlayer[offer.player_id].push(offer)
  })
  for (let playerId in incomingOffersPerPlayer) {
    playerId = Number(playerId)
    const offer = incomingOffersPerPlayer[playerId][0] // take first as it is highest offer
    const matchingSellOffer = openSellOffers.find(sellOffer => sellOffer.player_id === playerId)
    if (matchingSellOffer && matchingSellOffer.offer_value * 0.5 < offer.offer_value && Math.random() < 0.2) {
      await acceptOffer(offer, botTeam, gameDay, season)
    } else if (matchingSellOffer && matchingSellOffer.offer_value < offer.offer_value) {
      await acceptOffer(offer, botTeam, gameDay, season)
    } else {
      const player = await getPlayerById(playerId)
      const averagePrice = await getAveragePlanPriceOfPlayer(player)
      if (offer.offer_value > averagePrice && !player.in_game_position && Math.random() < 0.8) {
        await acceptOffer(offer, botTeam, gameDay, season)
      } else {
        await declineOffer(offer)
      }
    }
  }
}

async function _checkSellOffers (botTeam) {
  const offers = await getOpenSellOffersByTeamId(botTeam.id)
  if (offers.length === 0) {
    const players = await getPlayersByTeamId(botTeam.id)
    // Figure out, which player we want to sell
    // each position in the lineup should added twice
    // if players position is not in lineup --> sell
    // if too many players in lineup for same position --> sell random of position
    const positionsNeeded = getPositionsOfFormation(botTeam.formation)
    let playerToSell
    for (const player of players) {
      if (!positionsNeeded.includes(player.position)) {
        playerToSell = player
        break
      }
      const amountOfPlayersNeeded = positionsNeeded.filter(position => player.position === position).length * 2
      if (players.filter(p => p.position === player.position).length > amountOfPlayersNeeded) {
        playerToSell = player
        break
      }
    }
    // In case there is no potential player to sell, still add a sell offer at random
    // to create movement on market.
    if (!playerToSell && Math.random() > 0.5) {
      playerToSell = randomItem(players)
    }
    if (playerToSell) {
      const price = await playersRoutes.estimateValue_V2(playerToSell.id)
      const val = (Math.random() * 0.6 + 0.7) * price
      const tradeOffer = new TradeOffer({
        offer_value: val,
        type: 'sell',
        player_id: playerToSell.id,
        from_team_id: botTeam.id
      })
      await query('INSERT INTO trade_offer SET ?', tradeOffer)
    }
  } else {
    // There is at least one sell offer from the bot team
    // for each offer check if the offer exists longer than 24 hours
    // if so, remove offer, _checkSellOffers again to create a new one
    if (await deleteTooOldOffers(offers)) {
      await _checkSellOffers(botTeam)
    }
  }
}

async function _checkBuyOffers (botTeam) {
  const offers = await getOpenByOffersByTeamId(botTeam.id)
  if (offers.length === 0) {
    const maxPrice = Math.floor(botTeam.balance * 0.8)
    if (maxPrice <= 0) return // no money to buy a player...
    // figure out for which positions, players are needed
    const players = await getPlayersByTeamId(botTeam.id)
    const positionsNeeded = getPositionsOfFormation(botTeam.formation)
    const positionsToBuy = []
    for (const position of positionsNeeded) {
      const amountNeeded = positionsNeeded.filter(p => p === position).length
      const amountOfPlayersOnPosition = players.filter(p => p.position === position).length
      if (amountOfPlayersOnPosition < amountNeeded) {
        positionsToBuy.push(position)
      }
    }
    if (positionsToBuy.length === 0) return // no players needed...
    /** @type {TradeOfferType[]} */
    const sellOffers = await query(`
        SELECT * FROM trade_offer t JOIN player p on t.player_id = p.id
                 WHERE t.from_team_id<>? AND t.offer_value<? AND t.type='sell' AND p.position IN ("${positionsToBuy.join('", "')}")
    `, [botTeam.id, maxPrice])
    if (sellOffers.length === 0) return // no sell offers available
    const offer = randomItem(sellOffers)
    const rand = offer.offer_value * (Math.random() * 0.3)
    const tradeOffer = new TradeOffer({
      offer_value: Math.min(maxPrice, Math.floor(offer.offer_value * 0.9 + rand)),
      type: 'buy',
      player_id: offer.player_id,
      from_team_id: botTeam.id
    })
    await query('INSERT INTO trade_offer SET ?', tradeOffer)
    console.log('Added new buy offer for ', offer)
  } else {
    if (await deleteTooOldOffers(offers)) {
      await _checkBuyOffers(botTeam)
    }
  }
}

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
 * @private
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
 * @private
 */
async function _checkTrades (botTeam) {
  await _firePlayerIfTooMany(botTeam)
  await _checkIncomingOffers(botTeam)
  await _checkSellOffers(botTeam)
  await _checkBuyOffers(botTeam)
}

/**
 *
 * @param {TeamType} botTeam
 * @param {boolean} isStrongTeam
 * @private
 */
async function _chooseSponsor (botTeam, isStrongTeam) {
  let { sponsor } = await getSponsor(botTeam)
  if (sponsor) return
  const sponsors = await getSponsorOffers(botTeam)
  sponsor = new Sponsor(randomItem(sponsors))
  await query('INSERT INTO sponsor SET ?', sponsor)
  console.log('Team signed sponsor: ', sponsor)
}

/**
 *
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @private
 */
async function _checkActionCards (botTeam, players, isStrongTeam) {
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
 * Get the teams formation, set all in_game_positions to null
 * then for each position select best player
 *
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @private
 */
async function _checkTactic (botTeam, players, isStrongTeam) {
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
