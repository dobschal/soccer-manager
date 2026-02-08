/**
 * Formation & Pass Style Analysis Script
 *
 * Simulates many games between teams with different formations and pass styles to determine:
 * 1. Which formation + pass style combination performs best overall
 * 2. Which combinations counter other combinations
 * 3. Goal chances and goals per game compared to real Bundesliga statistics
 *
 * Run with: node server/analyze-formations.js
 */

import { determineOponentPosition } from '../client/util/formation.js'

// ============================================================================
// Configuration
// ============================================================================

const GAMES_PER_MATCHUP = 500 // Number of games per formation matchup
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
  conversionRate: 0.12 // Goals / shots (~12%)
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
 * Creates a team with the specified formation and pass style
 * @param {string} formationName
 * @param {string[]} positions
 * @param {string} passStyle
 * @returns {{ players: GamePlayer[], team: { pass_style: string } }}
 */
function createTeam (formationName, positions, passStyle) {
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
      hasBall: false
    })
  }

  return {
    players,
    team: { pass_style: passStyle }
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
  const player = randomItem(playerTeamA.concat(playerTeamB))
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
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 * @returns {boolean}
 */
function fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall)
  gameDetails.streak = gameDetails.streak ?? 0
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }

  if (Math.random() > chanceToFight(activePlayer)) {
    return true
  }

  const opponentPosition = determineOponentPosition(activePlayer.position)
  const opponentPlayers = (teamAHasBall ? playerTeamB : playerTeamA)
    .filter(p => p.position === opponentPosition)

  if (opponentPlayers.length === 0) {
    return true
  }

  for (const opponentPlayer of opponentPlayers) {
    const chanceToKeepBall = activePlayer.level / (opponentPlayer.level + activePlayer.level)
    const loseBall = Math.random() > chanceToKeepBall

    if (!loseBall) {
      gameDetails.streak++
    } else {
      gameDetails.streak = 0
      opponentPlayer.hasBall = true
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
    goalKeeper.hasBall = true
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
  let activePlayer = playerTeamA.find(p => p.hasBall)
  let teamAHasBall = true

  if (!activePlayer) {
    activePlayer = playerTeamB.find(p => p.hasBall)
    teamAHasBall = false
  }

  const teammates = teamAHasBall
    ? playerTeamA.filter(p => p.id !== activePlayer.id)
    : playerTeamB.filter(p => p.id !== activePlayer.id)

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
 * @returns {{ goalsA: number, goalsB: number, shotsA: number, shotsB: number, shotsOnTargetA: number, shotsOnTargetB: number }}
 */
function simulateGame (teamA, teamB, passStyleA, passStyleB) {
  // Reset player state
  for (const player of teamA) {
    player.hasBall = false
    player.level = player.freshness * (TEAM_TOTAL_LEVEL / 11)
  }
  for (const player of teamB) {
    player.hasBall = false
    player.level = player.freshness * (TEAM_TOTAL_LEVEL / 11)
  }

  const gameDetails = {
    goalsTeamA: 0,
    goalsTeamB: 0,
    shotsTeamA: 0,
    shotsTeamB: 0,
    shotsOnTargetTeamA: 0,
    shotsOnTargetTeamB: 0,
    streak: 0,
    passStyleA,
    passStyleB
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
    shotsOnTargetB: gameDetails.shotsOnTargetTeamB
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
  console.log('FORMATION & PASS STYLE ANALYSIS')
  console.log('='.repeat(100))
  console.log(`Games per matchup: ${GAMES_PER_MATCHUP}`)
  console.log(`Team total level: ${TEAM_TOTAL_LEVEL}`)
  console.log(`Formations tested: ${Object.keys(FORMATIONS).length}`)
  console.log(`Pass styles tested: ${PASS_STYLES.length}`)
  console.log(`Total combinations: ${Object.keys(FORMATIONS).length * PASS_STYLES.length}`)
  console.log('='.repeat(100))
  console.log()

  const formationNames = Object.keys(FORMATIONS)
  const combinations = []

  // Create all formation + pass style combinations
  for (const formation of formationNames) {
    for (const passStyle of PASS_STYLES) {
      combinations.push({ formation, passStyle, key: `${formation} (${passStyle})` })
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
      games: 0
    }
    results[combo.key] = {}
  }

  // Global game statistics
  let totalGames = 0
  let totalGoals = 0
  let totalShots = 0
  let totalShotsOnTarget = 0

  // Run all matchups
  const totalMatchups = combinations.length * combinations.length
  let completedMatchups = 0

  for (const comboA of combinations) {
    for (const comboB of combinations) {
      const { players: teamA } = createTeam(comboA.formation, FORMATIONS[comboA.formation], comboA.passStyle)
      const { players: teamB } = createTeam(comboB.formation, FORMATIONS[comboB.formation], comboB.passStyle)

      let winsA = 0
      let winsB = 0
      let draws = 0
      let totalGoalsA = 0
      let totalGoalsB = 0
      let totalShotsA = 0
      let totalShotsB = 0
      let totalShotsOnTargetA = 0
      let totalShotsOnTargetB = 0

      for (let i = 0; i < GAMES_PER_MATCHUP; i++) {
        const result = simulateGame(teamA, teamB, comboA.passStyle, comboB.passStyle)
        totalGoalsA += result.goalsA
        totalGoalsB += result.goalsB
        totalShotsA += result.shotsA
        totalShotsB += result.shotsB
        totalShotsOnTargetA += result.shotsOnTargetA
        totalShotsOnTargetB += result.shotsOnTargetB

        if (result.goalsA > result.goalsB) winsA++
        else if (result.goalsB > result.goalsA) winsB++
        else draws++

        // Update global stats
        totalGames++
        totalGoals += result.goalsA + result.goalsB
        totalShots += result.shotsA + result.shotsB
        totalShotsOnTarget += result.shotsOnTargetA + result.shotsOnTargetB
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
      overallStats[comboA.key].games += GAMES_PER_MATCHUP

      // Update overall stats for combo B
      overallStats[comboB.key].wins += winsB
      overallStats[comboB.key].draws += draws
      overallStats[comboB.key].losses += winsA
      overallStats[comboB.key].goalsFor += totalGoalsB
      overallStats[comboB.key].goalsAgainst += totalGoalsA
      overallStats[comboB.key].shots += totalShotsB
      overallStats[comboB.key].shotsOnTarget += totalShotsOnTargetB
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

  console.log('Statistic                  | Simulation | Bundesliga | Difference')
  console.log('-'.repeat(70))
  console.log(`Goals per game (total)     | ${simGoalsPerGame.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.goalsPerGameTotal.toFixed(2).padStart(10)} | ${(simGoalsPerGame - BUNDESLIGA_STATS.goalsPerGameTotal).toFixed(2).padStart(10)}`)
  console.log(`Goals per team             | ${simGoalsPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.goalsPerTeam.toFixed(2).padStart(10)} | ${(simGoalsPerTeam - BUNDESLIGA_STATS.goalsPerTeam).toFixed(2).padStart(10)}`)
  console.log(`Shots per team             | ${simShotsPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.shotsPerTeam.toFixed(2).padStart(10)} | ${(simShotsPerTeam - BUNDESLIGA_STATS.shotsPerTeam).toFixed(2).padStart(10)}`)
  console.log(`Shots on target per team   | ${simShotsOnTargetPerTeam.toFixed(2).padStart(10)} | ${BUNDESLIGA_STATS.shotsOnTargetPerTeam.toFixed(2).padStart(10)} | ${(simShotsOnTargetPerTeam - BUNDESLIGA_STATS.shotsOnTargetPerTeam).toFixed(2).padStart(10)}`)
  console.log(`Conversion rate            | ${(simConversionRate * 100).toFixed(1).padStart(9)}% | ${(BUNDESLIGA_STATS.conversionRate * 100).toFixed(1).padStart(9)}% | ${((simConversionRate - BUNDESLIGA_STATS.conversionRate) * 100).toFixed(1).padStart(9)}%`)
  console.log()

  // ============================================================================
  // Overall Rankings
  // ============================================================================

  console.log('='.repeat(100))
  console.log('TOP 15 COMBINATIONS (by win rate)')
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
      winRate,
      goalDiff,
      avgGoalsFor: stats.goalsFor / stats.games,
      avgGoalsAgainst: stats.goalsAgainst / stats.games,
      avgShots: stats.shots / stats.games,
      avgShotsOnTarget: stats.shotsOnTarget / stats.games,
      ...stats
    }
  }).sort((a, b) => b.winRate - a.winRate)

  console.log('Rank | Combination              | Win Rate | GF/Game | GA/Game | Shots | Shots OT')
  console.log('-'.repeat(90))

  rankings.slice(0, 15).forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ` +
      `${r.key.padEnd(24)} | ` +
      `${(r.winRate * 100).toFixed(1).padStart(6)}% | ` +
      `${r.avgGoalsFor.toFixed(2).padStart(7)} | ` +
      `${r.avgGoalsAgainst.toFixed(2).padStart(7)} | ` +
      `${r.avgShots.toFixed(1).padStart(5)} | ` +
      `${r.avgShotsOnTarget.toFixed(1).padStart(8)}`
    )
  })

  console.log()
  console.log('BOTTOM 5 COMBINATIONS')
  console.log('-'.repeat(90))

  rankings.slice(-5).forEach((r, i) => {
    console.log(
      `${String(rankings.length - 4 + i).padStart(4)} | ` +
      `${r.key.padEnd(24)} | ` +
      `${(r.winRate * 100).toFixed(1).padStart(6)}% | ` +
      `${r.avgGoalsFor.toFixed(2).padStart(7)} | ` +
      `${r.avgGoalsAgainst.toFixed(2).padStart(7)} | ` +
      `${r.avgShots.toFixed(1).padStart(5)} | ` +
      `${r.avgShotsOnTarget.toFixed(1).padStart(8)}`
    )
  })

  // ============================================================================
  // Pass Style Analysis
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('PASS STYLE ANALYSIS (aggregated across all formations)')
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
  // Formation Analysis (aggregated across all pass styles)
  // ============================================================================

  console.log()
  console.log('='.repeat(100))
  console.log('FORMATION ANALYSIS (aggregated across all pass styles)')
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
    console.log('This suggests the game is well-balanced across formations and pass styles.')
  } else {
    console.log(`Found ${significantCounters.length} significant counter matchups:`)
    console.log()
    significantCounters.slice(0, 20).forEach(c => {
      console.log(`${c.attacker.padEnd(24)} beats ${c.defender.padEnd(24)} (${(c.winRate * 100).toFixed(1)}% win rate, z=${c.zScore.toFixed(2)})`)
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
  console.log(`Best combination: ${rankings[0].key} (${(rankings[0].winRate * 100).toFixed(1)}% win rate)`)
  console.log(`Worst combination: ${rankings[rankings.length - 1].key} (${(rankings[rankings.length - 1].winRate * 100).toFixed(1)}% win rate)`)
  console.log()

  // Pass style conclusion
  const bestPassStyle = PASS_STYLES.reduce((best, style) =>
    passStyleStats[style].wins / passStyleStats[style].games > passStyleStats[best].wins / passStyleStats[best].games ? style : best
  )
  const worstPassStyle = PASS_STYLES.reduce((worst, style) =>
    passStyleStats[style].wins / passStyleStats[style].games < passStyleStats[worst].wins / passStyleStats[worst].games ? style : worst
  )

  console.log(`Best pass style overall: ${bestPassStyle} (${(passStyleStats[bestPassStyle].wins / passStyleStats[bestPassStyle].games * 100).toFixed(2)}%)`)
  console.log(`Worst pass style overall: ${worstPassStyle} (${(passStyleStats[worstPassStyle].wins / passStyleStats[worstPassStyle].games * 100).toFixed(2)}%)`)
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
