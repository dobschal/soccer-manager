/**
 * Formation, Pass Style & Play Style Analysis Script
 *
 * Simulates many games between teams with different formations, pass styles, and play styles to determine:
 * 1. Which formation + pass style + play style combination performs best overall
 * 2. Which combinations counter other combinations
 * 3. Goal chances and goals per game compared to real Bundesliga statistics
 * 4. Card statistics (yellow/red) compared to Bundesliga
 *
 * Run with: node server/analyze-formations.js
 */

import { determineOponentPosition } from '../client/util/formation.js'

// ============================================================================
// Configuration
// ============================================================================

const GAMES_PER_MATCHUP = 100 // Number of games per matchup (reduced for faster analysis with more combos)
const TEAM_TOTAL_LEVEL = 50 // Total level points distributed across 11 players
const PLAYER_FRESHNESS = 1.0 // All players at full freshness for fair comparison

// ============================================================================
// Bundesliga Reference Statistics (2023/24 Season)
// ============================================================================

const BUNDESLIGA_STATS = {
  goalsPerGameTotal: 3.17, // Total goals per match (both teams)
  goalsPerTeam: 1.585, // Goals per team per match
  shotsPerTeam: 13.2, // Total shots per team per match
  shotsOnTargetPerTeam: 4.5, // Shots on target per team
  conversionRate: 0.12, // Goals / shots (~12%)
  yellowCardsPerGame: 3.5, // Yellow cards per match (both teams)
  yellowCardsPerTeam: 1.75, // Yellow cards per team per match
  redCardsPerGame: 0.15, // Red cards per match (both teams)
  redCardsPerTeam: 0.075 // Red cards per team per match
}

// ============================================================================
// Formation Definitions
// ============================================================================

