import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { determineOponentPosition } from '../../client/util/formation.js'
import { randomItem } from '../lib/util.js'

/**
 * Play style modifiers for fight chance and card chance
 * Target yellow cards per game: aggressive 4.0, normal 3.5, friendly 3.0
 * @type {Object<string, {fightBonus: number, cardChance: number}>}
 */
const PLAY_STYLE_MODIFIERS = {
  aggressive: { fightBonus: 0.15, cardChance: 0.005 },
  normal: { fightBonus: 0, cardChance: 0.004 },
  friendly: { fightBonus: -0.15, cardChance: 0.003 }
}

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

export default {
  /**
   * Play a friendly match against another team
   * @param {number} opponentTeamId
   * @param {Request} req
   * @returns {Promise<{game: object}>}
   */
  async playFriendlyMatch (opponentTeamId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const myTeam = await getTeam(req)
    const opponentTeam = await getTeamById(opponentTeamId)

    if (!opponentTeam) {
      throw new BadRequestError('Opponent team not found')
    }

    if (opponentTeam.id === myTeam.id) {
      throw new BadRequestError('Cannot play against your own team')
    }

    const { gameDay, season } = await getGameDayAndSeason()

    // Check if user already played a friendly today
    const existingFriendly = await query(
      `SELECT * FROM game
       WHERE game_type = 'friendly'
       AND season = ?
       AND game_day = ?
       AND (team_1_id = ? OR team_2_id = ?)`,
      [season, gameDay, myTeam.id, myTeam.id]
    )

    if (existingFriendly.length > 0) {
      throw new BadRequestError('You can only play one friendly match per game day')
    }

    // Play the game
    const gameDetails = await _playFriendlyGame(myTeam, opponentTeam, gameDay, season)

    // Insert the game record
    const result = await query(
      `INSERT INTO game SET ?`,
      {
        season,
        game_day: gameDay,
        level: myTeam.level,
        league: myTeam.league,
        team_1_id: myTeam.id,
        team_2_id: opponentTeam.id,
        played: 1,
        goals_team_1: gameDetails.goalsTeamA,
        goals_team_2: gameDetails.goalsTeamB,
        details: JSON.stringify(gameDetails),
        game_type: 'friendly'
      }
    )

    return {
      game: {
        id: result.insertId,
        gameDay,
        season,
        goalsTeam1: gameDetails.goalsTeamA,
        goalsTeam2: gameDetails.goalsTeamB,
        team1Id: myTeam.id,
        team2Id: opponentTeam.id,
        team1: myTeam.name,
        team2: opponentTeam.name,
        details: gameDetails,
        isFriendly: true
      }
    }
  },

  /**
   * Check if user can play a friendly match today
   * @param {Request} req
   * @returns {Promise<{canPlay: boolean, reason?: string}>}
   */
  async canPlayFriendlyToday (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const myTeam = await getTeam(req)
    const { gameDay, season } = await getGameDayAndSeason()

    const existingFriendly = await query(
      `SELECT * FROM game
       WHERE game_type = 'friendly'
       AND season = ?
       AND game_day = ?
       AND (team_1_id = ? OR team_2_id = ?)`,
      [season, gameDay, myTeam.id, myTeam.id]
    )

    if (existingFriendly.length > 0) {
      return { canPlay: false, reason: 'alreadyPlayed' }
    }

    return { canPlay: true }
  },

  /**
   * Get the user's friendly matches for a season
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{results: Array}>}
   */
  async getFriendlyResults (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const myTeam = await getTeam(req)

    const results = await query(
      `SELECT g.id           as id,
              g.game_day     as gameDay,
              g.season       as season,
              g.goals_team_1 as goalsTeam1,
              g.goals_team_2 as goalsTeam2,
              t1.name        as team1,
              t2.name        as team2,
              g.team_1_id    as team1Id,
              g.team_2_id    as team2Id,
              t1.color       as team1Color,
              t1.emblem      as team1Emblem,
              t2.color       as team2Color,
              t2.emblem      as team2Emblem,
              g.details      as details,
              g.created_at   as created_at
       FROM game g
       JOIN team t1 ON t1.id = g.team_1_id
       JOIN team t2 ON t2.id = g.team_2_id
       WHERE g.game_type = 'friendly'
         AND g.played = 1
         AND g.season = ?
         AND (g.team_1_id = ? OR g.team_2_id = ?)
       ORDER BY g.game_day ASC, g.created_at ASC`,
      [season, myTeam.id, myTeam.id]
    )

    return { results }
  },

  /**
   * Get friendly matches for the user's team
   * @param {number} limit - Maximum number of games to return
   * @param {Request} req
   * @returns {Promise<{games: Array}>}
   */
  async getFriendlyGames (limit = 10, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const myTeam = await getTeam(req)

    // Get most recent games, then reverse to show oldest first (for slider display)
    const games = await query(
      `SELECT * FROM (
        SELECT g.id as id,
              g.game_day as gameDay,
              g.season as season,
              g.goals_team_1 as goalsTeam1,
              g.goals_team_2 as goalsTeam2,
              t1.name as team1,
              t2.name as team2,
              g.team_1_id as team1Id,
              g.team_2_id as team2Id,
              t1.color as team1Color,
              t1.emblem as team1Emblem,
              t2.color as team2Color,
              t2.emblem as team2Emblem,
              g.created_at
        FROM game g
        JOIN team t1 ON t1.id = g.team_1_id
        JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.game_type = 'friendly'
          AND g.played = 1
          AND (g.team_1_id = ? OR g.team_2_id = ?)
        ORDER BY g.created_at DESC
        LIMIT ?
      ) recent_games ORDER BY created_at ASC`,
      [myTeam.id, myTeam.id, limit]
    )

    return { games }
  }
}

