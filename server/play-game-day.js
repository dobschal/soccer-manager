import { query } from './lib/database.js'
import { determineOponentPosition } from '../client/util/formation.js'
import { randomItem } from './lib/util.js'
import { ActionCard } from './entities/actionCard.js'
import { getSponsor } from './helper/sponsorHelper.js'
import { updateTeamBalance } from './helper/financeHelper.js'
import { sallaryPerLevel } from '../client/util/player.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'
import { getPlayerAge } from './helper/playerHelper.js'
import { actionCardChances } from './helper/actionCardHelper.js'
import { generateNewsForGameDay } from './helper/newsHelper.js'
import { completeStadiumConstructions } from './helper/stadiumHelper.js'
import { checkTeamAndNotify } from './helper/logMessageHelper.js'
import { getUserLocale, t } from './i18n/index.js'
import { processYouthTraining } from './helper/youthPlayerHelper.js'

/**
 * @typedef {object} KickoffLogEvent
 * @property {number} player
 * @property {true} kickoff
 */

/**
 * @typedef {object} PassLogEvent
 * @property {true} pass
 * @property {number} newPlayer
 * @property {number} oldPlayer
 */

/**
 * @typedef {object} FightLogEvent
 * @property {number} player
 * @property {number} oponentPlayer
 * @property {boolean} lostBall
 */

/**
 * @typedef {object} KeeperHoldsLogEvent
 * @property {number} player
 * @property {true} keeperHolds
 * @property {number} goalKeeper
 */

/**
 * @typedef {object} GoalLogEvent
 * @property {true} goal
 * @property {number} player
 */

/**
 * @typedef {KickoffLogEvent | PassLogEvent | FightLogEvent | KeeperHoldsLogEvent | GoalLogEvent} GameLogEvent
 */

/**
 * @typedef {object} StadiumDetails
 * @property {number} northGuests
 * @property {number} northEarnings
 * @property {number} southGuests
 * @property {number} southEarnings
 * @property {number} westGuests
 * @property {number} westEarnings
 * @property {number} eastGuests
 * @property {number} eastEarnings
 */

/**
 * @typedef {PlayerType & { hasBall?: boolean }} GamePlayer
 */

/**
 * @typedef {object} GameDetails
 * @property {GameLogEvent[]} log
 * @property {number} goalsTeamA
 * @property {number} goalsTeamB
 * @property {number} strengthTeamA
 * @property {number} strengthTeamB
 * @property {StadiumDetails} stadiumDetails
 * @property {GamePlayer[]} playerTeamA
 * @property {GamePlayer[]} playerTeamB
 * @property {TeamType} teamA
 * @property {TeamType} teamB
 * @property {number} [streak]
 */

/**
 * Position coordinates for calculating pass distances
 * @type {Object<string, {x: number, y: number}>}
 */
const POSITION_COORDS = {
  GK: { x: 1, y: 0 },
  LD: { x: 0, y: 1 },
  CD: { x: 1, y: 1 },
  RD: { x: 2, y: 1 },
  DM: { x: 1, y: 1.5 },
  LM: { x: 0, y: 2 },
  CM: { x: 1, y: 2 },
  RM: { x: 2, y: 2 },
  OM: { x: 1, y: 2.5 },
  LA: { x: 0, y: 3 },
  CA: { x: 1, y: 3 },
  RA: { x: 2, y: 3 }
}

/**
 * Calculate the distance between two positions
 * @param {string} pos1
 * @param {string} pos2
 * @returns {number}
 */
function _getPositionDistance (pos1, pos2) {
  const coord1 = POSITION_COORDS[pos1]
  const coord2 = POSITION_COORDS[pos2]
  if (!coord1 || !coord2) return 1
  return Math.sqrt(Math.pow(coord2.x - coord1.x, 2) + Math.pow(coord2.y - coord1.y, 2))
}

/**
 * @returns {Promise<void>}
 */
export async function calculateGames () {
  const {
    gameDay,
    season
  } = await getGameDayAndSeason()
  console.log(`Calculate games for season ${season} game day ${gameDay}`)

  // Complete any stadium constructions that are due
  await completeStadiumConstructions(gameDay, season)

  const games = await query('SELECT * FROM game WHERE season=? AND game_day=? AND played=0', [season, gameDay])
  if (games.length === 0) return console.error('No games to play...')
  await Promise.all(games.map(game => _playGame(game)))
  await _giveUsersActionCards()
  await _letTeamsPaySallaries(gameDay, season)
  await _giveSponsorMoney(gameDay, season)
  await _giveAllPlayersFreshness(season)
  await _processYouthTeams()
  await generateNewsForGameDay(gameDay, season)
  await _checkUserTeamsForIssues()
  console.log('\n\nPlayed game day ' + gameDay)
}

/**
 * Checks all user teams for issues and notifies them
 * @returns {Promise<void>}
 */
async function _checkUserTeamsForIssues () {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team WHERE user_id IS NOT NULL')
  await Promise.all(teams.map(team => checkTeamAndNotify(team)))
  console.log(`Checked user teams for issues in ${Date.now() - t1}ms`)
}

