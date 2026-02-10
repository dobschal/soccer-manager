/**
 * Generate comprehensive tactics analysis report
 *
 * Run with: node server/generate-tactics-report.js
 */

import { determineOponentPosition } from '../client/util/formation.js'
import { writeFileSync } from 'fs'

// ============================================================================
// Configuration
// ============================================================================

const GAMES_PER_MATCHUP = 200 // Games per matchup for better statistical significance
const BASE_TEAM_LEVEL = 50 // Total level points distributed across 11 players
const PLAYER_FRESHNESS = 1.0

// ============================================================================
// Formations, Pass Styles, Play Styles
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

const PLAY_STYLE_MODIFIERS = {
  aggressive: { fightBonus: 0.15, cardChance: 0.005 },
  normal: { fightBonus: 0, cardChance: 0.001 },
  friendly: { fightBonus: -0.15, cardChance: 0.0003 }
}

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
// Game Simulation (same as analyze-formations.js)
// ============================================================================

let playerId = 0

function createTeam (positions, teamLevel) {
  const players = []
  const allPositions = ['GK', ...positions]
  const baseLevel = teamLevel / 11

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
  return players
}

function randomItem (array) {
  return array[Math.floor(Math.random() * array.length)]
}

function getPositionDistance (pos1, pos2) {
  const coord1 = POSITION_COORDS[pos1]
  const coord2 = POSITION_COORDS[pos2]
  if (!coord1 || !coord2) return 1
  return Math.sqrt(Math.pow(coord2.x - coord1.x, 2) + Math.pow(coord2.y - coord1.y, 2))
}

function kickoff (playerTeamA, playerTeamB) {
  const availableA = playerTeamA.filter(p => !p.sentOff)
  const availableB = playerTeamB.filter(p => !p.sentOff)
  const player = randomItem(availableA.concat(availableB))
  player.hasBall = true
}

function chanceToFight (player) {
  if (player.position.endsWith('A')) return 0.75
  if (player.position.endsWith('M')) return 0.5
  if (player.position.endsWith('D')) return 0.1
  return 0.01
}

function chanceToShoot (player) {
  if (player.position.endsWith('A')) return 0.11
  if (player.position.endsWith('M')) return 0.045
  if (player.position.endsWith('D')) return 0.005
  return 0.00006
}

function checkForCard (player, playStyle, gameDetails, team, isTeamA) {
  if (player.sentOff) return
  const modifier = PLAY_STYLE_MODIFIERS[playStyle] || PLAY_STYLE_MODIFIERS.normal

  if (Math.random() < modifier.cardChance) {
    player.yellowCardsInMatch = (player.yellowCardsInMatch || 0) + 1
    if (isTeamA) gameDetails.yellowCardsTeamA++
    else gameDetails.yellowCardsTeamB++

    if (player.yellowCardsInMatch >= 2) {
      player.sentOff = true
      if (isTeamA) gameDetails.redCardsTeamA++
      else gameDetails.redCardsTeamB++

      if (player.hasBall) {
        player.hasBall = false
        const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
        if (availablePlayers.length > 0) randomItem(availablePlayers).hasBall = true
      }
    }
  }

  if (playStyle === 'aggressive' && Math.random() < 0.0001 && !player.sentOff) {
    player.sentOff = true
    if (isTeamA) gameDetails.redCardsTeamA++
    else gameDetails.redCardsTeamB++

    if (player.hasBall) {
      player.hasBall = false
      const availablePlayers = team.filter(p => !p.sentOff && p.id !== player.id)
      if (availablePlayers.length > 0) randomItem(availablePlayers).hasBall = true
    }
  }
}