/**
 * Play a friendly game (without card persistence or full fan count)
 * @param {TeamType} teamA - User's team (home)
 * @param {TeamType} teamB - Opponent team (away)
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<object>}
 */
async function _playFriendlyGame (teamA, teamB, gameDay, season) {
  const [playerTeamA, playerTeamB] = await Promise.all([
    query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [teamA.id]),
    query('SELECT * FROM player WHERE team_id=? AND in_game_position<>\'\' AND in_game_position IS NOT NULL', [teamB.id])
  ])

  // Filter out suspended players (but don't clear suspensions in friendly)
  const activePlayerTeamA = playerTeamA.filter(p => !p.is_suspended)
  const activePlayerTeamB = playerTeamB.filter(p => !p.is_suspended)

  const strengthTeamA = activePlayerTeamA.reduce((total, p) => total + p.level, 0)
  const strengthTeamB = activePlayerTeamB.reduce((total, p) => total + p.level, 0)

  // Friendly games have half the fans
  const stadiumDetails = await _getFriendlyStadiumEarnings(teamA, teamB, strengthTeamA, strengthTeamB, gameDay, season)

  console.log(`\n\nFriendly match: ${teamA.name} (${strengthTeamA}) vs ${teamB.name} (${strengthTeamB})`)

  const gameDetails = {
    log: [],
    goalsTeamB: 0,
    goalsTeamA: 0,
    strengthTeamA,
    strengthTeamB,
    stadiumDetails,
    playerTeamA: activePlayerTeamA,
    playerTeamB: activePlayerTeamB,
    teamA,
    teamB,
    isFriendly: true
  }

  // Apply freshness to player levels for the game
  for (const player of activePlayerTeamA) {
    player.level = player.freshness * player.level
  }
  for (const player of activePlayerTeamB) {
    player.level = player.freshness * player.level
  }

  _kickoff(activePlayerTeamA, activePlayerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    _playGameStep(activePlayerTeamA, activePlayerTeamB, gameDetails)
  }

  // In friendly matches, don't update player freshness or card counts
  // Cards shown in the game are for display only

  return gameDetails
}

/**
 * Calculate stadium earnings for a friendly match (half the normal amount)
 * @param {TeamType} teamA
 * @param {TeamType} teamB
 * @param {number} strengthTeamA
 * @param {number} strengthTeamB
 * @param {number} gameDay
 * @param {number} season
 * @returns {Promise<object>}
 */