const FORMATIONS = {
  '4-4-2': ['LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA', 'CA'],
  '4-3-3': ['LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LA', 'CA', 'RA'],
  '4-5-1': ['LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'CM', 'OM', 'RM', 'CA'],
  '4-2-3-1': ['LD', 'CD', 'CD', 'RD', 'DM', 'DM', 'LM', 'OM', 'RM', 'CA'],
  '3-5-2': ['CD', 'CD', 'CD', 'LM', 'DM', 'CM', 'OM', 'RM', 'CA', 'CA'],
  '3-4-3': ['CD', 'CD', 'CD', 'LM', 'CM', 'CM', 'RM', 'LA', 'CA', 'RA'],
  '5-3-2': ['LD', 'CD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'CA', 'CA'],
  '5-4-1': ['LD', 'CD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA'],
  '4-1-4-1': ['LD', 'CD', 'CD', 'RD', 'DM', 'LM', 'CM', 'CM', 'RM', 'CA'],
  '4-4-1-1': ['LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'OM', 'CA']
}

const PASS_STYLES = ['short', 'mixed', 'long']
const PLAY_STYLES = ['aggressive', 'normal', 'friendly']

// Play style modifiers (from play-game-day.js)
const PLAY_STYLE_MODIFIERS = {
  aggressive: { fightBonus: 0.15, cardChance: 0.002 },
  normal: { fightBonus: 0, cardChance: 0.0008 },
  friendly: { fightBonus: -0.15, cardChance: 0.0003 }
}

// ============================================================================
// Position Coordinates (from play-game-day.js)
// ============================================================================

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

// ============================================================================
// Team and Player Generation
// ============================================================================

let playerId = 0

/**
 * Creates a team with the specified formation, pass style, and play style
 * @param {string} formationName
 * @param {string[]} positions
 * @param {string} passStyle
 * @param {string} playStyle
 * @returns {{ players: GamePlayer[], team: { pass_style: string, play_style: string } }}
 */
function createTeam (formationName, positions, passStyle, playStyle) {
  const players = []
  const allPositions = ['GK', ...positions]

  // Distribute levels evenly across all players
  const baseLevel = TEAM_TOTAL_LEVEL / 11

  for (const position of allPositions) {
    players.push({
      id: ++playerId,
      name: `Player_${playerId}`,
      position,
      in_game_position: position,
      level: baseLevel,
      freshness: PLAYER_FRESHNESS,
      hasBall: false,
      yellowCardsInMatch: 0,
      sentOff: false
    })
  }

  return {
    players,
    team: { pass_style: passStyle, play_style: playStyle }
  }
}

// ============================================================================
// Game Simulation (extracted and enhanced from play-game-day.js)
// ============================================================================

/**
 * @param {Array} array
 * @returns {*}
 */
function randomItem (array) {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Calculate the distance between two positions
 * @param {string} pos1
 * @param {string} pos2
 * @returns {number}
 */
function getPositionDistance (pos1, pos2) {
  const coord1 = POSITION_COORDS[pos1]
  const coord2 = POSITION_COORDS[pos2]
  if (!coord1 || !coord2) return 1
  return Math.sqrt(Math.pow(coord2.x - coord1.x, 2) + Math.pow(coord2.y - coord1.y, 2))
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 */
function kickoff (playerTeamA, playerTeamB, _gameDetails) {
  const availableA = playerTeamA.filter(p => !p.sentOff)
  const availableB = playerTeamB.filter(p => !p.sentOff)
  const player = randomItem(availableA.concat(availableB))
  player.hasBall = true
}

/**
 * @param {PlayerType} player
 * @returns {number}
 */
function chanceToFight (player) {
  if (player.position.endsWith('A')) return 0.75
  if (player.position.endsWith('M')) return 0.5
  if (player.position.endsWith('D')) return 0.1
  return 0.01
}

/**
 * Base chance to attempt a shot per game step (scaled to match Bundesliga ~13 shots/team/game)
 * @param {PlayerType} player
 * @returns {number}
 */
function chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.11
  if (player.position.endsWith('M')) return 0.045
  if (player.position.endsWith('D')) return 0.005
  return 0.00006
}

/**
 * Check if a player receives a card during a fight
 * @param {GamePlayer} player
 * @param {string} playStyle
 * @param {GameDetails} gameDetails
 * @param {GamePlayer[]} team
 * @param {boolean} isTeamA
 */
function checkForCard (player, playStyle, gameDetails, team, isTeamA) {
  if (player.sentOff) return

  const modifier = PLAY_STYLE_MODIFIERS[playStyle] || PLAY_STYLE_MODIFIERS.normal

  // Check for yellow card
  if (Math.random() < modifier.cardChance) {
    player.yellowCardsInMatch = (player.yellowCardsInMatch || 0) + 1

    if (isTeamA) {
      gameDetails.yellowCardsTeamA++
    } else {
      gameDetails.yellowCardsTeamB++
    }

    if (player.yellowCardsInMatch >= 2) {
      // Second yellow = red card
      player.sentOff = true
      if (isTeamA) {
        gameDetails.redCardsTeamA++
      } else {
        gameDetails.redCardsTeamB++
      }

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

  // Small chance for direct red card (very aggressive play)
  if (playStyle === 'aggressive' && Math.random() < 0.0005 && !player.sentOff) {
    player.sentOff = true
    if (isTeamA) {
      gameDetails.redCardsTeamA++
    } else {
      gameDetails.redCardsTeamB++
    }

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
 * @returns {boolean}
 */
function fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff)
    teamAHasBall = false
  }

  // If player was sent off, pass ball to teammate
  if (!activePlayer) {
    const teamWithBall = teamAHasBall ? playerTeamA : playerTeamB
    const availablePlayers = teamWithBall.filter(p => !p.sentOff)
    if (availablePlayers.length > 0) {
      activePlayer = randomItem(availablePlayers)
      activePlayer.hasBall = true
    } else {
      return true // No players available
    }
  }

  if (Math.random() > chanceToFight(activePlayer)) {
    return true
  }

  const opponentPosition = determineOponentPosition(activePlayer.position)
  const defendingTeam = teamAHasBall ? playerTeamB : playerTeamA
  const opponentPlayers = defendingTeam.filter(p => p.position === opponentPosition && !p.sentOff)

  if (opponentPlayers.length === 0) {
    return true
  }

  // Get play styles
  const defendingPlayStyle = teamAHasBall ? gameDetails.playStyleB : gameDetails.playStyleA
  const attackingPlayStyle = teamAHasBall ? gameDetails.playStyleA : gameDetails.playStyleB

  for (const opponentPlayer of opponentPlayers) {
    // Apply play style modifiers to fight chance
    const defendingModifier = PLAY_STYLE_MODIFIERS[defendingPlayStyle] || PLAY_STYLE_MODIFIERS.normal
    const attackingModifier = PLAY_STYLE_MODIFIERS[attackingPlayStyle] || PLAY_STYLE_MODIFIERS.normal

    // Defender's bonus helps them win the ball
    const effectiveDefenderLevel = opponentPlayer.level * (1 + defendingModifier.fightBonus)
    // Attacker's bonus helps them keep the ball
    const effectiveAttackerLevel = activePlayer.level * (1 + attackingModifier.fightBonus)

    const chanceToKeepBall = effectiveAttackerLevel / (effectiveDefenderLevel + effectiveAttackerLevel)
    const loseBall = Math.random() > chanceToKeepBall

    // Check for cards during the fight
    checkForCard(opponentPlayer, defendingPlayStyle, gameDetails, defendingTeam, !teamAHasBall)
    checkForCard(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB, teamAHasBall)

    if (!loseBall) {
      gameDetails.streak++
    } else {
      gameDetails.streak = 0
      // If the opponent was sent off during this fight, ball goes to random teammate
      if (opponentPlayer.sentOff) {
        const availableDefenders = defendingTeam.filter(p => !p.sentOff)
        if (availableDefenders.length > 0) {
          const newPlayer = randomItem(availableDefenders)
          newPlayer.hasBall = true
        }
      } else {
        opponentPlayer.hasBall = true
      }
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
 * @returns {boolean}
 */
function shootBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  let goalKeeper = playerTeamB.find(p => p.position === 'GK' && !p.sentOff)
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff)
    goalKeeper = playerTeamA.find(p => p.position === 'GK' && !p.sentOff)
    teamAHasBall = false
  }

  if (!activePlayer) return true

  // Base chance + streak bonus (allows shots even at streak 0)
  const chanceForShoot = Math.min(0.95, chanceToShoot(activePlayer) * (1 + gameDetails.streak * 0.3))
  if (Math.random() > chanceForShoot) return true

  // Track shot attempt (goal chance)
  if (teamAHasBall) {
    gameDetails.shotsTeamA++
  } else {
    gameDetails.shotsTeamB++
  }

  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)
  const shotMisses = Math.random() > 0.25

  if (keeperSaves || (goalKeeper && shotMisses)) {
    // Track shot on target (keeper save)
    if (keeperSaves) {
      if (teamAHasBall) {
        gameDetails.shotsOnTargetTeamA++
      } else {
        gameDetails.shotsOnTargetTeamB++
      }
    }
    if (goalKeeper) {
      goalKeeper.hasBall = true
    }
    activePlayer.hasBall = false
    return false
  }

  if (!goalKeeper && shotMisses) {
    return true
  }

  // Goal scored - also counts as shot on target
  if (teamAHasBall) {
    gameDetails.shotsOnTargetTeamA++
    gameDetails.goalsTeamA++
  } else {
    gameDetails.shotsOnTargetTeamB++
    gameDetails.goalsTeamB++
  }

  return true
}

/**
 * Select the next player to pass to based on pass style
 * @param {GamePlayer} activePlayer
 * @param {GamePlayer[]} teammates
 * @param {string} passStyle
 * @returns {GamePlayer}
 */
function selectPassTarget (activePlayer, teammates, passStyle) {
  if (teammates.length === 0) return activePlayer

  // Calculate distances to all teammates
  const teammatesWithDistance = teammates.map(player => ({
    player,
    distance: getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  // Sort by distance
  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  // Determine the threshold for short vs long (median distance)
  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  if (passStyle === 'short') {
    return randomItem(shortPassTargets).player
  } else if (passStyle === 'long') {
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

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 */
function passBall (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall && !p.sentOff)
    teamAHasBall = false
  }

  if (!activePlayer) return

  const teammates = teamAHasBall
    ? playerTeamA.filter(p => p.id !== activePlayer.id && !p.sentOff)
    : playerTeamB.filter(p => p.id !== activePlayer.id && !p.sentOff)

  if (teammates.length === 0) return

  const passStyle = teamAHasBall ? gameDetails.passStyleA : gameDetails.passStyleB
  const nextPlayer = selectPassTarget(activePlayer, teammates, passStyle)

  activePlayer.hasBall = false
  nextPlayer.hasBall = true
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 */
function playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!fightsOpponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!shootBall(playerTeamA, playerTeamB, gameDetails)) return
  passBall(playerTeamA, playerTeamB, gameDetails)
}

/**
 * Simulates a game between two teams
 * @param {GamePlayer[]} teamA
 * @param {GamePlayer[]} teamB
 * @param {string} passStyleA
 * @param {string} passStyleB
 * @param {string} playStyleA
 * @param {string} playStyleB
 * @returns {Object}
 */
function simulateGame (teamA, teamB, passStyleA, passStyleB, playStyleA, playStyleB) {
  // Reset player state
  for (const player of teamA) {
    player.hasBall = false
    player.level = player.freshness * (TEAM_TOTAL_LEVEL / 11)
    player.yellowCardsInMatch = 0
    player.sentOff = false
  }
  for (const player of teamB) {
    player.hasBall = false
    player.level = player.freshness * (TEAM_TOTAL_LEVEL / 11)
    player.yellowCardsInMatch = 0
    player.sentOff = false
  }

  const gameDetails = {
    goalsTeamA: 0,
    goalsTeamB: 0,
    shotsTeamA: 0,
    shotsTeamB: 0,
    shotsOnTargetTeamA: 0,
    shotsOnTargetTeamB: 0,
    yellowCardsTeamA: 0,
    yellowCardsTeamB: 0,
    redCardsTeamA: 0,
    redCardsTeamB: 0,
    streak: 0,
    passStyleA,
    passStyleB,
    playStyleA,
    playStyleB
  }

  kickoff(teamA, teamB, gameDetails)

  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    playGameStep(teamA, teamB, gameDetails)
  }

  return {
    goalsA: gameDetails.goalsTeamA,
    goalsB: gameDetails.goalsTeamB,
    shotsA: gameDetails.shotsTeamA,
    shotsB: gameDetails.shotsTeamB,
    shotsOnTargetA: gameDetails.shotsOnTargetTeamA,
    shotsOnTargetB: gameDetails.shotsOnTargetTeamB,
    yellowCardsA: gameDetails.yellowCardsTeamA,
    yellowCardsB: gameDetails.yellowCardsTeamB,
    redCardsA: gameDetails.redCardsTeamA,
    redCardsB: gameDetails.redCardsTeamB
  }
}

// ============================================================================
// Statistics Functions
// ============================================================================

/**
 * Calculate standard deviation
 * @param {number[]} values
 * @param {number} mean
 * @returns {number}
 */
function standardDeviation (values, mean) {
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(avgSquaredDiff)
}

/**
 * Check if result is statistically significant (p < 0.05)
 * @param {number} zScore
 * @returns {boolean}
 */
function isSignificant (zScore) {
  return Math.abs(zScore) > 1.96 // 95% confidence
}

// ============================================================================
// Main Simulation
// ============================================================================

async function runAnalysis () {
  console.log('='.repeat(100))
  console.log('FORMATION, PASS STYLE & PLAY STYLE ANALYSIS')
  console.log('='.repeat(100))
  console.log(`Games per matchup: ${GAMES_PER_MATCHUP}`)
  console.log(`Team total level: ${TEAM_TOTAL_LEVEL}`)
  console.log(`Formations tested: ${Object.keys(FORMATIONS).length}`)
  console.log(`Pass styles tested: ${PASS_STYLES.length}`)
  console.log(`Play styles tested: ${PLAY_STYLES.length}`)
  console.log(`Total combinations: ${Object.keys(FORMATIONS).length * PASS_STYLES.length * PLAY_STYLES.length}`)
  console.log('='.repeat(100))
  console.log()

  const formationNames = Object.keys(FORMATIONS)
  const combinations = []

  // Create all formation + pass style + play style combinations
  for (const formation of formationNames) {
    for (const passStyle of PASS_STYLES) {
      for (const playStyle of PLAY_STYLES) {
        combinations.push({
          formation,
          passStyle,
          playStyle,
          key: `${formation} (${passStyle}/${playStyle})`
        })
      }
    }
  }

  const results = {}
  const overallStats = {}

  // Initialize stats
  for (const combo of combinations) {
    overallStats[combo.key] = {
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      shots: 0,
      shotsOnTarget: 0,
      yellowCards: 0,
      redCards: 0,
      games: 0
    }
    results[combo.key] = {}
  }

  // Global game statistics
  let totalGames = 0
  let totalGoals = 0
  let totalShots = 0
  let totalShotsOnTarget = 0
  let totalYellowCards = 0
  let totalRedCards = 0

  // Run all matchups
  const totalMatchups = combinations.length * combinations.length
  let completedMatchups = 0

  for (const comboA of combinations) {
    for (const comboB of combinations) {
      const { players: teamA } = createTeam(comboA.formation, FORMATIONS[comboA.formation], comboA.passStyle, comboA.playStyle)
      const { players: teamB } = createTeam(comboB.formation, FORMATIONS[comboB.formation], comboB.passStyle, comboB.playStyle)

      let winsA = 0
      let winsB = 0
      let draws = 0
      let totalGoalsA = 0
      let totalGoalsB = 0
      let totalShotsA = 0
      let totalShotsB = 0
      let totalShotsOnTargetA = 0
      let totalShotsOnTargetB = 0
      let totalYellowCardsA = 0
      let totalYellowCardsB = 0
      let totalRedCardsA = 0
      let totalRedCardsB = 0

      for (let i = 0; i < GAMES_PER_MATCHUP; i++) {
        const result = simulateGame(teamA, teamB, comboA.passStyle, comboB.passStyle, comboA.playStyle, comboB.playStyle)
        totalGoalsA += result.goalsA
        totalGoalsB += result.goalsB
        totalShotsA += result.shotsA
        totalShotsB += result.shotsB
        totalShotsOnTargetA += result.shotsOnTargetA
        totalShotsOnTargetB += result.shotsOnTargetB
        totalYellowCardsA += result.yellowCardsA
        totalYellowCardsB += result.yellowCardsB
        totalRedCardsA += result.redCardsA
        totalRedCardsB += result.redCardsB

        if (result.goalsA > result.goalsB) winsA++
        else if (result.goalsB > result.goalsA) winsB++
        else draws++

        // Update global stats
        totalGames++
        totalGoals += result.goalsA + result.goalsB
        totalShots += result.shotsA + result.shotsB
        totalShotsOnTarget += result.shotsOnTargetA + result.shotsOnTargetB
        totalYellowCards += result.yellowCardsA + result.yellowCardsB
        totalRedCards += result.redCardsA + result.redCardsB
      }

      results[comboA.key][comboB.key] = {
        winsA,
        winsB,
        draws,
        avgGoalsA: totalGoalsA / GAMES_PER_MATCHUP,
        avgGoalsB: totalGoalsB / GAMES_PER_MATCHUP,
        avgShotsA: totalShotsA / GAMES_PER_MATCHUP,
        avgShotsB: totalShotsB / GAMES_PER_MATCHUP
      }

      // Update overall stats for combo A
      overallStats[comboA.key].wins += winsA
      overallStats[comboA.key].draws += draws
      overallStats[comboA.key].losses += winsB
      overallStats[comboA.key].goalsFor += totalGoalsA
      overallStats[comboA.key].goalsAgainst += totalGoalsB
      overallStats[comboA.key].shots += totalShotsA
      overallStats[comboA.key].shotsOnTarget += totalShotsOnTargetA
      overallStats[comboA.key].yellowCards += totalYellowCardsA
      overallStats[comboA.key].redCards += totalRedCardsA
      overallStats[comboA.key].games += GAMES_PER_MATCHUP

      // Update overall stats for combo B
      overallStats[comboB.key].wins += winsB
      overallStats[comboB.key].draws += draws
      overallStats[comboB.key].losses += winsA
      overallStats[comboB.key].goalsFor += totalGoalsB
      overallStats[comboB.key].goalsAgainst += totalGoalsA
      overallStats[comboB.key].shots += totalShotsB
      overallStats[comboB.key].shotsOnTarget += totalShotsOnTargetB
      overallStats[comboB.key].yellowCards += totalYellowCardsB
      overallStats[comboB.key].redCards += totalRedCardsB
      overallStats[comboB.key].games += GAMES_PER_MATCHUP

      completedMatchups++
      process.stdout.write(`\rProgress: ${completedMatchups}/${totalMatchups} matchups (${Math.round(completedMatchups / totalMatchups * 100)}%)`)
    }
  }

  console.log('\n')

  // ============================================================================
  // Bundesliga Comparison
  // ============================================================================

  console.log('='.repeat(100))
  console.log('COMPARISON WITH BUNDESLIGA STATISTICS')
  console.log('='.repeat(100))
  console.log()

  const simGoalsPerGame = totalGoals / totalGames
  const simGoalsPerTeam = simGoalsPerGame / 2
  const simShotsPerTeam = (totalShots / totalGames) / 2
  const simShotsOnTargetPerTeam = (totalShotsOnTarget / totalGames) / 2
  const simConversionRate = simGoalsPerTeam / simShotsPerTeam
  const simYellowCardsPerGame = totalYellowCards / totalGames
  const simYellowCardsPerTeam = simYellowCardsPerGame / 2
  const simRedCardsPerGame = totalRedCards / totalGames
  const simRedCardsPerTeam = simRedCardsPerGame / 2

  console.log('Statistic                  | Simulation | Bundesliga | Difference | Match?')
  console.log('-'.repeat(80))
  console.log(`Goals per game (total)     | ${simGoalsPerGame.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.goalsPerGameTotal.toFixed(2).padStart(10)} | ${(simGoalsPerGame - BUNDESLIGA_STATS.goalsPerGameTotal).toFixed(2).padStart(10)} | ${Math.abs(simGoalsPerGame - BUNDESLIGA_STATS.goalsPerGameTotal) < 0.5 ? '✓' : '✗'}`)
  console.log(`Goals per team             | ${simGoalsPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.goalsPerTeam.toFixed(2).padStart(10)} | ${(simGoalsPerTeam - BUNDESLIGA_STATS.goalsPerTeam).toFixed(2).padStart(10)} | ${Math.abs(simGoalsPerTeam - BUNDESLIGA_STATS.goalsPerTeam) < 0.3 ? '✓' : '✗'}`)
  console.log(`Shots per team             | ${simShotsPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.shotsPerTeam.toFixed(2).padStart(10)} | ${(simShotsPerTeam - BUNDESLIGA_STATS.shotsPerTeam).toFixed(2).padStart(10)} | ${Math.abs(simShotsPerTeam - BUNDESLIGA_STATS.shotsPerTeam) < 3 ? '✓' : '✗'}`)
  console.log(`Shots on target per team   | ${simShotsOnTargetPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.shotsOnTargetPerTeam.toFixed(2).padStart(10)} | ${(simShotsOnTargetPerTeam - BUNDESLIGA_STATS.shotsOnTargetPerTeam).toFixed(2).padStart(10)} | ${Math.abs(simShotsOnTargetPerTeam - BUNDESLIGA_STATS.shotsOnTargetPerTeam) < 1 ? '✓' : '✗'}`)
  console.log(`Conversion rate            | ${(simConversionRate * 100).toFixed(1).padStart(9)}% | ${(BUNDESLIGA_STATS.conversionRate * 100).toFixed(1).padStart(9)}% | ${((simConversionRate - BUNDESLIGA_STATS.conversionRate) * 100).toFixed(1).padStart(9)}% | ${Math.abs(simConversionRate - BUNDESLIGA_STATS.conversionRate) < 0.03 ? '✓' : '✗'}`)
  console.log(`Yellow cards per game      | ${simYellowCardsPerGame.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.yellowCardsPerGame.toFixed(2).padStart(10)} | ${(simYellowCardsPerGame - BUNDESLIGA_STATS.yellowCardsPerGame).toFixed(2).padStart(10)} | ${Math.abs(simYellowCardsPerGame - BUNDESLIGA_STATS.yellowCardsPerGame) < 1 ? '✓' : '✗'}`)
  console.log(`Yellow cards per team      | ${simYellowCardsPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.yellowCardsPerTeam.toFixed(2).padStart(10)} | ${(simYellowCardsPerTeam - BUNDESLIGA_STATS.yellowCardsPerTeam).toFixed(2).padStart(10)} | ${Math.abs(simYellowCardsPerTeam - BUNDESLIGA_STATS.yellowCardsPerTeam) < 0.5 ? '✓' : '✗'}`)
  console.log(`Red cards per game         | ${simRedCardsPerGame.toFixed(3).padStart(10)} | ${BUNDESLIGA_STATS.redCardsPerGame.toFixed(3).padStart(10)} | ${(simRedCardsPerGame - BUNDESLIGA_STATS.redCardsPerGame).toFixed(3).padStart(10)} | ${Math.abs(simRedCardsPerGame - BUNDESLIGA_STATS.redCardsPerGame) < 0.1 ? '✓' : '✗'}`)
  console.log()

  // ============================================================================
  // Overall Rankings
  // ============================================================================

  console.log('='.repeat(100))
  console.log('TOP 20 COMBINATIONS (by win rate)')
  console.log('='.repeat(100))
  console.log()

  const rankings = combinations.map(combo => {
    const stats = overallStats[combo.key]
    const winRate = stats.wins / stats.games
    const goalDiff = stats.goalsFor - stats.goalsAgainst
    return {
      key: combo.key,
      formation: combo.formation,
      passStyle: combo.passStyle,
      playStyle: combo.playStyle,
      winRate,
      goalDiff,
      avgGoalsFor: stats.goalsFor / stats.games,
      avgGoalsAgainst: stats.goalsAgainst / stats.games,
      avgShots: stats.shots / stats.games,
      avgShotsOnTarget: stats.shotsOnTarget / stats.games,
      avgYellowCards: stats.yellowCards / stats.games,
      avgRedCards: stats.redCards / stats.games,
      ...stats
    }
  }).sort((a, b) => b.winRate - a.winRate)

  console.log('Rank | Combination                     | Win Rate | GF/Gm | GA/Gm | YC/Gm | RC/Gm')
  console.log('-'.repeat(95))

  rankings.slice(0, 20).forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ` +
      `${r.key.padEnd(31)} | ` +
      `${(r.winRate * 100).toFixed(1).padStart(6)}% | ` +
      `${r.avgGoalsFor.toFixed(2).padStart(5)} | ` +
      `${r.avgGoalsAgainst.toFixed(2).padStart(5)} | ` +
      `${r.avgYellowCards.toFixed(2).padStart(5)} | ` +
      `${r.avgRedCards.toFixed(3).padStart(5)}`
    )
  })

  console.log()
  console.log('BOTTOM 10 COMBINATIONS')
  console.log('-'.repeat(95))

  rankings.slice(-10).forEach((r, i) => {
    console.log(
      `${String(rankings.length - 9 + i).padStart(4)} | ` +
      `${r.key.padEnd(31)} | ` +
      `${(r.winRate * 100).toFixed(1).padStart(6)}% | ` +
      `${r.avgGoalsFor.toFixed(2).padStart(5)} | ` +
      `${r.avgGoalsAgainst.toFixed(2).padStart(5)} | ` +
      `${r.avgYellowCards.toFixed(2).padStart(5)} | ` +
      `${r.avgRedCards.toFixed(3).padStart(5)}`
    )
  })

  // ============================================================================
  // Play Style Analysis
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('PLAY STYLE ANALYSIS (aggregated across all formations and pass styles)')
  console.log('='.repeat(100))
  console.log()

  const playStyleStats = {}
  for (const style of PLAY_STYLES) {
    playStyleStats[style] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0 }
  }

  for (const combo of combinations) {
    const stats = overallStats[combo.key]
    playStyleStats[combo.playStyle].wins += stats.wins
    playStyleStats[combo.playStyle].draws += stats.draws
    playStyleStats[combo.playStyle].losses += stats.losses
    playStyleStats[combo.playStyle].goals += stats.goalsFor
    playStyleStats[combo.playStyle].games += stats.games
    playStyleStats[combo.playStyle].shots += stats.shots
    playStyleStats[combo.playStyle].shotsOnTarget += stats.shotsOnTarget
    playStyleStats[combo.playStyle].yellowCards += stats.yellowCards
    playStyleStats[combo.playStyle].redCards += stats.redCards
  }

  console.log('Play Style  | Win Rate | Avg Goals | Avg Shots | YC/Game | RC/Game | Analysis')
  console.log('-'.repeat(100))
  for (const style of PLAY_STYLES) {
    const s = playStyleStats[style]
    const winRate = s.wins / s.games
    const avgGoals = s.goals / s.games
    const avgShots = s.shots / s.games
    const avgYC = s.yellowCards / s.games
    const avgRC = s.redCards / s.games
    let analysis = ''
    if (style === 'aggressive') analysis = 'More cards, slight fight advantage'
    if (style === 'normal') analysis = 'Balanced approach'
    if (style === 'friendly') analysis = 'Fewer cards, slight fight disadvantage'
    console.log(
      `${style.padEnd(11)} | ` +
      `${(winRate * 100).toFixed(2).padStart(6)}% | ` +
      `${avgGoals.toFixed(2).padStart(9)} | ` +
      `${avgShots.toFixed(1).padStart(9)} | ` +
      `${avgYC.toFixed(2).padStart(7)} | ` +
      `${avgRC.toFixed(3).padStart(7)} | ` +
      `${analysis}`
    )
  }

  // ============================================================================
  // Pass Style Analysis
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('PASS STYLE ANALYSIS (aggregated across all formations and play styles)')
  console.log('='.repeat(100))
  console.log()

  const passStyleStats = {}
  for (const style of PASS_STYLES) {
    passStyleStats[style] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0, shots: 0, shotsOnTarget: 0 }
  }

  for (const combo of combinations) {
    const stats = overallStats[combo.key]
    passStyleStats[combo.passStyle].wins += stats.wins
    passStyleStats[combo.passStyle].draws += stats.draws
    passStyleStats[combo.passStyle].losses += stats.losses
    passStyleStats[combo.passStyle].goals += stats.goalsFor
    passStyleStats[combo.passStyle].games += stats.games
    passStyleStats[combo.passStyle].shots += stats.shots
    passStyleStats[combo.passStyle].shotsOnTarget += stats.shotsOnTarget
  }

  console.log('Pass Style | Win Rate | Avg Goals | Avg Shots | Conversion')
  console.log('-'.repeat(60))
  for (const style of PASS_STYLES) {
    const s = passStyleStats[style]
    const winRate = s.wins / s.games
    const avgGoals = s.goals / s.games
    const avgShots = s.shots / s.games
    const conversion = avgGoals / avgShots
    console.log(
      `${style.padEnd(10)} | ` +
      `${(winRate * 100).toFixed(2).padStart(6)}% | ` +
      `${avgGoals.toFixed(2).padStart(9)} | ` +
      `${avgShots.toFixed(1).padStart(9)} | ` +
      `${(conversion * 100).toFixed(1).padStart(9)}%`
    )
  }

  // ============================================================================
  // Formation Analysis (aggregated across all pass and play styles)
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('FORMATION ANALYSIS (aggregated across all pass and play styles)')
  console.log('='.repeat(100))
  console.log()

  const formationStats = {}
  for (const formation of formationNames) {
    formationStats[formation] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0, shots: 0 }
  }

  for (const combo of combinations) {
    const stats = overallStats[combo.key]
    formationStats[combo.formation].wins += stats.wins
    formationStats[combo.formation].draws += stats.draws
    formationStats[combo.formation].losses += stats.losses
    formationStats[combo.formation].goals += stats.goalsFor
    formationStats[combo.formation].games += stats.games
    formationStats[combo.formation].shots += stats.shots
  }

  const formationRankings = formationNames.map(f => ({
    formation: f,
    winRate: formationStats[f].wins / formationStats[f].games,
    avgGoals: formationStats[f].goals / formationStats[f].games,
    avgShots: formationStats[f].shots / formationStats[f].games
  })).sort((a, b) => b.winRate - a.winRate)

  console.log('Formation  | Win Rate | Avg Goals | Avg Shots')
  console.log('-'.repeat(50))
  for (const f of formationRankings) {
    console.log(
      `${f.formation.padEnd(10)} | ` +
      `${(f.winRate * 100).toFixed(2).padStart(6)}% | ` +
      `${f.avgGoals.toFixed(2).padStart(9)} | ` +
      `${f.avgShots.toFixed(1).padStart(9)}`
    )
  }

  // ============================================================================
  // Best Counters
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('SIGNIFICANT COUNTER MATCHUPS (>55% win rate)')
  console.log('='.repeat(100))
  console.log()

  const significantCounters = []
  for (const comboA of combinations) {
    for (const comboB of combinations) {
      if (comboA.key === comboB.key) continue
      const matchup = results[comboA.key][comboB.key]
      const winRate = matchup.winsA / GAMES_PER_MATCHUP
      if (winRate > 0.55) {
        // Z-test for significance
        const se = Math.sqrt(0.5 * 0.5 / GAMES_PER_MATCHUP)
        const zScore = (winRate - 0.5) / se
        if (isSignificant(zScore)) {
          significantCounters.push({
            attacker: comboA.key,
            defender: comboB.key,
            winRate,
            zScore
          })
        }
      }
    }
  }

  significantCounters.sort((a, b) => b.winRate - a.winRate)

  if (significantCounters.length === 0) {
    console.log('No statistically significant counter matchups found (>55% win rate).')
    console.log('This suggests the game is well-balanced across formations, pass styles, and play styles.')
  } else {
    console.log(`Found ${significantCounters.length} significant counter matchups:`)
    console.log()
    significantCounters.slice(0, 20).forEach(c => {
      console.log(`${c.attacker.padEnd(31)} beats ${c.defender.padEnd(31)} (${(c.winRate * 100).toFixed(1)}% win rate, z=${c.zScore.toFixed(2)})`)
    })
  }

  // ============================================================================
  // Summary
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('SUMMARY')
  console.log('='.repeat(100))
  console.log()

  const winRates = rankings.map(r => r.winRate)
  const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length
  const stdDev = standardDeviation(winRates, avgWinRate)
  const maxSpread = Math.max(...winRates) - Math.min(...winRates)

  console.log(`Total games simulated: ${totalGames}`)
  console.log(`Total combinations: ${combinations.length}`)
  console.log(`Win rate spread (max - min): ${(maxSpread * 100).toFixed(2)}%`)
  console.log(`Win rate std deviation: ${(stdDev * 100).toFixed(2)}%`)
  console.log()
  console.log(`BEST combination: ${rankings[0].key} (${(rankings[0].winRate * 100).toFixed(1)}% win rate)`)
  console.log(`WORST combination: ${rankings[rankings.length - 1].key} (${(rankings[rankings.length - 1].winRate * 100).toFixed(1)}% win rate)`)
  console.log()

  // Best by category
  const bestFormation = formationRankings[0].formation
  const bestPassStyle = PASS_STYLES.reduce((best, style) =>
    passStyleStats[style].wins / passStyleStats[style].games > passStyleStats[best].wins / passStyleStats[best].games ? style : best
  )
  const bestPlayStyle = PLAY_STYLES.reduce((best, style) =>
    playStyleStats[style].wins / playStyleStats[style].games > playStyleStats[best].wins / playStyleStats[best].games ? style : best
  )

  console.log(`Best formation overall: ${bestFormation} (${(formationStats[bestFormation].wins / formationStats[bestFormation].games * 100).toFixed(2)}%)`)
  console.log(`Best pass style overall: ${bestPassStyle} (${(passStyleStats[bestPassStyle].wins / passStyleStats[bestPassStyle].games * 100).toFixed(2)}%)`)
  console.log(`Best play style overall: ${bestPlayStyle} (${(playStyleStats[bestPlayStyle].wins / playStyleStats[bestPlayStyle].games * 100).toFixed(2)}%)`)
  console.log()

  // Play style analysis
  const aggressiveWinRate = playStyleStats.aggressive.wins / playStyleStats.aggressive.games
  const normalWinRate = playStyleStats.normal.wins / playStyleStats.normal.games
  const friendlyWinRate = playStyleStats.friendly.wins / playStyleStats.friendly.games

  console.log('PLAY STYLE IMPACT:')
  console.log(`  Aggressive vs Normal: ${((aggressiveWinRate - normalWinRate) * 100).toFixed(2)}% difference`)
  console.log(`  Normal vs Friendly: ${((normalWinRate - friendlyWinRate) * 100).toFixed(2)}% difference`)
  console.log(`  Aggressive YC/game: ${(playStyleStats.aggressive.yellowCards / playStyleStats.aggressive.games).toFixed(2)} vs Normal: ${(playStyleStats.normal.yellowCards / playStyleStats.normal.games).toFixed(2)} vs Friendly: ${(playStyleStats.friendly.yellowCards / playStyleStats.friendly.games).toFixed(2)}`)
  console.log()

  if (maxSpread < 0.03) {
    console.log('CONCLUSION: Differences between combinations are MINIMAL (<3% spread).')
    console.log('The game is very well balanced - player skill matters more than tactics.')
  } else if (maxSpread < 0.08) {
    console.log('CONCLUSION: Differences between combinations are MODERATE (3-8% spread).')
    console.log('Some tactical choices have slight advantages.')
  } else {
    console.log('CONCLUSION: Differences between combinations are SIGNIFICANT (>8% spread).')
    console.log('Tactical choices have meaningful impact on outcomes.')
  }
}

// Run the analysis
runAnalysis().catch(console.error)
