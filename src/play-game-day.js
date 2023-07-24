import { query } from './lib/database.js'
import { determineOponentPosition } from '../client/lib/formation.js'
import { randomItem } from './lib/util.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelpr.js'
import { sallaryPerLevel } from '../client/util/player.js'

const actionCardChances = {
  LEVEL_UP_PLAYER_9: 0.1,
  LEVEL_UP_PLAYER_7: 0.2,
  LEVEL_UP_PLAYER_4: 0.4,
  CHANGE_PLAYER_POSITION: 0.033,
  NEW_YOUTH_PLAYER: 0.033
}

export async function calculateGames () {
  const [{ game_day: gameDay, season }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
  console.log(`Calculate games for season ${season} game day ${gameDay}`)
  const games = await query('SELECT * FROM game WHERE season=? AND game_day=? AND played=0', [season, gameDay])
  await Promise.all(games.map(game => _playGame(game)))
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  console.log('\n\nPlayed game day ' + gameDay)
}

async function _giveSponsorMoney (gameDay, season) {
  /** @type {Array<import('./entities/team.js').TeamType>} */
  const teams = await query('SELECT * FROM team')

  await Promise.all(teams.map(async team => {
    const { sponsor } = await getSponsor(team)
    if (!sponsor) return
    await updateTeamBalance(team, sponsor.value, `Sponsor deal with ${sponsor.name}`, gameDay, season)
  }))
  console.log('Gave all teams their sponsor money')
}

async function _letTeamsPaySallaries (gameDay, season) {
  const teams = await query('SELECT * FROM team')
  await Promise.all(teams.map(async team => {
    const players = await query('SELECT * FROM player WHERE team_ID=?', [team.id])
    const totalSallaryCosts = players.reduce((total, player) => total + sallaryPerLevel[player.level], 0) * -1
    await updateTeamBalance(team, totalSallaryCosts, 'Player salaries', gameDay, season)
  }))
  console.log('Paid all salaries')
}

async function _giveUsersActionCards () {
  const t1 = Date.now()
  /** @type {TeamType[]} */
  const teams = await query('SELECT * FROM team')
  const promises = []
  for (const team of teams) {
    const actionCards = []
    if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_9) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'LEVEL_UP_PLAYER_9',
        played: 0
      }))
    }
    if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_7) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'LEVEL_UP_PLAYER_7',
        played: 0
      }))
    }
    if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_4) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'LEVEL_UP_PLAYER_4',
        played: 0
      }))
    }
    if (Math.random() < actionCardChances.CHANGE_PLAYER_POSITION) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'CHANGE_PLAYER_POSITION',
        played: 0
      }))
    }
    if (Math.random() < actionCardChances.NEW_YOUTH_PLAYER) {
      actionCards.push(new ActionCard({
        team_id: team.id,
        action: 'NEW_YOUTH_PLAYER',
        played: 0
      }))
    }
    for (const actionCard of actionCards) {
      promises.push(query('INSERT INTO action_card SET ?', actionCard))
    }
  }
  await Promise.all(promises)
  console.log(`Gave action cards in ${Date.now() - t1}ms.`)
}

/**
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 * @param {number} strengthTeamA
 * @param {number} strengthTeamB
 * @private
 */
async function _giveStadiumTicketEarnings (teamA, teamB, strengthTeamA, strengthTeamB, gameDay, season) {
  const strengthFactor = strengthTeamA * strengthTeamB
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [teamA.id])
  const stands = ['north', 'south', 'west', 'east']
  const details = {}
  let totalEarnings = 0
  for (const stand of stands) {
    const price = stadium[stand + '_stand_price']
    const size = stadium[stand + '_stand_size']
    const roofFactor = stadium[stand + '_stand_roof'] ? 1.2 : 1
    const priceFactor = 13 / price
    const amountOfGuests = Math.min(size, strengthFactor * priceFactor * 3 * roofFactor)
    details[stand + 'Guests'] = amountOfGuests
    const earnings = amountOfGuests * price
    details[stand + 'Earnings'] = earnings
    totalEarnings += earnings
  }
  await updateTeamBalance(teamA, totalEarnings, 'Stadium ticket earnings', gameDay, season)
  return details
}

/**
 * @param {GameType} game
 */
async function _playGame (game) {
  const [[teamA], [teamB], playerTeamA, playerTeamB] = await Promise.all([
    await query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    await query('SELECT * FROM team WHERE id=?', [game.team_2_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>"" AND in_game_position IS NOT NULL', [game.team_1_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>"" AND in_game_position IS NOT NULL', [game.team_2_id])
  ])
  const strengthTeamA = playerTeamA.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const strengthTeamB = playerTeamB.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const stadiumDetails = await _giveStadiumTicketEarnings(teamA, teamB, strengthTeamA, strengthTeamB, game.game_day, game.season)
  console.log(`\n\nPlay game between ${teamA.name} (${strengthTeamA}) and ${teamB.name} (${strengthTeamB})`)
  const gameDetails = {
    log: [],
    goalsTeamB: 0,
    goalsTeamA: 0,
    strengthTeamA,
    strengthTeamB,
    stadiumDetails
  }
  _kickoff(playerTeamA, playerTeamB, gameDetails)
  for (let minute = 0; minute < 90; minute++) {
    _playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  console.log('Result: ', gameDetails.goalsTeamA, gameDetails.goalsTeamB)
  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    game.id
  ])
}