function fightsOpponents (playerTeamA, playerTeamB, gameDetails) {
  let activePlayer = playerTeamA.find(p => p.hasBall && !p.sentOff)
  gameDetails.streak = gameDetails.streak ?? 0
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

  if (Math.random() > chanceToFight(activePlayer)) return true

  const opponentPosition = determineOponentPosition(activePlayer.position)
  const defendingTeam = teamAHasBall ? playerTeamB : playerTeamA
  const opponentPlayers = defendingTeam.filter(p => p.position === opponentPosition && !p.sentOff)

  if (opponentPlayers.length === 0) return true

  const defendingPlayStyle = teamAHasBall ? gameDetails.playStyleB : gameDetails.playStyleA
  const attackingPlayStyle = teamAHasBall ? gameDetails.playStyleA : gameDetails.playStyleB

  for (const opponentPlayer of opponentPlayers) {
    const defendingModifier = PLAY_STYLE_MODIFIERS[defendingPlayStyle] || PLAY_STYLE_MODIFIERS.normal
    const attackingModifier = PLAY_STYLE_MODIFIERS[attackingPlayStyle] || PLAY_STYLE_MODIFIERS.normal

    const effectiveDefenderLevel = opponentPlayer.level * (1 + defendingModifier.fightBonus)
    const effectiveAttackerLevel = activePlayer.level * (1 + attackingModifier.fightBonus)

    const chanceToKeepBall = effectiveAttackerLevel / (effectiveDefenderLevel + effectiveAttackerLevel)
    const loseBall = Math.random() > chanceToKeepBall

    checkForCard(opponentPlayer, defendingPlayStyle, gameDetails, defendingTeam, !teamAHasBall)
    checkForCard(activePlayer, attackingPlayStyle, gameDetails, teamAHasBall ? playerTeamA : playerTeamB, teamAHasBall)

    if (!loseBall) {
      gameDetails.streak++
    } else {
      gameDetails.streak = 0
      if (opponentPlayer.sentOff) {
        const availableDefenders = defendingTeam.filter(p => !p.sentOff)
        if (availableDefenders.length > 0) randomItem(availableDefenders).hasBall = true
      } else {
        opponentPlayer.hasBall = true
      }
      activePlayer.hasBall = false
      return false
    }
  }
  return true
}

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

  const chanceForShoot = Math.min(0.95, chanceToShoot(activePlayer) * (1 + gameDetails.streak * 0.3))
  if (Math.random() > chanceForShoot) return true

  if (teamAHasBall) gameDetails.shotsTeamA++
  else gameDetails.shotsTeamB++

  const keeperSaves = goalKeeper && Math.random() < goalKeeper.level / (goalKeeper.level + activePlayer.level)
  const shotMisses = Math.random() > 0.25

  if (keeperSaves || (goalKeeper && shotMisses)) {
    if (keeperSaves) {
      if (teamAHasBall) gameDetails.shotsOnTargetTeamA++
      else gameDetails.shotsOnTargetTeamB++
    }
    if (goalKeeper) goalKeeper.hasBall = true
    activePlayer.hasBall = false
    return false
  }

  if (!goalKeeper && shotMisses) return true

  if (teamAHasBall) {
    gameDetails.shotsOnTargetTeamA++
    gameDetails.goalsTeamA++
  } else {
    gameDetails.shotsOnTargetTeamB++
    gameDetails.goalsTeamB++
  }

  return true
}

function selectPassTarget (activePlayer, teammates, passStyle) {
  if (teammates.length === 0) return activePlayer

  const teammatesWithDistance = teammates.map(player => ({
    player,
    distance: getPositionDistance(activePlayer.in_game_position, player.in_game_position)
  }))

  teammatesWithDistance.sort((a, b) => a.distance - b.distance)

  const medianIndex = Math.floor(teammatesWithDistance.length / 2)
  const shortPassTargets = teammatesWithDistance.slice(0, Math.max(1, medianIndex + 1))
  const longPassTargets = teammatesWithDistance.slice(Math.max(1, medianIndex))

  if (passStyle === 'short') return randomItem(shortPassTargets).player
  else if (passStyle === 'long') return randomItem(longPassTargets).player
  else return Math.random() < 0.5 ? randomItem(shortPassTargets).player : randomItem(longPassTargets).player
}

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

function playGameStep (playerTeamA, playerTeamB, gameDetails) {
  if (!fightsOpponents(playerTeamA, playerTeamB, gameDetails)) return
  if (!shootBall(playerTeamA, playerTeamB, gameDetails)) return
  passBall(playerTeamA, playerTeamB, gameDetails)
}

function simulateGame (teamA, teamB, passStyleA, passStyleB, playStyleA, playStyleB, teamLevelA, teamLevelB) {
  for (const player of teamA) {
    player.hasBall = false
    player.level = player.freshness * (teamLevelA / 11)
    player.yellowCardsInMatch = 0
    player.sentOff = false
  }
  for (const player of teamB) {
    player.hasBall = false
    player.level = player.freshness * (teamLevelB / 11)
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

  kickoff(teamA, teamB)

  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    playGameStep(teamA, teamB, gameDetails)
  }

  return {
    goalsA: gameDetails.goalsTeamA,
    goalsB: gameDetails.goalsTeamB,
    yellowCardsA: gameDetails.yellowCardsTeamA,
    yellowCardsB: gameDetails.yellowCardsTeamB,
    redCardsA: gameDetails.redCardsTeamA,
    redCardsB: gameDetails.redCardsTeamB
  }
}