/**
 * Process youth training for all teams
 * @returns {Promise<void>}
 */
async function _processYouthTeams () {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team')
  await Promise.all(teams.map(team => processYouthTraining(team)))
  console.log(`Processed youth teams in ${Date.now() - t1}ms`)
}

/**
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _giveAllPlayersFreshness (season) {
  /** @type {PlayerType[]} */
  const players = await query('SELECT * FROM player WHERE freshness < 1.0')
  const promises = []
  for (const player of players) {
    const age = await getPlayerAge(player, season)
    if (age <= 21) {
      player.freshness = Math.min(1.0, player.freshness + 0.1)
    } else if (age <= 26) {
      player.freshness = Math.min(1.0, player.freshness + 0.08)
    } else if (age <= 29) {
      player.freshness = Math.min(1.0, player.freshness + 0.06)
    } else if (age <= 32) {
      player.freshness = Math.min(1.0, player.freshness + 0.05)
    } else {
      player.freshness = Math.min(1.0, player.freshness + 0.04)
    }
    if (!player.in_game_position) {
      player.freshness = Math.min(1.0, player.freshness + 0.03)
    }
    promises.push(query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id]))
  }
  await Promise.all(promises)
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _giveSponsorMoney (gameDay, season) {
  const t1 = Date.now()
  /** @type {Array<import('./entities/team.js').TeamType>} */
  const teams = await query('SELECT * FROM team')

  await Promise.all(teams.map(async team => {
    const t1 = Date.now()
    const { sponsor } = await getSponsor(team)
    console.log('Get team sponsor in ' + (Date.now() - t1) + 'ms')
    if (!sponsor) return
    const locale = await getUserLocale(team.user_id)
    const reason = t('finance.sponsorDeal', { name: sponsor.name }, locale)
    await updateTeamBalance(team, sponsor.value, reason, gameDay, season)
  }))
  console.log('Gave all teams their sponsor money in' + (Date.now() - t1) + 'ms')
}

/**
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<void>}
 */
async function _letTeamsPaySallaries (gameDay, season) {
  const t1 = Date.now()
  const teams = await query('SELECT * FROM team')
  await Promise.all(teams.map(async team => {
    const players = await query('SELECT * FROM player WHERE team_ID=?', [team.id])
    const totalSallaryCosts = players.reduce((total, player) => total + sallaryPerLevel[player.level], 0) * -1
    const locale = await getUserLocale(team.user_id)
    const reason = t('finance.playerSalaries', {}, locale)
    await updateTeamBalance(team, totalSallaryCosts, reason, gameDay, season)
  }))
  console.log('Paid all salaries in' + (Date.now() - t1) + 'ms')
}

/**
 * @returns {Promise<void>}
 */
async function _giveUsersActionCards () {
  const t1 = Date.now()
  /** @type {TeamType[]} */
  const teams = await query('SELECT * FROM team')
  const promises = []
  for (const team of teams) {
    const actionCards = []
    while (actionCards.length === 0) {
      if (Math.random() < actionCardChances.LEVEL_UP_PLAYER_10) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'LEVEL_UP_PLAYER_10',
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
      if (Math.random() < actionCardChances.FRESHNESS_10) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'FRESHNESS_10',
          played: 0
        }))
      }
      if (Math.random() < actionCardChances.BONUS_100K) {
        actionCards.push(new ActionCard({
          team_id: team.id,
          action: 'BONUS_100K',
          played: 0
        }))
      }
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
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<StadiumDetails>}
 */
async function _giveStadiumTicketEarnings (teamA, teamB, strengthTeamA, strengthTeamB, gameDay, season) {
  const strengthFactor = (strengthTeamA || 0) * (strengthTeamB || 0)
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [teamA.id])

  // If no stadium found, return empty details with no earnings
  if (!stadium) {
    console.warn(`No stadium found for team ${teamA.id}`)
    return {}
  }

  const stands = ['north', 'south', 'west', 'east']
  const details = {}
  let totalEarnings = 0
  for (const stand of stands) {
    // Skip if stand is under construction (check for truthy value to handle missing columns)
    const constructionEndDay = stadium[`${stand}_construction_end_game_day`]
    if (constructionEndDay != null) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      details[stand + 'UnderConstruction'] = true
      continue
    }

    const price = stadium[stand + '_stand_price'] || 0
    const size = stadium[stand + '_stand_size'] || 0

    // Skip if price is 0 to avoid division by zero
    if (price <= 0 || size <= 0) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      continue
    }

    const roofFactor = stadium[stand + '_stand_roof'] ? 1.2 : 1
    const priceFactor = 15 / price
    const amountOfGuests = Math.floor(Math.min(size, strengthFactor * priceFactor * roofFactor))
    details[stand + 'Guests'] = amountOfGuests
    const earnings = amountOfGuests * price
    details[stand + 'Earnings'] = earnings
    totalEarnings += earnings
  }

  // Final safety check - never pass NaN to balance update
  if (isNaN(totalEarnings)) {
    console.error(`NaN earnings detected for team ${teamA.id}, stadium:`, stadium)
    totalEarnings = 0
  }

  const locale = await getUserLocale(teamA.user_id)
  const reason = t('finance.stadiumTicketEarnings', {}, locale)
  await updateTeamBalance(teamA, totalEarnings, reason, gameDay, season)
  return details
}