/**
 * @param {Array<Player>} playerTeamA
 * @param {Array<Player>} playerTeamB
 * @param {Object} gameDetails
 */
function _kickoff (playerTeamA, playerTeamB, gameDetails) {
  const player = randomItem(playerTeamA.concat(playerTeamB))
  player.hasBall = true
  console.log('Kickoff thru: ', player.name)
  gameDetails.log.push({
    player: player.id,
    kickoff: true
  })
}

/**
 * @param {Array<Player>} playerTeamA
 * @param {Array<Player>} playerTeamB
 * @param {Object} gameDetails
 */
function _playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!_fightsOponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!_shootBall(playerTeamA, playerTeamB, gameDetails)) return
  _passBall(playerTeamA, playerTeamB, gameDetails)
}

/**
 * @param {Array<Player>} playerTeamA
 * @param {Array<Player>} playerTeamB
 * @param {Object} gameDetails
 * @returns {boolean} false if lost ball
 */
function _fightsOponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }
  const oponentPosition = determineOponentPosition(activePlayer.position)
  const oponentPlayers = (teamAHasBall ? playerTeamB : playerTeamA).filter(p => p.position === oponentPosition)
  if (oponentPlayers.length === 0) {
    console.log(`${activePlayer.name} has no oponents`)
    return true
  }
  for (const oponentPlayer of oponentPlayers) {
    const chanceToLooseBall = activePlayer.level / (oponentPlayer.level + activePlayer.level)
    const looseBall = Math.random() > chanceToLooseBall
    gameDetails.log.push({
      player: activePlayer.id,
      oponentPlayer: oponentPlayer.id,
      lostBall: looseBall
    })
    if (!looseBall) {
      gameDetails.streak++
      if (gameDetails.streak > 10) {
        console.log('Streak!!!', gameDetails.streak)
      }
    } else {
      gameDetails.streak = 0
      oponentPlayer.hasBall = true
      activePlayer.hasBall = false
      return false
    }
  }
  return true
}

/**
 * @param {Array<Player>} playerTeamA
 * @param {Array<Player>} playerTeamB
 * @param {Object} gameDetails
 * @returns {boolean} false if lost ball
 */
function _shootBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let goalKeeper = playerTeamB.find(p => p.position === 'GK')
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    goalKeeper = playerTeamA.find(p => p.position === 'GK')
    teamAHasBall = false
  }
  const chanceForShoot = Math.min(0.95, _chanceToShoot(activePlayer, gameDetails) * (gameDetails.streak * 0.5))
  if (Math.random() > chanceForShoot) return true
  if (!goalKeeper) {
    console.log('Team has no goalkeeper set!')
  }
  if (goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)) {
    gameDetails.log.push({
      keeperHolds: true,
      goalKeeper: goalKeeper.id
    })
    goalKeeper.hasBall = true
    activePlayer.hasBall = false
    console.log('Keeper has ball...')
    return false
  }
  if (teamAHasBall) {
    gameDetails.goalsTeamA = gameDetails.goalsTeamA ?? 0
    gameDetails.goalsTeamA++
  } else {
    gameDetails.goalsTeamB = gameDetails.goalsTeamB ?? 0
    gameDetails.goalsTeamB++
  }
  console.log('GOAL!', gameDetails.goalsTeamA ?? 0, gameDetails.goalsTeamB ?? 0, 'streak: ' + gameDetails.streak, 'player level: ' + activePlayer.level, 'GK level: ' + (goalKeeper?.level ?? 0), 'shoot chance: ' + chanceForShoot)
  gameDetails.log.push({
    goal: true,
    player: activePlayer.id
  })
  return true
}

/**
 * @param {Player} player
 * @param {Object} gameDetails
 */
function _chanceToShoot (player, gameDetails) {
  if (player.position.endsWith('A')) return 0.2
  if (player.position.endsWith('M')) return 0.1
  if (player.position.endsWith('D')) return 0.01
  return 0.0001
}

/**
 * @param {Array<Player>} playerTeamA
 * @param {Array<Player>} playerTeamB
 * @param {Object} gameDetails
 */
function _passBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }
  let nextPlayer
  if (teamAHasBall) {
    nextPlayer = randomItem(playerTeamA.filter(p => p.id !== activePlayer.id))
  } else {
    nextPlayer = randomItem(playerTeamB.filter(p => p.id !== activePlayer.id))
  }
  activePlayer.hasBall = false
  nextPlayer.hasBall = true
}