// ============================================================================
// Main Analysis
// ============================================================================

async function runAnalysis () {
  console.log('Starting comprehensive tactics analysis...')
  console.log(`Games per matchup: ${GAMES_PER_MATCHUP}`)
  console.log()

  const formationNames = Object.keys(FORMATIONS)
  const report = []

  report.push('# Soccer Manager - Tactics Analysis Report')
  report.push('')
  report.push(`*Generated: ${new Date().toISOString().split('T')[0]}*`)
  report.push(`*Games per matchup: ${GAMES_PER_MATCHUP}*`)
  report.push('')

  // ============================================================================
  // Formation Analysis
  // ============================================================================

  console.log('Analyzing formations...')
  const formationStats = {}

  for (const formation of formationNames) {
    formationStats[formation] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0 }
  }

  for (let i = 0; i < formationNames.length; i++) {
    for (let j = 0; j < formationNames.length; j++) {
      const formationA = formationNames[i]
      const formationB = formationNames[j]

      const teamA = createTeam(FORMATIONS[formationA], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS[formationB], BASE_TEAM_LEVEL)

      for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
        const result = simulateGame(teamA, teamB, 'mixed', 'mixed', 'normal', 'normal', BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)

        formationStats[formationA].goals += result.goalsA
        formationStats[formationB].goals += result.goalsB
        formationStats[formationA].games++
        formationStats[formationB].games++

        if (result.goalsA > result.goalsB) {
          formationStats[formationA].wins++
          formationStats[formationB].losses++
        } else if (result.goalsB > result.goalsA) {
          formationStats[formationB].wins++
          formationStats[formationA].losses++
        } else {
          formationStats[formationA].draws++
          formationStats[formationB].draws++
        }
      }
    }
    process.stdout.write(`\rFormations: ${i + 1}/${formationNames.length}`)
  }
  console.log()

  const formationRankings = formationNames.map(f => ({
    formation: f,
    winRate: formationStats[f].wins / formationStats[f].games,
    avgGoals: formationStats[f].goals / formationStats[f].games,
    games: formationStats[f].games
  })).sort((a, b) => b.winRate - a.winRate)

  report.push('## Formation Rankings')
  report.push('')
  report.push('| Rank | Formation | Win Rate | Avg Goals/Game |')
  report.push('|------|-----------|----------|----------------|')
  formationRankings.forEach((f, i) => {
    report.push(`| ${i + 1} | ${f.formation} | ${(f.winRate * 100).toFixed(1)}% | ${f.avgGoals.toFixed(2)} |`)
  })
  report.push('')

  // ============================================================================
  // Formation vs Formation Matrix
  // ============================================================================

  console.log('Creating formation vs formation matrix...')
  const formationMatrix = {}

  for (const formationA of formationNames) {
    formationMatrix[formationA] = {}
    for (const formationB of formationNames) {
      const teamA = createTeam(FORMATIONS[formationA], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS[formationB], BASE_TEAM_LEVEL)

      let winsA = 0

      for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
        const result = simulateGame(teamA, teamB, 'mixed', 'mixed', 'normal', 'normal', BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)
        if (result.goalsA > result.goalsB) winsA++
      }

      formationMatrix[formationA][formationB] = (winsA / GAMES_PER_MATCHUP * 100).toFixed(0)
    }
  }

  report.push('## Formation vs Formation (Win Rate %)')
  report.push('')
  report.push('*Read: Row formation win rate against column formation*')
  report.push('')
  report.push('| | ' + formationNames.join(' | ') + ' |')
  report.push('|' + '----|'.repeat(formationNames.length + 1))
  for (const f of formationNames) {
    const row = [f]
    for (const f2 of formationNames) {
      row.push(formationMatrix[f][f2])
    }
    report.push('| ' + row.join(' | ') + ' |')
  }
  report.push('')

  // ============================================================================
  // Play Style Analysis
  // ============================================================================

  console.log('Analyzing play styles...')
  const playStyleStats = {}

  for (const style of PLAY_STYLES) {
    playStyleStats[style] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0, yellowCards: 0, redCards: 0 }
  }

  for (const styleA of PLAY_STYLES) {
    for (const styleB of PLAY_STYLES) {
      const teamA = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)

      for (let g = 0; g < GAMES_PER_MATCHUP * 2; g++) {
        const result = simulateGame(teamA, teamB, 'mixed', 'mixed', styleA, styleB, BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)

        playStyleStats[styleA].goals += result.goalsA
        playStyleStats[styleA].games++
        playStyleStats[styleA].yellowCards += result.yellowCardsA
        playStyleStats[styleA].redCards += result.redCardsA
        playStyleStats[styleB].goals += result.goalsB
        playStyleStats[styleB].games++
        playStyleStats[styleB].yellowCards += result.yellowCardsB
        playStyleStats[styleB].redCards += result.redCardsB

        if (result.goalsA > result.goalsB) {
          playStyleStats[styleA].wins++
          playStyleStats[styleB].losses++
        } else if (result.goalsB > result.goalsA) {
          playStyleStats[styleB].wins++
          playStyleStats[styleA].losses++
        } else {
          playStyleStats[styleA].draws++
          playStyleStats[styleB].draws++
        }
      }
    }
  }

  report.push('## Play Style Rankings')
  report.push('')
  report.push('| Play Style | Win Rate | Avg Goals | Yellow Cards/Game | Red Cards/Game |')
  report.push('|------------|----------|-----------|-------------------|----------------|')
  for (const style of PLAY_STYLES) {
    const s = playStyleStats[style]
    report.push(`| ${style} | ${(s.wins / s.games * 100).toFixed(1)}% | ${(s.goals / s.games).toFixed(2)} | ${(s.yellowCards / s.games).toFixed(2)} | ${(s.redCards / s.games).toFixed(3)} |`)
  }
  report.push('')

  // ============================================================================
  // Play Style vs Play Style Matrix
  // ============================================================================

  console.log('Creating play style vs play style matrix...')
  const playStyleMatrix = {}

  for (const styleA of PLAY_STYLES) {
    playStyleMatrix[styleA] = {}
    for (const styleB of PLAY_STYLES) {
      const teamA = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)

      let winsA = 0

      for (let g = 0; g < GAMES_PER_MATCHUP * 3; g++) {
        const result = simulateGame(teamA, teamB, 'mixed', 'mixed', styleA, styleB, BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)
        if (result.goalsA > result.goalsB) winsA++
      }

      playStyleMatrix[styleA][styleB] = (winsA / (GAMES_PER_MATCHUP * 3) * 100).toFixed(1)
    }
  }

  report.push('## Play Style vs Play Style (Win Rate %)')
  report.push('')
  report.push('| | ' + PLAY_STYLES.join(' | ') + ' |')
  report.push('|' + '------------|'.repeat(PLAY_STYLES.length + 1))
  for (const s of PLAY_STYLES) {
    report.push(`| ${s} | ${PLAY_STYLES.map(s2 => playStyleMatrix[s][s2]).join(' | ')} |`)
  }
  report.push('')

  // ============================================================================
  // Pass Style Analysis
  // ============================================================================

  console.log('Analyzing pass styles...')
  const passStyleStats = {}

  for (const style of PASS_STYLES) {
    passStyleStats[style] = { wins: 0, draws: 0, losses: 0, goals: 0, games: 0 }
  }

  for (const styleA of PASS_STYLES) {
    for (const styleB of PASS_STYLES) {
      const teamA = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)

      for (let g = 0; g < GAMES_PER_MATCHUP * 2; g++) {
        const result = simulateGame(teamA, teamB, styleA, styleB, 'normal', 'normal', BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)

        passStyleStats[styleA].goals += result.goalsA
        passStyleStats[styleA].games++
        passStyleStats[styleB].goals += result.goalsB
        passStyleStats[styleB].games++

        if (result.goalsA > result.goalsB) {
          passStyleStats[styleA].wins++
          passStyleStats[styleB].losses++
        } else if (result.goalsB > result.goalsA) {
          passStyleStats[styleB].wins++
          passStyleStats[styleA].losses++
        } else {
          passStyleStats[styleA].draws++
          passStyleStats[styleB].draws++
        }
      }
    }
  }

  report.push('## Pass Style Rankings')
  report.push('')
  report.push('| Pass Style | Win Rate | Avg Goals |')
  report.push('|------------|----------|-----------|')
  for (const style of PASS_STYLES) {
    const s = passStyleStats[style]
    report.push(`| ${style} | ${(s.wins / s.games * 100).toFixed(1)}% | ${(s.goals / s.games).toFixed(2)} |`)
  }
  report.push('')

  // ============================================================================
  // Pass Style vs Pass Style Matrix
  // ============================================================================

  console.log('Creating pass style vs pass style matrix...')
  const passStyleMatrix = {}

  for (const styleA of PASS_STYLES) {
    passStyleMatrix[styleA] = {}
    for (const styleB of PASS_STYLES) {
      const teamA = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)
      const teamB = createTeam(FORMATIONS['4-4-2'], BASE_TEAM_LEVEL)

      let winsA = 0

      for (let g = 0; g < GAMES_PER_MATCHUP * 3; g++) {
        const result = simulateGame(teamA, teamB, styleA, styleB, 'normal', 'normal', BASE_TEAM_LEVEL, BASE_TEAM_LEVEL)
        if (result.goalsA > result.goalsB) winsA++
      }

      passStyleMatrix[styleA][styleB] = (winsA / (GAMES_PER_MATCHUP * 3) * 100).toFixed(1)
    }
  }

  report.push('## Pass Style vs Pass Style (Win Rate %)')
  report.push('')
  report.push('| | ' + PASS_STYLES.join(' | ') + ' |')
  report.push('|' + '--------|'.repeat(PASS_STYLES.length + 1))
  for (const s of PASS_STYLES) {
    report.push(`| ${s} | ${PASS_STYLES.map(s2 => passStyleMatrix[s][s2]).join(' | ')} |`)
  }
  report.push('')

  // ============================================================================
  // Team Level Impact Analysis
  // ============================================================================

  console.log('Analyzing team level impact...')

  report.push('## Team Strength Impact')
  report.push('')
  report.push('*Testing how much player levels affect match outcomes*')
  report.push('')

  const levelTests = [
    { teamALevel: 55, teamBLevel: 55, label: 'Equal teams (Level 5 avg)' },
    { teamALevel: 55, teamBLevel: 66, label: 'Level 5 vs Level 6 (1 level diff)' },
    { teamALevel: 55, teamBLevel: 77, label: 'Level 5 vs Level 7 (2 level diff)' },
    { teamALevel: 55, teamBLevel: 88, label: 'Level 5 vs Level 8 (3 level diff)' },
    { teamALevel: 55, teamBLevel: 99, label: 'Level 5 vs Level 9 (4 level diff)' },
    { teamALevel: 55, teamBLevel: 110, label: 'Level 5 vs Level 10 (5 level diff)' }
  ]

  report.push('| Matchup | Weaker Team Win % | Stronger Team Win % | Draw % |')
  report.push('|---------|-------------------|---------------------|--------|')

  for (const test of levelTests) {
    const teamA = createTeam(FORMATIONS['4-4-2'], test.teamALevel)
    const teamB = createTeam(FORMATIONS['4-4-2'], test.teamBLevel)

    let winsA = 0
    let winsB = 0
    let draws = 0

    for (let g = 0; g < GAMES_PER_MATCHUP * 5; g++) {
      const result = simulateGame(teamA, teamB, 'mixed', 'mixed', 'normal', 'normal', test.teamALevel, test.teamBLevel)
      if (result.goalsA > result.goalsB) winsA++
      else if (result.goalsB > result.goalsA) winsB++
      else draws++
    }

    const total = GAMES_PER_MATCHUP * 5
    report.push(`| ${test.label} | ${(winsA / total * 100).toFixed(1)}% | ${(winsB / total * 100).toFixed(1)}% | ${(draws / total * 100).toFixed(1)}% |`)
  }
  report.push('')

  // ============================================================================
  // Best Counter Tactics
  // ============================================================================

  console.log('Finding best counter tactics...')

  report.push('## Best Counter Tactics')
  report.push('')
  report.push('*For each tactic, what is the best counter?*')
  report.push('')

  // Formation counters
  report.push('### Best Counter Formation')
  report.push('')
  report.push('| Formation | Best Counter | Win Rate Against |')
  report.push('|-----------|--------------|------------------|')

  for (const formation of formationNames) {
    let bestCounter = formationNames[0]
    let bestWinRate = 0

    for (const counter of formationNames) {
      if (counter === formation) continue
      const winRate = parseFloat(formationMatrix[counter][formation])
      if (winRate > bestWinRate) {
        bestWinRate = winRate
        bestCounter = counter
      }
    }

    report.push(`| ${formation} | ${bestCounter} | ${bestWinRate}% |`)
  }
  report.push('')

  // Play style counters
  report.push('### Best Counter Play Style')
  report.push('')
  report.push('| Play Style | Best Counter | Win Rate Against |')
  report.push('|------------|--------------|------------------|')

  for (const style of PLAY_STYLES) {
    let bestCounter = PLAY_STYLES[0]
    let bestWinRate = 0

    for (const counter of PLAY_STYLES) {
      if (counter === style) continue
      const winRate = parseFloat(playStyleMatrix[counter][style])
      if (winRate > bestWinRate) {
        bestWinRate = winRate
        bestCounter = counter
      }
    }

    report.push(`| ${style} | ${bestCounter} | ${bestWinRate}% |`)
  }
  report.push('')

  // Pass style counters
  report.push('### Best Counter Pass Style')
  report.push('')
  report.push('| Pass Style | Best Counter | Win Rate Against |')
  report.push('|------------|--------------|------------------|')

  for (const style of PASS_STYLES) {
    let bestCounter = PASS_STYLES[0]
    let bestWinRate = 0

    for (const counter of PASS_STYLES) {
      if (counter === style) continue
      const winRate = parseFloat(passStyleMatrix[counter][style])
      if (winRate > bestWinRate) {
        bestWinRate = winRate
        bestCounter = counter
      }
    }

    report.push(`| ${style} | ${bestCounter} | ${bestWinRate}% |`)
  }
  report.push('')

  // ============================================================================
  // Overall Best Tactic
  // ============================================================================

  console.log('Determining overall best tactics...')

  report.push('## Overall Best Tactics')
  report.push('')

  const bestFormation = formationRankings[0].formation
  const bestPlayStyle = PLAY_STYLES.reduce((best, style) =>
    playStyleStats[style].wins / playStyleStats[style].games > playStyleStats[best].wins / playStyleStats[best].games ? style : best
  )
  const bestPassStyle = PASS_STYLES.reduce((best, style) =>
    passStyleStats[style].wins / passStyleStats[style].games > passStyleStats[best].wins / passStyleStats[best].games ? style : best
  )

  report.push(`- **Best Formation:** ${bestFormation} (${(formationRankings[0].winRate * 100).toFixed(1)}% win rate)`)
  report.push(`- **Best Play Style:** ${bestPlayStyle} (${(playStyleStats[bestPlayStyle].wins / playStyleStats[bestPlayStyle].games * 100).toFixed(1)}% win rate)`)
  report.push(`- **Best Pass Style:** ${bestPassStyle} (${(passStyleStats[bestPassStyle].wins / passStyleStats[bestPassStyle].games * 100).toFixed(1)}% win rate)`)
  report.push('')

  // ============================================================================
  // Conclusions
  // ============================================================================

  report.push('## Conclusions')
  report.push('')

  const formationSpread = (formationRankings[0].winRate - formationRankings[formationRankings.length - 1].winRate) * 100
  const playStyleSpread = Math.max(
    ...PLAY_STYLES.map(s => playStyleStats[s].wins / playStyleStats[s].games)
  ) * 100 - Math.min(
    ...PLAY_STYLES.map(s => playStyleStats[s].wins / playStyleStats[s].games)
  ) * 100

  report.push(`### Formation Impact`)
  report.push(`- Win rate spread between best and worst formation: **${formationSpread.toFixed(1)}%**`)
  if (formationSpread < 3) {
    report.push('- Formations have **minimal impact** on match outcomes')
  } else if (formationSpread < 8) {
    report.push('- Formations have **moderate impact** on match outcomes')
  } else {
    report.push('- Formations have **significant impact** on match outcomes')
  }
  report.push('')

  report.push(`### Play Style Impact`)
  report.push(`- Win rate spread: **${playStyleSpread.toFixed(1)}%**`)
  report.push(`- Aggressive style: More cards but slightly better fight success`)
  report.push(`- Friendly style: Fewer cards but slightly worse fight success`)
  report.push('')

  report.push('### Team Strength Impact')
  report.push('- A **1 level difference** (e.g., avg level 5 vs 6) gives the stronger team a significant advantage')
  report.push('- **Team quality matters more than tactics** - focus on improving players')
  report.push('')

  report.push('### Recommended Strategy')
  report.push(`1. Use **${bestFormation}** formation as default`)
  report.push(`2. Use **${bestPlayStyle}** play style for balanced performance`)
  report.push(`3. Use **${bestPassStyle}** pass style`)
  report.push('4. Prioritize player development over tactical optimization')
  report.push('')

  // Write the report
  const reportContent = report.join('\n')
  writeFileSync('TACTICS_ANALYSIS.md', reportContent)
  console.log()
  console.log('Report written to TACTICS_ANALYSIS.md')
}

runAnalysis().catch(console.error)
