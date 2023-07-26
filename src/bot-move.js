import { query } from './lib/database.js'
import { getActionCards, playActionCard } from './helper/actionCardHelper.js'
import { randomItem } from './lib/util.js'
import { getSponsor, getSponsorOffers } from './helper/sponsorHelper.js'
import { Sponsor } from './entities/sponsor.js'
import { TradeOffer } from './entities/tradeOffer.js'
import { acceptOffer } from './helper/tradeHelper.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { buildStadium, calcuateStadiumBuild } from './helper/stadiumHelper.js'

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
  /** @type {StadiumType} */
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [botTeam.id])
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
  if (price < botTeam.balance * 0.8) {
    await buildStadium(botTeam, newStadium, price)
    console.log(`🏗️ ${botTeam.name} is getting a new stadium!`)
    botTeam.balance -= price
  }
}

/**
 *
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @private
 */
async function _checkTrades (botTeam, players, isStrongTeam) {
  if (players.length === 0) return console.log('Team has no player o.O', botTeam.id)
  const openOffers = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'sell\'', [botTeam.id])
  if (openOffers.length === 0) {
    const playerToSell = randomItem(players.filter(p => !p.in_game_position))
    if (playerToSell) {
      const tradeOffer = new TradeOffer({
        offer_value: (Math.random() * 0.2 + 1) * (50000 * playerToSell.level),
        type: 'sell',
        player_id: playerToSell.id,
        from_team_id: botTeam.id
      })
      await query('INSERT INTO trade_offer SET ?', tradeOffer)
    }
  }

  /** @type {TradeOfferType[]} */
  let openBuyOffers = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'buy\'', [botTeam.id])
  if (openBuyOffers.length > 0) {
    const offer = openBuyOffers[0]
    const diff = (Date.now() - Date.parse(offer.created_at)) / 1000 / 60 / 60
    if (diff > 24) { // older than 24 hours
      await query('DELETE FROM trade_offer WHERE id=?', [offer.id])
      console.log('Deleted old buy offer for player with id and price: ', offer.player_id, offer.offer_value)
    }
  }
  openBuyOffers = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'buy\'', [botTeam.id])
  if (openBuyOffers.length === 0) {
    const maxPrice = Math.floor(botTeam.balance * 0.5)
    /** @type {TradeOfferType[]} */
    const offers = await query('SELECT * FROM trade_offer WHERE from_team_id<>? AND offer_value<? AND type=\'sell\'', [botTeam.id, maxPrice])
    if (offers.length > 0) {
      const tradeOffer = new TradeOffer({
        offer_value: maxPrice,
        type: 'buy',
        player_id: offers[0].player_id,
        from_team_id: botTeam.id
      })
      await query('INSERT INTO trade_offer SET ?', tradeOffer)
    }
  }

  const sql = `SELECT * FROM trade_offer WHERE from_team_id <> ? AND type = 'buy' AND player_id IN (${players.filter(p => !p.in_game_position).map(p => p.id).join(', ')})`
  try {
    /** @type {TradeOfferType[]} */
    const openIncomingOffers = await query(sql, [botTeam.id])
    openIncomingOffers.sort((oa, ob) => {
      return ob.offer_value - oa.offer_value
    })
    if (openIncomingOffers.length > 0) {
      const player = players.find(p => p.id === openIncomingOffers[0].player_id)
      if (Math.random() < 0.1 || (Math.random() > 0.75 && openIncomingOffers[0].offer_value >= player.level * 50000)) {
        delete openIncomingOffers[0].created_at
        const {
          gameDay,
          season
        } = await getGameDayAndSeason()
        await acceptOffer(openIncomingOffers[0], botTeam, gameDay, season)
        console.log('Trade happened: ', player)
      }
    }
  } catch (e) {
    console.error(e)
  }
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
          if (actionCard.action.endsWith('_4')) return p.level < 4
          if (actionCard.action.endsWith('_7')) return p.level < 7
          return true
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
 *
 * @param {TeamType} botTeam
 * @param {PlayerType[]} players
 * @param {boolean} isStrongTeam
 * @private
 */
async function _checkTactic (botTeam, players, isStrongTeam) {
  const promises = []
  for (const player of players.filter(p => p.in_game_position)) {
    const p2 = players.find(p2 => p2.id !== player.id &&
      !p2.in_game_position &&
      p2.position === player.position &&
      (p2.level > player.level || !isStrongTeam))
    if (!p2) continue
    p2.in_game_position = p2.position
    player.in_game_position = null
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [p2.in_game_position, p2.id]))
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [player.in_game_position, player.id]))
  }
  await Promise.all(promises)
}