async function _getFriendlyStadiumEarnings (teamA, teamB, strengthTeamA, strengthTeamB, gameDay, season) {
  const strengthFactor = (strengthTeamA || 0) * (strengthTeamB || 0)
  const [stadium] = await query('SELECT * FROM stadium WHERE team_id=?', [teamA.id])

  if (!stadium) {
    console.warn(`No stadium found for team ${teamA.id}`)
    return {}
  }

  const stands = ['north', 'south', 'west', 'east']
  const details = {}
  let totalEarnings = 0

  for (const stand of stands) {
    const constructionEndDay = stadium[`${stand}_construction_end_game_day`]
    if (constructionEndDay != null) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      details[stand + 'UnderConstruction'] = true
      continue
    }

    const price = stadium[stand + '_stand_price'] || 0
    const size = stadium[stand + '_stand_size'] || 0

    if (price <= 0 || size <= 0) {
      details[stand + 'Guests'] = 0
      details[stand + 'Earnings'] = 0
      continue
    }

    const roofFactor = stadium[stand + '_stand_roof'] ? 1.2 : 1
    const priceFactor = 15 / price
    // Friendly matches have HALF the normal attendance
    const amountOfGuests = Math.floor(Math.min(size, strengthFactor * priceFactor * roofFactor * 0.5))
    details[stand + 'Guests'] = amountOfGuests
    const earnings = amountOfGuests * price
    details[stand + 'Earnings'] = earnings
    totalEarnings += earnings
  }

  if (isNaN(totalEarnings)) {
    console.error(`NaN earnings detected for team ${teamA.id}`)
    totalEarnings = 0
  }

  // Give stadium earnings to home team
  const locale = await getUserLocale(teamA.user_id)
  const reason = t('finance.friendlyMatchTickets', {}, locale)
  await updateTeamBalance(teamA, totalEarnings, reason, gameDay, season)

  return details
}

// Game simulation functions (simplified from play-game-day.js)

function _kickoff (playerTeamA, playerTeamB, gameDetails) {
  const player = randomItem(playerTeamA.concat(playerTeamB))
  player.hasBall = true
  gameDetails.log.push({ player: player.id, kickoff: true })
}

function _playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!_fightsOpponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!_shootBall(playerTeamA, playerTeamB, gameDetails)) return
  _passBall(playerTeamA, playerTeamB, gameDetails)
}

function _fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  gameDetails.streak = gameDetails.streak ?? 0
  gameDetails.yellowCardsInMatch = gameDetails.yellowCardsInMatch ?? {}
  gameDetails.sentOffPlayerIds = gameDetails.sentOffPlayerIds ?? []
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff)
    teamAHasBall = false
  }

  if (!activePlayer) {
    const teamWithBall = teamAHasBall ? playerTeamA : playerTeamB
    const availablePlayers = teamWithBall.filter(p => !p.sentOff)
    if (availablePlayers.length > 0) {
      activePlayer = randomItem(availablePlayers)
      activePlayer.hasBall = true
    } else {
      return true
    }
  }

  if (Math.random() > _chanceToFight(activePlayer)) {
    return true
  }

  const oponentPosition = determineOponentPosition(activePlayer.position)
  const defendingTeam = teamAHasBall ? playerTeamB : playerTeamA
  const oponentPlayers = defendingTeam.filter(p => p.position === oponentPosition && !p.sentOff)

  if (oponentPlayers.length === 0) {
    return true
  }

  const defendingTeamObj = teamAHasBall ? gameDetails.teamB : gameDetails.teamA
  const attackingTeamObj = teamAHasBall ? gameDetails.teamA : gameDetails.teamB
  const defendingPlayStyle = defendingTeamObj.play_style || 'normal'
  const attackingPlayStyle = attackingTeamObj.play_style || 'normal'

  for (const oponentPlayer of oponentPlayers) {
    const defendingModifier = PLAY_STYLE_MODIFIERS[defendingPlayStyle] || PLAY_STYLE_MODIFIERS.normal
    const attackingModifier = PLAY_STYLE_MODIFIERS[attackingPlayStyle] || PLAY_STYLE_MODIFIERS.normal

    const effectiveDefenderLevel = oponentPlayer.level * (1 + defendingModifier.fightBonus)
    const effectiveAttackerLevel = activePlayer.level * (1 + attackingModifier.fightBonus)

    const chanceToLooseBall = effectiveAttackerLevel / (effectiveDefenderLevel + effectiveAttackerLevel)
    const looseBall = Math.random() > chanceToLooseBall

    // Check for cards (but don't persist them in friendly matches)
    _checkForCard(oponentPlayer, defendingPlayStyle, gameDetails, defendingTeam)
    _checkForCard(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB)

    gameDetails.log.push({
      player: activePlayer.id,
      oponentPlayer: oponentPlayer.id,
      lostBall: looseBall
    })

    if (!looseBall) {
      gameDetails.streak++
    } else {
      gameDetails.streak = 0
      if (oponentPlayer.sentOff) {
        const availableDefenders = defendingTeam.filter(p => !p.sentOff)
        if (availableDefenders.length > 0) {
          randomItem(availableDefenders).hasBall = true
        }
      } else {
        oponentPlayer.hasBall = true
      }
      activePlayer.hasBall = false
      return false
    }
  }
  return true
}

