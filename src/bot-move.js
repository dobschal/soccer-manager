import { query } from './lib/database.js'
import { getActionCards, playActionCard } from './helper/actionCardHelper.js'
import { randomItem } from './lib/util.js'
import { getSponsor, getSponsorOffers } from './helper/sponsorHelper.js'
import { Sponsor } from './entities/sponsor.js'

// 1. Check Tactic (/)
// 2. Play Action Cards --> !!! not possible because action cards are hanging on user...
// 3. Choose Sponsor
// 4. Expand Stadium
// 5. Trade Players

export async function makeBotMoves () {
  /** @type {TeamType[]} */
  const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL')
  const botTeamIds = botTeams.map(t => t.id).join(', ')
  /** @type {PlayerType[]} */
  const players = await query(`SELECT * FROM player WHERE id IN (${botTeamIds})`)
  for (const botTeam of botTeams) {
    const isStrongTeam = botTeam.id % 2 === 0
    const playersOfTeam = players.filter(p => p.team_id === botTeam.id)
    await _checkTactic(botTeam, playersOfTeam, isStrongTeam)
    await _checkActionCards(botTeam, playersOfTeam, isStrongTeam)
    await _chooseSponsor(botTeam, isStrongTeam)
    await _checkTrades(botTeam, playersOfTeam, isStrongTeam)
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
  const openOffers = await query('SELECT * FROM trade_offer WHERE from_team_id=? AND type=\'sell\'', [botTeam.it])
  if (openOffers.length > 0) return console.log('Skip, has open offer still')
  const playerToSell = randomItem(players.filter(p => !p.in_game_position))
  //
  // TODO: sell player
  //
  //
  // TODO: look to buy players
  //
}

/**
 *
 * @param {TeamType} botTeam
 * @param {boolean} isStrongTeam
 * @private
 */
async function _chooseSponsor (botTeam, isStrongTeam) {
  let { sponsor } = await getSponsor(botTeam)
  if (sponsor) return console.log('Team has already sponsor')
  const sponsors = await getSponsorOffers(botTeam)
  sponsor = new Sponsor(randomItem(sponsors))
  await query('INSERT INTO sponsor SET ?', sponsor)
  console.log('Team signed sponsor')
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
    console.log(`${botTeam.name} is exchanging player ${player.name} (${player.level}) with ${p2.name} (${p2.level}), strong bot?: ${isStrongTeam}`)
    p2.in_game_position = p2.position
    player.in_game_position = null
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [p2.in_game_position, p2.id]))
    promises.push(query('UPDATE player SET in_game_position=? WHERE id=?', [player.in_game_position, player.id]))
  }
  await Promise.all(promises)
}
