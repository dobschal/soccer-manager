import { query } from './lib/database.js'
import { determineOponentPosition } from '../client/lib/formation.js'
import { randomItem } from './lib/util.js'
import { ActionCard } from './entities/actionCard.js'

const actionCards = {
  LEVEL_UP_PLAYER: 0.333,
  CHANGE_PLAYER_POSITION: 0.033,
  NEW_YOUTH_PLYER: 0.033
}

export async function calculateGames () {
  const [{ game_day: gameDay, season }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
  console.log(`Calculate games for season ${season} game day ${gameDay}`)
  const games = await query('SELECT * FROM game WHERE season=? AND game_day=? AND played=0', [season, gameDay])
  await Promise.all(games.map(game => _playGame(game)))
  await _giveUsersActionCards()
}

async function _giveUsersActionCards () {
  const users = await query('SELECT * FROM user')
  for (const user of users) {
    let actionCard
    if (Math.random() < actionCards.LEVEL_UP_PLAYER) {
      actionCard = new ActionCard({
        user_id: user.id,
        action: 'LEVEL_UP_PLAYER',
        played: 0
      })
    } else if (Math.random() < actionCards.CHANGE_PLAYER_POSITION) {
      actionCard = new ActionCard({
        user_id: user.id,
        action: 'CHANGE_PLAYER_POSITION',
        played: 0
      })
    } else if (Math.random() < actionCards.NEW_YOUTH_PLYER) {
      actionCard = new ActionCard({
        user_id: user.id,
        action: 'NEW_YOUTH_PLYER',
        played: 0
      })
    }
    if (actionCard) {
      await query('INSERT INTO action_card SET ?', actionCard)
    }
  }
}

/**
 * @param {Game} game
 */
async function _playGame (game) {
  const [teamA] = await query('SELECT * FROM team WHERE id=?', [game.team_1_id])
  const [teamB] = await query('SELECT * FROM team WHERE id=?', [game.team_2_id])
  const playerTeamA = await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>"" AND in_game_position IS NOT NULL', [game.team_1_id])
  const playerTeamB = await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>"" AND in_game_position IS NOT NULL', [game.team_2_id])
  const strengthTeamA = playerTeamA.reduce((totalStrength, player) => totalStrength + player.level, 0)
  const strengthTeamB = playerTeamB.reduce((totalStrength, player) => totalStrength + player.level, 0)
  console.log(`\n\nPlay game between ${teamA.name} (${strengthTeamA}) and ${teamB.name} (${strengthTeamB})`)
  const gameDetails = {
    log: [],
    goalsTeamB: 0,
    goalsTeamA: 0,
    strengthTeamA,
    strengthTeamB
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
  if (Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)) {
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
  console.log('GOAL!', gameDetails.goalsTeamA ?? 0, gameDetails.goalsTeamB ?? 0, 'streak: ' + gameDetails.streak, 'player level: ' + activePlayer.level, 'GK level: ' + goalKeeper.level, 'shoot chance: ' + chanceForShoot)
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
