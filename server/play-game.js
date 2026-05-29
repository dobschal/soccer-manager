import { determineOponentPosition } from '../client/util/formation.js'
import { randomItem } from './lib/util.js'

/**
 * Injury types with duration (game days) and selection weight
 */
export const INJURY_TYPES = [
  { type: 'bruise', days: 1, weight: 30 },
  { type: 'muscle_strain', days: 2, weight: 25 },
  { type: 'ligament_sprain', days: 3, weight: 18 },
  { type: 'muscle_tear', days: 4, weight: 12 },
  { type: 'fracture', days: 6, weight: 7 },
  { type: 'meniscus_tear', days: 8, weight: 5 },
  { type: 'acl_tear', days: 14, weight: 2 },
  { type: 'achilles_rupture', days: 18, weight: 1 }
]

/**
 * Position group mapping for bench substitutions
 */
export const POSITION_GROUPS = {
  GK: 'BENCH_GK',
  LD: 'BENCH_DEF', CD: 'BENCH_DEF', RD: 'BENCH_DEF',
  DM: 'BENCH_MID', LM: 'BENCH_MID', CM: 'BENCH_MID', RM: 'BENCH_MID', OM: 'BENCH_MID',
  LA: 'BENCH_ATT', CA: 'BENCH_ATT', RA: 'BENCH_ATT'
}

/**
 * Base injury probability per fight
 */
const INJURY_BASE_CHANCE = 0.0003

/**
 * Play style multipliers for injury chance
 */
const INJURY_STYLE_MULTIPLIERS = {
  aggressive: 1.5,
  normal: 1.0,
  friendly: 0.7
}

/**
 * Select a weighted random injury type
 * @returns {{ type: string, days: number }}
 */
export function selectInjuryType () {
  const totalWeight = INJURY_TYPES.reduce((sum, i) => sum + i.weight, 0)
  let roll = Math.random() * totalWeight
  for (const injury of INJURY_TYPES) {
    roll -= injury.weight
    if (roll <= 0) return { type: injury.type, days: injury.days }
  }
  return INJURY_TYPES[0]
}

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
 * @typedef {object} YellowCardLogEvent
 * @property {true} yellowCard
 * @property {number} player
 */

/**
 * @typedef {object} RedCardLogEvent
 * @property {true} redCard
 * @property {number} player
 * @property {boolean} [secondYellow] - True if red card from second yellow
 */

/**
 * @typedef {KickoffLogEvent | PassLogEvent | FightLogEvent | KeeperHoldsLogEvent | GoalLogEvent | YellowCardLogEvent | RedCardLogEvent} GameLogEvent
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
 * @typedef {PlayerType & { hasBall?: boolean, yellowCardsInMatch?: number, sentOff?: boolean, injuredInMatch?: boolean, substitutedOut?: boolean, originalFreshness?: number }} GamePlayer
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
 * @property {Object<number, number>} [yellowCardsInMatch] - Yellow cards by player id during this match
 * @property {number[]} [sentOffPlayerIds] - Player IDs sent off during this match
 * @property {Array<{playerId: number, playerName: string, teamIndex: number, injuryType: string, injuryDays: number, minute: number}>} [injuries]
 * @property {Array<{playerInId: number, playerInName: string, playerOutId: number, playerOutName: string, teamIndex: number, reason: string, minute: number}>} [substitutions]
 * @property {{BENCH_GK?: GamePlayer, BENCH_DEF?: GamePlayer, BENCH_MID?: GamePlayer, BENCH_ATT?: GamePlayer}} [benchTeamA]
 * @property {{BENCH_GK?: GamePlayer, BENCH_DEF?: GamePlayer, BENCH_MID?: GamePlayer, BENCH_ATT?: GamePlayer}} [benchTeamB]
 * @property {number} [substitutionCountA] - Non-injury substitutions for team A
 * @property {number} [substitutionCountB] - Non-injury substitutions for team B
 * @property {boolean} [injuryTeamA] - Whether team A already had an injury this match
 * @property {boolean} [injuryTeamB] - Whether team B already had an injury this match
 */

