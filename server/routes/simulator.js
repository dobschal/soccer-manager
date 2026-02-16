import { getPositionsOfFormation } from '../../client/util/formation.js'
import { kickoff, playGameStep } from '../play-game.js'

export default {
  /**
   * Simulate multiple games between two configured teams
   * @param {object} teamAConfig - { name, formation, play_style, pass_style, avgLevel, gkLevel }
   * @param {object} teamBConfig - { name, formation, play_style, pass_style, avgLevel, gkLevel }
   * @param {number} numGames - Number of games to simulate
   * @returns {{ games: object[], summary: object }}
   */
  async simulateGames (teamAConfig, teamBConfig, numGames) {
    numGames = Math.min(Math.max(1, numGames || 1), 10000)

    const games = []

    for (let i = 0; i < numGames; i++) {
      const playerTeamA = _createPlayers(teamAConfig, 1)
      const playerTeamB = _createPlayers(teamBConfig, 100)

      const teamA = {
        id: 1,
        name: teamAConfig.name || 'Team A',
        formation: teamAConfig.formation,
        play_style: teamAConfig.play_style || 'normal',
        pass_style: teamAConfig.pass_style || 'mixed'
      }

      const teamB = {
        id: 2,
        name: teamBConfig.name || 'Team B',
        formation: teamBConfig.formation,
        play_style: teamBConfig.play_style || 'normal',
        pass_style: teamBConfig.pass_style || 'mixed'
      }

      const strengthTeamA = playerTeamA.reduce((sum, p) => sum + p.level, 0)
      const strengthTeamB = playerTeamB.reduce((sum, p) => sum + p.level, 0)

      const gameDetails = {
        log: [],
        goalsTeamA: 0,
        goalsTeamB: 0,
        strengthTeamA,
        strengthTeamB,
        stadiumDetails: {},
        playerTeamA,
        playerTeamB,
        teamA,
        teamB
      }

      kickoff(playerTeamA, playerTeamB, gameDetails)
      const overtime = Math.floor(Math.random() * 50)
      const totalSteps = 900 + overtime
      for (let step = 0; step < totalSteps; step++) {
        gameDetails.currentMinute = step < 900 ? Math.floor(step / 10) : 90 + Math.floor((step - 900) / 10)
        playGameStep(playerTeamA, playerTeamB, gameDetails)
      }

      const yellowCards = Object.values(gameDetails.yellowCardsInMatch || {}).reduce((sum, c) => sum + c, 0)
      const redCards = (gameDetails.sentOffPlayerIds || []).length

      games.push({
        goalsA: gameDetails.goalsTeamA,
        goalsB: gameDetails.goalsTeamB,
        shotsA: gameDetails.shotsTeamA || 0,
        shotsB: gameDetails.shotsTeamB || 0,
        yellowCards,
        redCards
      })
    }

    const summary = _computeSummary(games, numGames)
    return { games: numGames <= 200 ? games : [], summary }
  }
}

/**
 * Create synthetic players for a team config
 * @param {object} config - { formation, avgLevel, gkLevel }
 * @param {number} idOffset - Starting ID for players
 * @returns {object[]}
 */
function _createPlayers (config, idOffset) {
  const positions = getPositionsOfFormation(config.formation)
  if (!positions) return []

  const avgLevel = Number(config.avgLevel) || 5
  const gkLevel = Number(config.gkLevel) || avgLevel

  return positions.map((pos, i) => {
    const level = pos === 'GK' ? gkLevel : avgLevel
    return {
      id: idOffset + i,
      name: `Player ${i + 1}`,
      level,
      position: pos,
      in_game_position: pos,
      freshness: 1.0,
      hasBall: false
    }
  })
}

/**
 * Compute aggregate statistics from game results
 * @param {object[]} games
 * @param {number} n
 * @returns {object}
 */
function _computeSummary (games, n) {
  let winsA = 0; let draws = 0; let winsB = 0
  let totalGoals = 0; let totalGoalsA = 0; let totalGoalsB = 0
  let totalYellow = 0; let totalRed = 0
  let totalShotsA = 0; let totalShotsB = 0
  const goalDiffDist = {}

  for (const g of games) {
    if (g.goalsA > g.goalsB) winsA++
    else if (g.goalsA < g.goalsB) winsB++
    else draws++

    totalGoals += g.goalsA + g.goalsB
    totalGoalsA += g.goalsA
    totalGoalsB += g.goalsB
    totalYellow += g.yellowCards
    totalRed += g.redCards
    totalShotsA += g.shotsA
    totalShotsB += g.shotsB

    const diff = Math.abs(g.goalsA - g.goalsB)
    const key = diff >= 5 ? '5+' : String(diff)
    goalDiffDist[key] = (goalDiffDist[key] || 0) + 1
  }

  return {
    winsA,
    draws,
    winsB,
    winsAPct: (winsA / n * 100).toFixed(1),
    drawsPct: (draws / n * 100).toFixed(1),
    winsBPct: (winsB / n * 100).toFixed(1),
    avgGoals: (totalGoals / n).toFixed(2),
    avgGoalsA: (totalGoalsA / n).toFixed(2),
    avgGoalsB: (totalGoalsB / n).toFixed(2),
    avgYellow: (totalYellow / n).toFixed(2),
    avgRed: (totalRed / n).toFixed(3),
    avgShotsA: (totalShotsA / n).toFixed(1),
    avgShotsB: (totalShotsB / n).toFixed(1),
    goalDiffDistribution: {
      draw: ((goalDiffDist['0'] || 0) / n * 100).toFixed(1),
      diff1: ((goalDiffDist['1'] || 0) / n * 100).toFixed(1),
      diff2: ((goalDiffDist['2'] || 0) / n * 100).toFixed(1),
      diff3: ((goalDiffDist['3'] || 0) / n * 100).toFixed(1),
      diff4: ((goalDiffDist['4'] || 0) / n * 100).toFixed(1),
      diff5plus: ((goalDiffDist['5+'] || 0) / n * 100).toFixed(1)
    }
  }
}