function _checkForCard (player, playStyle, gameDetails, team) {
  if (player.sentOff) return

  const modifier = PLAY_STYLE_MODIFIERS[playStyle] || PLAY_STYLE_MODIFIERS.normal

  if (Math.random() < modifier.cardChance) {
    player.yellowCardsInMatch = (player.yellowCardsInMatch || 0) + 1
    gameDetails.yellowCardsInMatch[player.id] = player.yellowCardsInMatch

    if (player.yellowCardsInMatch >= 2) {
      player.sentOff = true
      gameDetails.sentOffPlayerIds.push(player.id)
      gameDetails.log.push({ redCard: true, player: player.id, secondYellow: true })

      if (player.hasBall) {
        player.hasBall = false
        const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
        if (availablePlayers.length > 0) {
          randomItem(availablePlayers).hasBall = true
        }
      }
    } else {
      gameDetails.log.push({ yellowCard: true, player: player.id })
    }
  }

  if (playStyle === 'aggressive' && Math.random() < 0.0001 && !player.sentOff) {
    player.sentOff = true
    gameDetails.sentOffPlayerIds.push(player.id)
    gameDetails.log.push({ redCard: true, player: player.id })

    if (player.hasBall) {
      player.hasBall = false
      const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
      if (availablePlayers.length > 0) {
        randomItem(availablePlayers).hasBall = true
      }
    }
  }
}

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

  const chanceForShoot = Math.min(0.95, _chanceToShoot(activePlayer, gameDetails) * (1 + gameDetails.streak * 0.3))
  if (Math.random() > chanceForShoot) return true

  // Shot is on target ~24% of the time
  const shotOnTarget = Math.random() < 0.24

  if (!shotOnTarget) {
    return true
  }

  // Shot on target - check if keeper saves
  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)

  if (keeperSaves) {
    gameDetails.log.push({
      player: activePlayer.id,
      keeperHolds: true,
      goalKeeper: goalKeeper.id
    })
    goalKeeper.hasBall = true
    activePlayer.hasBall = false
    return false
  }

  // GOAL!
  if (teamAHasBall) {
    gameDetails.goalsTeamA = gameDetails.goalsTeamA ?? 0
    gameDetails.goalsTeamA++
  } else {
    gameDetails.goalsTeamB = gameDetails.goalsTeamB ?? 0
    gameDetails.goalsTeamB++
  }

  gameDetails.log.push({ goal: true, player: activePlayer.id })
  return true
}

function _chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.095
  if (player.position.endsWith('M')) return 0.04
  if (player.position.endsWith('D')) return 0.004
  return 0.00005
}

function _chanceToFight (player) {
  if (player.position.endsWith('A')) return 0.75
  if (player.position.endsWith('M')) return 0.5
  if (player.position.endsWith('D')) return 0.1
  return 0.01
}

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

function _getPositionDistance (pos1, pos2) {
  const coord1 = POSITION_COORDS[pos1]
  const coord2 = POSITION_COORDS[pos2]
  if (!coord1 || !coord2) return 1
  return Math.sqrt(Math.pow(coord2.x - coord1.x, 2) + Math.pow(coord2.y - coord1.y, 2))
}

function _selectPassTarget (activePlayer, teammates, passStyle) {
  if (teammates.length === 0) return activePlayer

  const teammatesWithDistance = teammates.map(player => ({
    player,
    distance: _getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  if (passStyle === 'short') {
    return randomItem(shortPassTargets).player
  } else if (passStyle === 'long') {
    return randomItem(longPassTargets).player
  } else {
    if (Math.random() < 0.5) {
      return randomItem(shortPassTargets).player
    } else {
      return randomItem(longPassTargets).player
    }
  }
}