/**
 * @param {GameType} game
 * @returns {Promise<void>}
 */
async function _playGame (game) {
  const [[teamA], [teamB], playerTeamA, playerTeamB] = await Promise.all([
    await query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    await query('SELECT * FROM team WHERE id=?', [game.team_2_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_1_id]),
    await query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [game.team_2_id])
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
    stadiumDetails,
    playerTeamA,
    playerTeamB,
    teamA,
    teamB
  }
  for (const player of playerTeamA) {
    player.level = player.freshness * player.level
  }
  for (const player of playerTeamB) {
    player.level = player.freshness * player.level
  }
  _kickoff(playerTeamA, playerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    _playGameStep(playerTeamA, playerTeamB, gameDetails)
  }
  await query('UPDATE game SET details=?, played=1, goals_team_1=?, goals_team_2=?, created_at=? WHERE id=?', [
    JSON.stringify(gameDetails),
    gameDetails.goalsTeamA,
    gameDetails.goalsTeamB,
    new Date(),
    game.id
  ])
  for (const player of playerTeamA) {
    // Goalkeepers lose half the freshness of other players
    const freshnessLoss = player.position === 'GK' ? 0.05 : 0.1
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
  }
  for (const player of playerTeamB) {
    // Goalkeepers lose half the freshness of other players
    const freshnessLoss = player.position === 'GK' ? 0.05 : 0.1
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
  }
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
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
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
function _playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!_fightsOponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!_shootBall(playerTeamA, playerTeamB, gameDetails)) return
  _passBall(playerTeamA, playerTeamB, gameDetails)
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
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
  if (Math.random() > _chanceToFight(activePlayer)) {
    return true
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
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
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
  // Base chance + streak bonus (allows shots even at streak 0)
  const chanceForShoot = Math.min(0.95, _chanceToShoot(activePlayer, gameDetails) * (1 + gameDetails.streak * 0.3))
  if (Math.random() > chanceForShoot) return true
  if (!goalKeeper) {
    console.log('Team has no goalkeeper set!')
  }
  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)
  const shotMisses = Math.random() > 0.25
  if (keeperSaves || (goalKeeper && shotMisses)) {
    gameDetails.log.push({
      player: activePlayer.id,
      keeperHolds: true,
      goalKeeper: goalKeeper.id
    })
    goalKeeper.hasBall = true
    activePlayer.hasBall = false
    return false
  }
  if (!goalKeeper && shotMisses) {
    // Shot missed, ball goes to random opponent
    return true
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
 * Base chance to attempt a shot per game step (scaled to match Bundesliga ~13 shots/team/game)
 * @param {PlayerType} player
 * @returns {number}
 */
function _chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.11
  if (player.position.endsWith('M')) return 0.045
  if (player.position.endsWith('D')) return 0.005
  return 0.00006
}

/**
 * @param {PlayerType} player
 * @returns {number}
 */
function _chanceToFight (player) {
  if (player.position.endsWith('A')) return 0.75
  if (player.position.endsWith('M')) return 0.5
  if (player.position.endsWith('D')) return 0.1
  return 0.01
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
function _passBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }

  const teammates = teamAHasBall
    ? playerTeamA.filter(p => p.id !== activePlayer.id)
    : playerTeamB.filter(p => p.id !== activePlayer.id)

  const team = teamAHasBall ? gameDetails.teamA : gameDetails.teamB
  const passStyle = team.pass_style || 'mixed'

  const nextPlayer = _selectPassTarget(activePlayer, teammates, passStyle)

  activePlayer.hasBall = false
  nextPlayer.hasBall = true
  gameDetails.log.push({
    pass: true,
    newPlayer: nextPlayer.id,
    oldPlayer: activePlayer.id
  })
}

/**
 * Select the next player to pass to based on pass style
 * @param {GamePlayer} activePlayer
 * @param {GamePlayer[]} teammates
 * @param {string} passStyle - 'short', 'mixed', or 'long'
 * @returns {GamePlayer}
 */
function _selectPassTarget (activePlayer, teammates, passStyle) {
  if (teammates.length === 0) return activePlayer

  // Calculate distances to all teammates
  const teammatesWithDistance = teammates.map(player => ({
    player,
    distance: _getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  // Sort by distance
  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  // Determine the threshold for short vs long (median distance)
  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  if (passStyle === 'short') {
    // Always pick from nearby players
    return randomItem(shortPassTargets).player
  } else if (passStyle === 'long') {
    // Always pick from far players
    return randomItem(longPassTargets).player
  } else {
    // Mixed: 50% chance for short, 50% for long
    if (Math.random() < 0.5) {
      return randomItem(shortPassTargets).player
    } else {
      return randomItem(longPassTargets).player
    }
  }
}
