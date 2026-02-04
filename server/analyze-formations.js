/**
 * Formation Analysis Script
 *
 * Simulates many games between teams with different formations to determine:
 * 1. Which formation performs best overall
 * 2. Which formations counter other formations
 * 3. Whether results are statistically significant
 *
 * Run with: node server/analyze-formations.js
 */

import { determineOponentPosition } from '../client/util/formation.js'

// ============================================================================
// Configuration
// ============================================================================

const GAMES_PER_MATCHUP = 1000 // Number of games per formation matchup
const TEAM_TOTAL_LEVEL = 50 // Total level points distributed across 11 players
const PLAYER_FRESHNESS = 1.0 // All players at full freshness for fair comparison

// ============================================================================
// Formation Definitions
// ============================================================================

/**
 * Each formation defines 10 outfield players (goalkeeper is always GK)
 * Positions: GK, LD, CD, RD, LM, DM, CM, RM, OM, LA, CA, RA
 */
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

// ============================================================================
// Team and Player Generation
// ============================================================================

let playerId = 0

/**
 * Creates a team with the specified formation
 * @param {string} formationName
 * @param {string[]} positions
 * @returns {GamePlayer[]}
 */
function createTeam (formationName, positions) {
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

  return players
}

// ============================================================================
// Game Simulation (extracted from play-game-day.js)
// ============================================================================

/**
 * @param {Array} array
 * @returns {*}
 */
function randomItem (array) {
  return array[Math.floor(Math.random() * array.length)]
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
 * @param {PlayerType} player
 * @returns {number}
 */
function chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.13
  if (player.position.endsWith('M')) return 0.045
  if (player.position.endsWith('D')) return 0.0045
  return 0.000045
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

  const chanceForShoot = Math.min(0.95, chanceToShoot(activePlayer) * (gameDetails.streak * 0.5))
  if (Math.random() > chanceForShoot) return true

  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)
  const shotMisses = Math.random() > 0.25

  if (keeperSaves || (goalKeeper && shotMisses)) {
    goalKeeper.hasBall = true
    activePlayer.hasBall = false
    return false
  }

  if (!goalKeeper && shotMisses) {
    return true
  }

  if (teamAHasBall) {
    gameDetails.goalsTeamA++
  } else {
    gameDetails.goalsTeamB++
  }

  return true
}

/**
 * @param {GamePlayer[]} playerTeamA
 * @param {GamePlayer[]} playerTeamB
 * @param {GameDetails} gameDetails
 */
function passBall (playerTeamA, playerTeamB, _gameDetails) {
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
 * @returns {{ goalsA: number, goalsB: number }}
 */
function simulateGame (teamA, teamB) {
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
    streak: 0
  }

  kickoff(teamA, teamB, gameDetails)

  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    playGameStep(teamA, teamB, gameDetails)
  }

  return {
    goalsA: gameDetails.goalsTeamA,
    goalsB: gameDetails.goalsTeamB
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
 * Calculate z-score for proportion test
 * @param {number} p1 - Proportion 1
 * @param {number} p2 - Proportion 2
 * @param {number} n1 - Sample size 1
 * @param {number} n2 - Sample size 2
 * @returns {number}
 */
function zScoreForProportions (p1, p2, n1, n2) {
  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2)
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2))
  if (se === 0) return 0
  return (p1 - p2) / se
}