/**
 * Play style modifiers for fight chance and card chance
 * Target yellow cards per game: aggressive 4.0, normal 3.5, friendly 3.0
 * Target red cards per game: aggressive 0.13, normal 0.1, friendly 0.07
 * @type {Object<string, {fightBonus: number, cardChance: number}>}
 */
/**
 * Attack mode modifiers for forward pass bias and ball loss risk
 * @type {Object<string, {forwardBias: number, ballLossBase: number}>}
 */
export const ATTACK_MODE_MODIFIERS = {
  offensive: {
    forwardBias: 0.85,
    ballLossBase: 0.06
  },
  balanced: {
    forwardBias: 0.50,
    ballLossBase: 0.03
  },
  defensive: {
    forwardBias: 0.20,
    ballLossBase: 0.01
  }
}

export const PLAY_STYLE_MODIFIERS = {
  aggressive: {
    fightBonus: 0.15,
    cardChance: 0.008
  },
  normal: {
    fightBonus: 0,
    cardChance: 0.0065
  },
  friendly: {
    fightBonus: -0.15,
    cardChance: 0.0055
  }
}

/**
 * Position coordinates for calculating pass distances
 * @type {Object<string, {x: number, y: number}>}
 */
const POSITION_COORDS = {
  GK: {
    x: 1,
    y: 0
  },
  LD: {
    x: 0,
    y: 1
  },
  CD: {
    x: 1,
    y: 1
  },
  RD: {
    x: 2,
    y: 1
  },
  DM: {
    x: 1,
    y: 1.5
  },
  LM: {
    x: 0,
    y: 2
  },
  CM: {
    x: 1,
    y: 2
  },
  RM: {
    x: 2,
    y: 2
  },
  OM: {
    x: 1,
    y: 2.5
  },
  LA: {
    x: 0,
    y: 3
  },
  CA: {
    x: 1,
    y: 3
  },
  RA: {
    x: 2,
    y: 3
  }
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
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {void}
 */
export function kickoff (playerTeamA, playerTeamB, gameDetails) {
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
export function playGameStep (playerTeamA, playerTeamB, gameDetails) {
  // Check user-scheduled substitutions based on bench substitution modes
  checkScheduledSubstitutions(playerTeamA, playerTeamB, gameDetails)

  // Numerical disadvantage: team with fewer active players loses possession more often
  const activeA = playerTeamA.filter(p => !p.sentOff && !p.substitutedOut).length
  const activeB = playerTeamB.filter(p => !p.sentOff && !p.substitutedOut).length
  if (activeA !== activeB) {
    const ballHolder = playerTeamA.find(p => p.hasBall && !p.sentOff && !p.substitutedOut) || playerTeamB.find(p => p.hasBall && !p.sentOff && !p.substitutedOut)
    if (ballHolder) {
      const teamAHasBall = playerTeamA.some(p => p.id === ballHolder.id)
      const holdingTeamSize = teamAHasBall ? activeA : activeB
      const opposingTeamSize = teamAHasBall ? activeB : activeA
      if (opposingTeamSize > holdingTeamSize) {
        // 4% turnover chance per missing player per step
        const turnoverChance = (opposingTeamSize - holdingTeamSize) * 0.04
        if (Math.random() < turnoverChance) {
          ballHolder.hasBall = false
          const opponents = (teamAHasBall ? playerTeamB : playerTeamA).filter(p => !p.sentOff && !p.substitutedOut)
          if (opponents.length > 0) {
            randomItem(opponents).hasBall = true
            gameDetails.streak = 0
            return
          }
        }
      }
    }
  }
  if (!_fightsOpponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!_shootBall(playerTeamA, playerTeamB, gameDetails)) return
  _passBall(playerTeamA, playerTeamB, gameDetails)
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {boolean} false if lost ball
 */
function _fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff && !p.substitutedOut)
  gameDetails.streak = gameDetails.streak ?? 0
  gameDetails.yellowCardsInMatch = gameDetails.yellowCardsInMatch ?? {}
  gameDetails.sentOffPlayerIds = gameDetails.sentOffPlayerIds ?? []
  let teamAHasBall = true
  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff && !p.substitutedOut)
    teamAHasBall = false
  }

  // If player was sent off or substituted, pass ball to teammate
  if (!activePlayer) {
    const teamWithBall = teamAHasBall ? playerTeamA : playerTeamB
    const availablePlayers = teamWithBall.filter(p => !p.sentOff && !p.substitutedOut)
    if (availablePlayers.length > 0) {
      activePlayer = randomItem(availablePlayers)
      activePlayer.hasBall = true
    } else {
      return true // No players available
    }
  }

  if (Math.random() > _chanceToFight(activePlayer)) {
    return true
  }

  const oponentPosition = determineOponentPosition(activePlayer.position)
  const defendingTeam = teamAHasBall ? playerTeamB : playerTeamA
  const oponentPlayers = defendingTeam.filter(p => p.position === oponentPosition && !p.sentOff && !p.substitutedOut)

  if (oponentPlayers.length === 0) {
    // No defender at this position - massive advantage for attacker (open space)
    gameDetails.streak += 3
    return true
  }

  const defendingTeamObj = teamAHasBall ? gameDetails.teamB : gameDetails.teamA
  const attackingTeamObj = teamAHasBall ? gameDetails.teamA : gameDetails.teamB
  const defendingPlayStyle = defendingTeamObj.play_style || 'normal'
  const attackingPlayStyle = attackingTeamObj.play_style || 'normal'

  for (const oponentPlayer of oponentPlayers) {
    // Apply play style modifiers to fight chance
    const defendingModifier = PLAY_STYLE_MODIFIERS[defendingPlayStyle] || PLAY_STYLE_MODIFIERS.normal
    const attackingModifier = PLAY_STYLE_MODIFIERS[attackingPlayStyle] || PLAY_STYLE_MODIFIERS.normal

    // Defender's bonus helps them win the ball
    const effectiveDefenderLevel = oponentPlayer.level * (1 + defendingModifier.fightBonus)
    // Attacker's bonus helps them keep the ball
    const effectiveAttackerLevel = activePlayer.level * (1 + attackingModifier.fightBonus)

    const chanceToLooseBall = effectiveAttackerLevel / (effectiveDefenderLevel + effectiveAttackerLevel)
    const looseBall = Math.random() > chanceToLooseBall

    // Check for cards during the fight (defender has card chance based on their play style)
    _checkForCard(oponentPlayer, defendingPlayStyle, gameDetails, defendingTeam)
    _checkForCard(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB)

    // Check for injuries during the fight
    checkForInjury(oponentPlayer, defendingPlayStyle, gameDetails, defendingTeam, !teamAHasBall)
    checkForInjury(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB, teamAHasBall)

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
      // If the opponent was sent off or substituted during this fight, ball goes to random teammate
      if (oponentPlayer.sentOff || oponentPlayer.substitutedOut) {
        const availableDefenders = defendingTeam.filter(p => !p.sentOff && !p.substitutedOut)
        if (availableDefenders.length > 0) {
          const newPlayer = randomItem(availableDefenders)
          newPlayer.hasBall = true
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

/**
 * Check if a player receives a card during a fight
 * @param {GamePlayer} player
 * @param {string} playStyle
 * @param {GameDetails} gameDetails
 * @param {GamePlayer[]} team
 */
function _checkForCard (player, playStyle, gameDetails, team) {
  if (player.sentOff) return

  const modifier = PLAY_STYLE_MODIFIERS[playStyle] || PLAY_STYLE_MODIFIERS.normal

  // Player with a yellow card plays more cautiously (less likely to foul again)
  const cautionFactor = (player.yellowCardsInMatch || 0) >= 1 ? 0.17 : 1
  const effectiveCardChance = modifier.cardChance * cautionFactor

  // Check for yellow card
  if (Math.random() < effectiveCardChance) {
    player.yellowCardsInMatch = (player.yellowCardsInMatch || 0) + 1
    gameDetails.yellowCardsInMatch[player.id] = player.yellowCardsInMatch

    if (player.yellowCardsInMatch >= 2) {
      // Second yellow = red card
      player.sentOff = true
      player.exitMinute = gameDetails.currentMinute ?? player.exitMinute ?? 0
      gameDetails.sentOffPlayerIds.push(player.id)
      gameDetails.log.push({
        redCard: true,
        player: player.id,
        secondYellow: true,
        minute: gameDetails.currentMinute
      })
      console.log(`RED CARD (2nd yellow): ${player.name}`)

      // If player had ball, give to teammate
      if (player.hasBall) {
        player.hasBall = false
        const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
        if (availablePlayers.length > 0) {
          randomItem(availablePlayers).hasBall = true
        }
      }
    } else {
      gameDetails.log.push({
        yellowCard: true,
        player: player.id,
        minute: gameDetails.currentMinute
      })
      console.log(`YELLOW CARD: ${player.name}`)
    }
  }

  // Small chance for direct red card (very aggressive play)
  if (playStyle === 'aggressive' && Math.random() < 0.00002 && !player.sentOff) {
    player.sentOff = true
    player.exitMinute = gameDetails.currentMinute ?? player.exitMinute ?? 0
    gameDetails.sentOffPlayerIds.push(player.id)
    gameDetails.log.push({
      redCard: true,
      player: player.id,
      minute: gameDetails.currentMinute
    })
    console.log(`DIRECT RED CARD: ${player.name}`)

    // If player had ball, give to teammate
    if (player.hasBall) {
      player.hasBall = false
      const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
      if (availablePlayers.length > 0) {
        randomItem(availablePlayers).hasBall = true
      }
    }
  }
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
  const cappedStreak = Math.min(gameDetails.streak, 6)
  const chanceForShoot = Math.min(0.95, _chanceToShoot(activePlayer, gameDetails) * (1 + cappedStreak * 0.15))
  if (Math.random() > chanceForShoot) return true

  // Track shot attempt
  if (teamAHasBall) {
    gameDetails.shotsTeamA = (gameDetails.shotsTeamA || 0) + 1
  } else {
    gameDetails.shotsTeamB = (gameDetails.shotsTeamB || 0) + 1
  }

  if (!goalKeeper) {
    console.log('Team has no goalkeeper set!')
  }

  // Shot-on-target rate: shooter accuracy raises it, keeper pressure (positioning, angles) lowers it.
  // Average ~35% at equal levels — within the Bundesliga band of 33-38%. Clamped to [0.05, 0.60].
  const keeperLevel = goalKeeper?.level ?? 0
  const shotOnTargetChance = Math.max(0.05, Math.min(0.60, 0.35 + (activePlayer.level - keeperLevel) / 400))
  const shotOnTarget = Math.random() < shotOnTargetChance

  if (!shotOnTarget) {
    // Shot misses the target entirely
    return true
  }

  // Shot on target - check if keeper saves (keeper advantage factor 2.0 for realistic conversion rate ~33%)
  const keeperSaves = goalKeeper && Math.random() < (goalKeeper.level * 2.0) / (goalKeeper.level * 2.0 + activePlayer.level)

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
  console.log('GOAL!', gameDetails.goalsTeamA ?? 0, gameDetails.goalsTeamB ?? 0, 'streak: ' + gameDetails.streak, 'player level: ' + activePlayer.level, 'GK level: ' + (goalKeeper?.level ?? 0), 'shoot chance: ' + chanceForShoot)
  gameDetails.log.push({
    goal: true,
    player: activePlayer.id,
    minute: gameDetails.currentMinute,
    teamA: teamAHasBall
  })

  // After a goal, the opposing team gets the kickoff (like in real football)
  activePlayer.hasBall = false
  gameDetails.streak = 0
  const kickoffTeam = teamAHasBall ? playerTeamB : playerTeamA
  const kickoffPlayers = kickoffTeam.filter(p => !p.sentOff && !p.substitutedOut)
  if (kickoffPlayers.length > 0) {
    randomItem(kickoffPlayers).hasBall = true
  }
  return false
}

/**
 * Base chance to attempt a shot per game step
 * Tuned to match Bundesliga stats: ~13 shots/team, ~3.16 goals/game
 * @param {PlayerType} player
 * @returns {number}
 */
function _chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.085
  if (player.position.endsWith('M')) return 0.037
  if (player.position.endsWith('D')) return 0.004
  return 0.00005
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
  const attackMode = team.attack_mode || 'balanced'

  const nextPlayer = _selectPassTarget(activePlayer, teammates, passStyle, attackMode)

  // Check for interception on forward passes
  const activeCoord = POSITION_COORDS[activePlayer.in_game_position]
  const targetCoord = POSITION_COORDS[nextPlayer.in_game_position]
  if (activeCoord && targetCoord && targetCoord.y > activeCoord.y) {
    const modifiers = ATTACK_MODE_MODIFIERS[attackMode] || ATTACK_MODE_MODIFIERS.balanced
    const ballLossChance = modifiers.ballLossBase * (1 - activePlayer.level / 150)
    if (Math.random() < ballLossChance) {
      // Interception: ball goes to a random opponent
      const opponents = teamAHasBall
        ? playerTeamB.filter(p => !p.sentOff && !p.substitutedOut)
        : playerTeamA.filter(p => !p.sentOff && !p.substitutedOut)
      if (opponents.length > 0) {
        activePlayer.hasBall = false
        const interceptor = randomItem(opponents)
        interceptor.hasBall = true
        gameDetails.streak = 0
        gameDetails.log.push({
          pass: true,
          newPlayer: interceptor.id,
          oldPlayer: activePlayer.id
        })
        return
      }
    }
  }

  activePlayer.hasBall = false
  nextPlayer.hasBall = true
  gameDetails.log.push({
    pass: true,
    newPlayer: nextPlayer.id,
    oldPlayer: activePlayer.id
  })
}

/**
 * Select the next player to pass to based on pass style and attack mode
 * @param {GamePlayer} activePlayer
 * @param {GamePlayer[]} teammates
 * @param {string} passStyle - 'short', 'mixed', or 'long'
 * @param {string} attackMode - 'offensive', 'balanced', or 'defensive'
 * @returns {GamePlayer}
 */
function _selectPassTarget (activePlayer, teammates, passStyle, attackMode) {
  if (teammates.length === 0) return activePlayer

  // Apply forward bias based on attack mode
  const modifiers = ATTACK_MODE_MODIFIERS[attackMode] || ATTACK_MODE_MODIFIERS.balanced
  const activeCoord = POSITION_COORDS[activePlayer.in_game_position]

  let filteredTeammates = teammates
  if (activeCoord) {
    const forward = teammates.filter(p => {
      const coord = POSITION_COORDS[p.in_game_position]
      return coord && coord.y > activeCoord.y
    })
    const backward = teammates.filter(p => {
      const coord = POSITION_COORDS[p.in_game_position]
      return !coord || coord.y <= activeCoord.y
    })

    if (forward.length > 0 && backward.length > 0) {
      filteredTeammates = Math.random() < modifiers.forwardBias ? forward : backward
    }
  }

  // Calculate distances to filtered teammates
  const teammatesWithDistance = filteredTeammates.map(player => ({
    player,
    distance: _getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  // Sort by distance
  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  // If only 1 teammate, return them directly
  if (teammatesWithDistance.length === 1) {
    return teammatesWithDistance[0].player
  }

  // Determine the threshold for short vs long (median distance)
  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  // Ensure long pass targets is not empty
  const effectiveLongTargets = longPassTargets.length > 0 ? longPassTargets : shortPassTargets

  if (passStyle === 'short') {
    // Always pick from nearby players
    return randomItem(shortPassTargets).player
  } else if (passStyle === 'long') {
    // Always pick from far players
    return randomItem(effectiveLongTargets).player
  } else {
    // Mixed: 50% chance for short, 50% for long
    if (Math.random() < 0.5) {
      return randomItem(shortPassTargets).player
    } else {
      return randomItem(effectiveLongTargets).player
    }
  }
}

/**
 * Check for injury during a fight and handle substitution if needed
 * @param {GamePlayer} player - The player involved in the fight
 * @param {string} playStyle - Team play style
 * @param {GameDetails} gameDetails
 * @param {GamePlayer[]} team - The player's team array
 * @param {boolean} isTeamA - Whether this is team A
 */
export function checkForInjury (player, playStyle, gameDetails, team, isTeamA) {
  if (player.sentOff || player.injuredInMatch || player.substitutedOut) return

  // Max 1 injury per team per match
  if (isTeamA && gameDetails.injuryTeamA) return
  if (!isTeamA && gameDetails.injuryTeamB) return

  const fitnessMultiplier = 1 + (1 - (player.originalFreshness ?? 1)) * 4
  const styleMultiplier = INJURY_STYLE_MULTIPLIERS[playStyle] || 1.0
  const injuryChance = INJURY_BASE_CHANCE * fitnessMultiplier * styleMultiplier

  if (Math.random() >= injuryChance) return

  // Injury occurs!
  gameDetails.injuries = gameDetails.injuries ?? []
  gameDetails.substitutions = gameDetails.substitutions ?? []

  const injury = selectInjuryType()
  const teamIndex = isTeamA ? 0 : 1

  player.injuredInMatch = true

  gameDetails.injuries.push({
    playerId: player.id,
    playerName: player.name,
    teamIndex,
    injuryType: injury.type,
    injuryDays: injury.days,
    minute: gameDetails.currentMinute
  })

  if (isTeamA) {
    gameDetails.injuryTeamA = true
  } else {
    gameDetails.injuryTeamB = true
  }

  console.log(`INJURY: ${player.name} - ${injury.type} (${injury.days} days)`)

  // Try to substitute
  const bench = isTeamA ? gameDetails.benchTeamA : gameDetails.benchTeamB
  const benchPosition = POSITION_GROUPS[player.position]
  const sub = bench?.[benchPosition]

  if (sub && !sub.substitutedOut) {
    _performSubstitution(player, sub, team, gameDetails, teamIndex, 'injury')
  } else {
    // No substitute available - player is effectively sent off
    player.sentOff = true
    player.exitMinute = gameDetails.currentMinute ?? player.exitMinute ?? 0
    if (player.hasBall) {
      player.hasBall = false
      const available = team.filter(p => !p.sentOff && !p.substitutedOut && p.id !== player.id)
      if (available.length > 0) {
        randomItem(available).hasBall = true
      }
    }
  }
}

/**
 * Check for user-scheduled substitutions based on each bench player's
 * configured substitution mode. Runs from minute 45 onwards; injuries
 * can still trigger substitutions earlier via checkForInjury.
 * Modes:
 *   - 'always': substitute as soon as possible
 *   - 'injury_only': skip — only triggered by checkForInjury
 *   - 'leading': substitute when their team is ahead
 *   - 'trailing': substitute when their team is behind
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 */
export function checkScheduledSubstitutions (playerTeamA, playerTeamB, gameDetails) {
  if ((gameDetails.currentMinute ?? 0) < 45) return

  gameDetails.substitutions = gameDetails.substitutions ?? []
  gameDetails.substitutionCountA = gameDetails.substitutionCountA ?? 0
  gameDetails.substitutionCountB = gameDetails.substitutionCountB ?? 0

  _checkTeamScheduledSubs(playerTeamA, gameDetails, true)
  _checkTeamScheduledSubs(playerTeamB, gameDetails, false)
}

/**
 * @param {GamePlayer[]} team
 * @param {GameDetails} gameDetails
 * @param {boolean} isTeamA
 */
function _checkTeamScheduledSubs (team, gameDetails, isTeamA) {
  const countKey = isTeamA ? 'substitutionCountA' : 'substitutionCountB'
  if (gameDetails[countKey] >= 3) return

  const bench = isTeamA ? gameDetails.benchTeamA : gameDetails.benchTeamB
  if (!bench) return

  const goalsFor = isTeamA ? (gameDetails.goalsTeamA ?? 0) : (gameDetails.goalsTeamB ?? 0)
  const goalsAgainst = isTeamA ? (gameDetails.goalsTeamB ?? 0) : (gameDetails.goalsTeamA ?? 0)
  const isLeading = goalsFor > goalsAgainst
  const isTrailing = goalsFor < goalsAgainst
  const teamIndex = isTeamA ? 0 : 1

  for (const benchPosition of ['BENCH_GK', 'BENCH_DEF', 'BENCH_MID', 'BENCH_ATT']) {
    if (gameDetails[countKey] >= 3) break
    const sub = bench[benchPosition]
    if (!sub || sub.substitutedOut) continue

    const mode = sub.bench_substitution_mode || 'injury_only'
    if (mode === 'injury_only') continue
    if (mode === 'leading' && !isLeading) continue
    if (mode === 'trailing' && !isTrailing) continue
    if (mode !== 'always' && mode !== 'leading' && mode !== 'trailing') continue

    const target = _findSubstitutionTarget(team, benchPosition)
    if (!target) continue

    _performSubstitution(target, sub, team, gameDetails, teamIndex, mode)
    gameDetails[countKey]++
  }
}

/**
 * Pick the best lineup player for a given bench slot. Prefers a player
 * whose natural position group matches the bench slot, then the one with
 * the lowest freshness (most tired).
 * @param {GamePlayer[]} team
 * @param {string} benchPosition
 * @returns {GamePlayer | null}
 */
function _findSubstitutionTarget (team, benchPosition) {
  const eligible = team.filter(p =>
    !p.sentOff && !p.injuredInMatch && !p.substitutedOut &&
    p.in_game_position && POSITION_GROUPS[p.in_game_position] === benchPosition
  )
  if (eligible.length === 0) return null
  eligible.sort((a, b) => {
    const fa = a.originalFreshness ?? a.freshness ?? 1
    const fb = b.originalFreshness ?? b.freshness ?? 1
    return fa - fb
  })
  return eligible[0]
}

/**
 * Perform a substitution: replace playerOut with playerIn
 * @param {GamePlayer} playerOut
 * @param {GamePlayer} playerIn
 * @param {GamePlayer[]} team
 * @param {GameDetails} gameDetails
 * @param {number} teamIndex
 * @param {string} reason
 */
function _performSubstitution (playerOut, playerIn, team, gameDetails, teamIndex, reason) {
  // Transfer ball if needed
  if (playerOut.hasBall) {
    playerOut.hasBall = false
    playerIn.hasBall = true
  }

  // Mark old player as out
  playerOut.substitutedOut = true
  playerOut.exitMinute = gameDetails.currentMinute ?? 0

  // Sub takes the position in the game
  playerIn.in_game_position = playerOut.in_game_position
  playerIn.substitutedOut = false
  playerIn.enterMinute = gameDetails.currentMinute ?? 0
  // Substitutes only get the out-of-position penalty when their role group differs from the slot's role group
  if (POSITION_GROUPS[playerIn.position] !== POSITION_GROUPS[playerIn.in_game_position]) {
    playerIn.level *= 0.5
  }

  // Mark bench slot as used
  const benchPosition = POSITION_GROUPS[playerOut.position]
  const bench = teamIndex === 0 ? gameDetails.benchTeamA : gameDetails.benchTeamB
  if (bench && benchPosition) {
    bench[benchPosition] = { ...playerIn, substitutedOut: true } // Mark slot as used
  }

  // Add sub to team array for game simulation
  team.push(playerIn)

  gameDetails.substitutions.push({
    playerInId: playerIn.id,
    playerInName: playerIn.name,
    playerOutId: playerOut.id,
    playerOutName: playerOut.name,
    teamIndex,
    reason,
    minute: gameDetails.currentMinute
  })

  console.log(`SUBSTITUTION (${reason}): ${playerOut.name} -> ${playerIn.name} (minute ${gameDetails.currentMinute})`)
}