/**
 * Check if result is statistically significant (p < 0.05)
 * Using z-test for proportions
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
  console.log('='.repeat(80))
  console.log('FORMATION ANALYSIS')
  console.log('='.repeat(80))
  console.log(`Games per matchup: ${GAMES_PER_MATCHUP}`)
  console.log(`Team total level: ${TEAM_TOTAL_LEVEL}`)
  console.log(`Formations tested: ${Object.keys(FORMATIONS).length}`)
  console.log('='.repeat(80))
  console.log()

  const formationNames = Object.keys(FORMATIONS)
  const results = {}
  const overallStats = {}

  // Initialize stats
  for (const formation of formationNames) {
    overallStats[formation] = {
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      games: 0
    }
    results[formation] = {}
  }

  // Run all matchups
  const totalMatchups = formationNames.length * formationNames.length
  let completedMatchups = 0

  for (const formationA of formationNames) {
    for (const formationB of formationNames) {
      const teamA = createTeam(formationA, FORMATIONS[formationA])
      const teamB = createTeam(formationB, FORMATIONS[formationB])

      let winsA = 0
      let winsB = 0
      let draws = 0
      let totalGoalsA = 0
      let totalGoalsB = 0

      for (let i = 0; i < GAMES_PER_MATCHUP; i++) {
        const { goalsA, goalsB } = simulateGame(teamA, teamB)
        totalGoalsA += goalsA
        totalGoalsB += goalsB

        if (goalsA > goalsB) winsA++
        else if (goalsB > goalsA) winsB++
        else draws++
      }

      results[formationA][formationB] = {
        winsA,
        winsB,
        draws,
        avgGoalsA: totalGoalsA / GAMES_PER_MATCHUP,
        avgGoalsB: totalGoalsB / GAMES_PER_MATCHUP
      }

      // Update overall stats
      overallStats[formationA].wins += winsA
      overallStats[formationA].draws += draws
      overallStats[formationA].losses += winsB
      overallStats[formationA].goalsFor += totalGoalsA
      overallStats[formationA].goalsAgainst += totalGoalsB
      overallStats[formationA].games += GAMES_PER_MATCHUP

      overallStats[formationB].wins += winsB
      overallStats[formationB].draws += draws
      overallStats[formationB].losses += winsA
      overallStats[formationB].goalsFor += totalGoalsB
      overallStats[formationB].goalsAgainst += totalGoalsA
      overallStats[formationB].games += GAMES_PER_MATCHUP

      completedMatchups++
      process.stdout.write(`\rProgress: ${completedMatchups}/${totalMatchups} matchups (${Math.round(completedMatchups / totalMatchups * 100)}%)`)
    }
  }

  console.log('\n')

  // ============================================================================
  // Output Results
  // ============================================================================

  // 1. Overall Formation Rankings
  console.log('='.repeat(80))
  console.log('OVERALL FORMATION RANKINGS')
  console.log('='.repeat(80))

  const rankings = formationNames.map(formation => {
    const stats = overallStats[formation]
    const winRate = stats.wins / stats.games
    const points = stats.wins * 3 + stats.draws
    const goalDiff = stats.goalsFor - stats.goalsAgainst
    return {
      formation,
      winRate,
      points,
      goalDiff,
      avgGoalsFor: stats.goalsFor / stats.games,
      avgGoalsAgainst: stats.goalsAgainst / stats.games,
      ...stats
    }
  }).sort((a, b) => b.winRate - a.winRate)

  console.log()
  console.log('Rank | Formation  | Win Rate | Wins    | Draws   | Losses  | GF/Game | GA/Game | Goal Diff')
  console.log('-'.repeat(100))

  rankings.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ` +
      `${r.formation.padEnd(10)} | ` +
      `${(r.winRate * 100).toFixed(1).padStart(6)}% | ` +
      `${String(r.wins).padStart(7)} | ` +
      `${String(r.draws).padStart(7)} | ` +
      `${String(r.losses).padStart(7)} | ` +
      `${r.avgGoalsFor.toFixed(2).padStart(7)} | ` +
      `${r.avgGoalsAgainst.toFixed(2).padStart(7)} | ` +
      `${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}`
    )
  })

  // 2. Statistical Significance Test
  console.log()
  console.log('='.repeat(80))
  console.log('STATISTICAL SIGNIFICANCE (vs baseline 50% win rate)')
  console.log('='.repeat(80))
  console.log()

  const baselineWinRate = 0.5
  rankings.forEach(r => {
    const observedWinRate = r.wins / r.games
    const se = Math.sqrt(baselineWinRate * (1 - baselineWinRate) / r.games)
    const zScore = (observedWinRate - baselineWinRate) / se
    const significant = isSignificant(zScore)

    console.log(
      `${r.formation.padEnd(10)}: ` +
      `Win rate ${(observedWinRate * 100).toFixed(2)}% ` +
      `(z=${zScore.toFixed(2)}) - ` +
      `${significant ? 'SIGNIFICANT' : 'Not significant'} ` +
      `${observedWinRate > baselineWinRate ? '(ABOVE average)' : observedWinRate < baselineWinRate ? '(BELOW average)' : '(AT average)'}`
    )
  })

  // 3. Head-to-Head Matrix
  console.log()
  console.log('='.repeat(80))
  console.log('HEAD-TO-HEAD WIN RATES (row vs column)')
  console.log('='.repeat(80))
  console.log()

  // Header
  process.stdout.write('           |')
  for (const f of formationNames) {
    process.stdout.write(` ${f.padStart(7)} |`)
  }
  console.log()
  console.log('-'.repeat(12 + formationNames.length * 10))

  // Data rows
  for (const formationA of formationNames) {
    process.stdout.write(`${formationA.padEnd(10)} |`)
    for (const formationB of formationNames) {
      const matchup = results[formationA][formationB]
      const winRateA = matchup.winsA / GAMES_PER_MATCHUP * 100
      process.stdout.write(` ${winRateA.toFixed(1).padStart(6)}% |`)
    }
    console.log()
  }

  // 4. Best Counters
  console.log()
  console.log('='.repeat(80))
  console.log('BEST COUNTER FORMATIONS')
  console.log('='.repeat(80))
  console.log()

  for (const formation of formationNames) {
    const counters = formationNames
      .filter(f => f !== formation)
      .map(counter => {
        const matchup = results[counter][formation]
        return {
          counter,
          winRate: matchup.winsA / GAMES_PER_MATCHUP
        }
      })
      .sort((a, b) => b.winRate - a.winRate)

    const best = counters[0]
    const worst = counters[counters.length - 1]

    // Calculate significance
    const zScore = zScoreForProportions(
      best.winRate,
      0.5,
      GAMES_PER_MATCHUP,
      GAMES_PER_MATCHUP
    )

    console.log(
      `Against ${formation.padEnd(10)}: ` +
      `Best counter is ${best.counter.padEnd(10)} (${(best.winRate * 100).toFixed(1)}% win rate) ` +
      `${isSignificant(zScore) ? '[SIGNIFICANT]' : '[not significant]'} | ` +
      `Worst: ${worst.counter} (${(worst.winRate * 100).toFixed(1)}%)`
    )
  }

  // 5. Summary Statistics
  console.log()
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log()

  const winRates = rankings.map(r => r.winRate)
  const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length
  const stdDev = standardDeviation(winRates, avgWinRate)
  const maxSpread = Math.max(...winRates) - Math.min(...winRates)

  console.log(`Total games simulated: ${GAMES_PER_MATCHUP * totalMatchups * 2}`)
  console.log(`Average win rate: ${(avgWinRate * 100).toFixed(2)}%`)
  console.log(`Win rate std deviation: ${(stdDev * 100).toFixed(2)}%`)
  console.log(`Win rate spread (max - min): ${(maxSpread * 100).toFixed(2)}%`)
  console.log()

  if (maxSpread < 0.05) {
    console.log('CONCLUSION: Formation differences appear MINIMAL (<5% spread).')
    console.log('The game mechanics produce fairly balanced results across formations.')
  } else if (maxSpread < 0.10) {
    console.log('CONCLUSION: Formation differences are MODERATE (5-10% spread).')
    console.log('Some formations have slight advantages, but team skill matters more.')
  } else {
    console.log('CONCLUSION: Formation differences are SIGNIFICANT (>10% spread).')
    console.log('Formation choice has a meaningful impact on game outcomes.')
  }

  console.log()
  console.log(`Best formation overall: ${rankings[0].formation} (${(rankings[0].winRate * 100).toFixed(1)}% win rate)`)
  console.log(`Worst formation overall: ${rankings[rankings.length - 1].formation} (${(rankings[rankings.length - 1].winRate * 100).toFixed(1)}% win rate)`)
}

// Run the analysis
runAnalysis().catch(console.error)
