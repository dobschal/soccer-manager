import { query } from '../lib/database.js'
import { Game } from '../entities/game.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'

const CUP_PRIZE = 2000000 // 2 million euros

/**
 * Calculate the cup schedule based on team count and total game days
 * @param {number} teamCount - Number of teams participating
 * @param {number} totalGameDays - Total game days in a season (usually 33)
 * @returns {Array<{round: number, gameDay: number, roundName: string}>}
 */
export function calculateCupSchedule (teamCount, totalGameDays = 33) {
  // Calculate the number of rounds needed
  const rounds = []

  // Calculate how many rounds we need (log2 of team count, rounded up)
  let roundCount = 0
  let currentTeams = 1
  while (currentTeams < teamCount) {
    currentTeams *= 2
    roundCount++
  }

  // Build rounds from final backwards
  // Final should be on game day 32 (before last league day 33)
  const finalGameDay = totalGameDays - 1

  // Calculate round names and team counts
  const roundNames = []
  let teamsInRound = 2
  for (let i = 0; i < roundCount; i++) {
    if (teamsInRound === 2) roundNames.unshift('final')
    else if (teamsInRound === 4) roundNames.unshift('semiFinal')
    else if (teamsInRound === 8) roundNames.unshift('quarterFinal')
    else roundNames.unshift(`roundOf${teamsInRound}`)
    teamsInRound *= 2
  }

  // Space out rounds evenly, with final on game day 32
  // Leave some buffer at the start of the season
  const firstRoundGameDay = 4
  const availableDays = finalGameDay - firstRoundGameDay

  for (let i = 0; i < roundCount; i++) {
    const roundNumber = Math.pow(2, roundCount - 1 - i) // e.g., 64, 32, 16, 8, 4, 2, 1
    const progress = i / (roundCount - 1 || 1) // 0 to 1
    const gameDay = roundCount === 1
      ? finalGameDay
      : Math.round(firstRoundGameDay + progress * availableDays)

    rounds.push({
      round: roundNumber,
      gameDay,
      roundName: roundNames[i]
    })
  }

  return rounds
}

/**
 * Create the initial cup draw for a season
 * @param {number} season
 * @returns {Promise<number>} Number of matches created
 */
export async function createCupDraw (season) {
  // Get all teams
  const teams = await query('SELECT * FROM team ORDER BY level ASC, league ASC')
  const teamCount = teams.length

  if (teamCount < 2) {
    console.log('Not enough teams for cup')
    return 0
  }

  // Calculate schedule
  const schedule = calculateCupSchedule(teamCount)
  if (schedule.length === 0) {
    console.log('No cup schedule could be calculated')
    return 0
  }

  const firstRound = schedule[0]

  // Calculate how many matches in first round
  // If not a power of 2, some teams get byes
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(teamCount)))
  const byeCount = nextPowerOf2 - teamCount

  // Shuffle teams for random draw
  const shuffledTeams = [...teams].sort(() => Math.random() - 0.5)

  // Higher-ranked teams (lower level) get byes
  // Teams are already sorted by level, so first byeCount teams get byes
  const teamsByLevel = [...teams].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level
    return a.league - b.league
  })
  const byeTeams = teamsByLevel.slice(0, byeCount)
  const participatingTeams = shuffledTeams.filter(t => !byeTeams.some(bt => bt.id === t.id))

  // Create first round matches
  let matchesCreated = 0
  for (let i = 0; i < participatingTeams.length; i += 2) {
    const teamA = participatingTeams[i]
    const teamB = participatingTeams[i + 1]

    if (!teamA || !teamB) break

    const game = new Game({
      team_1_id: teamA.id,
      team_2_id: teamB.id,
      season,
      game_day: firstRound.gameDay,
      level: 0, // Cup games don't belong to a specific level
      league: 0,
      played: 0,
      details: '{}',
      game_type: 'cup',
      cup_round: firstRound.round
    })

    await query('INSERT INTO game SET ?', game)
    matchesCreated++
  }

  // If there are bye teams, they automatically advance to the next round
  // We'll handle this when the first round completes
  console.log(`Cup draw created: ${matchesCreated} first round matches, ${byeCount} byes`)

  return matchesCreated
}

/**
 * Progress to the next cup round after all games in the current round are complete
 * @param {number} season
 * @param {number} completedRound - The round that just completed (e.g., 64)
 * @returns {Promise<{advanced: boolean, isComplete: boolean}>}
 */
export async function progressCupRound (season, completedRound) {
  // Check if all games in this round are played
  const unplayedGames = await query(
    `SELECT * FROM game WHERE game_type='cup' AND season=? AND cup_round=? AND played=0`,
    [season, completedRound]
  )

  if (unplayedGames.length > 0) {
    return { advanced: false, isComplete: false }
  }

  // Get all played games in this round
  const playedGames = await query(
    `SELECT * FROM game WHERE game_type='cup' AND season=? AND cup_round=? AND played=1`,
    [season, completedRound]
  )

  // Get winners
  const winners = playedGames.map(game => {
    if (game.goals_team_1 > game.goals_team_2) return game.team_1_id
    if (game.goals_team_2 > game.goals_team_1) return game.team_2_id
    // In case of draw, random winner (should use penalties in real implementation)
    return Math.random() < 0.5 ? game.team_1_id : game.team_2_id
  })

  // Get teams that had byes (if any)
  // These are teams that are in the cup but weren't in any match of the completed round
  const allCupTeams = await _getAllCupTeamsForSeason(season)
  const teamsInRound = new Set(playedGames.flatMap(g => [g.team_1_id, g.team_2_id]))
  const byeTeams = allCupTeams.filter(t => !teamsInRound.has(t.id))

  // Combine winners and bye teams for next round
  const nextRoundTeams = [...winners, ...byeTeams.map(t => t.id)]

  // If only 1 team left, cup is complete
  if (nextRoundTeams.length === 1) {
    await awardCupWinner(season, nextRoundTeams[0])
    return { advanced: true, isComplete: true }
  }

  // Calculate next round number
  const nextRound = completedRound / 2
  if (nextRound < 1) {
    return { advanced: false, isComplete: true }
  }

  // Get the schedule to find the game day for next round
  const teams = await query('SELECT * FROM team')
  const schedule = calculateCupSchedule(teams.length)
  const nextRoundSchedule = schedule.find(s => s.round === nextRound)

  if (!nextRoundSchedule) {
    console.error(`Could not find schedule for round ${nextRound}`)
    return { advanced: false, isComplete: false }
  }

  // Shuffle next round teams for random matchups
  const shuffledTeams = [...nextRoundTeams].sort(() => Math.random() - 0.5)

  // Create next round matches
  for (let i = 0; i < shuffledTeams.length; i += 2) {
    const teamAId = shuffledTeams[i]
    const teamBId = shuffledTeams[i + 1]

    if (!teamAId || !teamBId) break

    const game = new Game({
      team_1_id: teamAId,
      team_2_id: teamBId,
      season,
      game_day: nextRoundSchedule.gameDay,
      level: 0,
      league: 0,
      played: 0,
      details: '{}',
      game_type: 'cup',
      cup_round: nextRound
    })

    await query('INSERT INTO game SET ?', game)
  }

  console.log(`Cup round ${completedRound} complete. ${shuffledTeams.length / 2} matches created for round ${nextRound}`)
  return { advanced: true, isComplete: false }
}

/**
 * Award the cup winner with prize money and log message
 * @param {number} season
 * @param {number} winnerTeamId
 * @returns {Promise<void>}
 */
export async function awardCupWinner (season, winnerTeamId) {
  const [team] = await query('SELECT * FROM team WHERE id=?', [winnerTeamId])
  if (!team) {
    console.error(`Cup winner team ${winnerTeamId} not found`)
    return
  }

  // Get current game day
  const [latestGame] = await query(
    'SELECT game_day, season FROM game WHERE played=1 ORDER BY season DESC, game_day DESC LIMIT 1'
  )
  const gameDay = latestGame?.game_day ?? 0

  // Award prize money
  const locale = await getUserLocale(team.user_id)
  const reason = t('finance.cupPrize', {}, locale)
  await updateTeamBalance(team, CUP_PRIZE, reason, gameDay, season)

  // Send log message to winner
  if (team.user_id) {
    await addLogMessage(
      t('log.cupWinner', { prize: CUP_PRIZE.toLocaleString() + '€' }, locale),
      team,
      null,
      null,
      'trophy'
    )
  }

  console.log(`Cup winner: ${team.name} - Prize: ${CUP_PRIZE}€`)
}

/**
 * Get all teams participating in the cup for a season
 * @param {number} season
 * @returns {Promise<TeamType[]>}
 */
async function _getAllCupTeamsForSeason (season) {
  // Get all unique team IDs from cup games this season
  const teamIds = await query(`
    SELECT DISTINCT team_id FROM (
      SELECT team_1_id as team_id FROM game WHERE game_type='cup' AND season=?
      UNION
      SELECT team_2_id as team_id FROM game WHERE game_type='cup' AND season=?
    ) teams
  `, [season, season])

  if (teamIds.length === 0) {
    return []
  }

  const ids = teamIds.map(t => t.team_id)
  return await query(`SELECT * FROM team WHERE id IN (${ids.join(',')})`)
}

/**
 * Get cup games for a specific team
 * @param {number} teamId
 * @param {number} season
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getCupGamesForTeam (teamId, season, limit = 10) {
  const games = await query(`
    SELECT g.id as id,
           g.game_day as gameDay,
           g.season as season,
           g.goals_team_1 as goalsTeam1,
           g.goals_team_2 as goalsTeam2,
           g.cup_round as cupRound,
           g.played as played,
           t1.name as team1,
           t2.name as team2,
           g.team_1_id as team1Id,
           g.team_2_id as team2Id,
           t1.color as team1Color,
           t1.emblem as team1Emblem,
           t2.color as team2Color,
           t2.emblem as team2Emblem
    FROM game g
    JOIN team t1 ON t1.id = g.team_1_id
    JOIN team t2 ON t2.id = g.team_2_id
    WHERE g.game_type = 'cup'
      AND g.season = ?
      AND (g.team_1_id = ? OR g.team_2_id = ?)
    ORDER BY g.cup_round DESC, g.game_day ASC
    LIMIT ?
  `, [season, teamId, teamId, limit])

  return games
}

/**
 * Get cup results for a specific round
 * @param {number} season
 * @param {number} round - Cup round number (1=final, 2=semi, etc.)
 * @returns {Promise<Array>}
 */
export async function getCupResultsForRound (season, round) {
  const games = await query(`
    SELECT g.id as id,
           g.game_day as gameDay,
           g.season as season,
           g.goals_team_1 as goalsTeam1,
           g.goals_team_2 as goalsTeam2,
           g.cup_round as cupRound,
           g.played as played,
           t1.name as team1,
           t2.name as team2,
           g.team_1_id as team1Id,
           g.team_2_id as team2Id,
           t1.color as team1Color,
           t1.emblem as team1Emblem,
           t2.color as team2Color,
           t2.emblem as team2Emblem
    FROM game g
    JOIN team t1 ON t1.id = g.team_1_id
    JOIN team t2 ON t2.id = g.team_2_id
    WHERE g.game_type = 'cup'
      AND g.season = ?
      AND g.cup_round = ?
    ORDER BY g.game_day ASC
  `, [season, round])

  return games
}

/**
 * Get all cup rounds for a season
 * @param {number} season
 * @returns {Promise<Array<{round: number, played: boolean, gameDay: number}>>}
 */
export async function getCupRoundsForSeason (season) {
  const rounds = await query(`
    SELECT cup_round as round,
           MIN(game_day) as gameDay,
           MIN(played) = 1 AND MAX(played) = 1 as allPlayed,
           COUNT(*) as matchCount
    FROM game
    WHERE game_type = 'cup' AND season = ?
    GROUP BY cup_round
    ORDER BY cup_round DESC
  `, [season])

  return rounds.map(r => ({
    round: r.round,
    played: r.allPlayed === 1,
    gameDay: r.gameDay,
    matchCount: r.matchCount
  }))
}

/**
 * Get seasons that have cup data
 * @returns {Promise<number[]>}
 */
export async function getCupSeasons () {
  const seasons = await query(`
    SELECT DISTINCT season FROM game WHERE game_type = 'cup' ORDER BY season DESC
  `)
  return seasons.map(s => s.season)
}

/**
 * Get the cup bracket structure for a season
 * @param {number} season
 * @returns {Promise<Object>}
 */
export async function getCupBracket (season) {
  const rounds = await getCupRoundsForSeason(season)
  const bracket = {}

  for (const round of rounds) {
    const games = await getCupResultsForRound(season, round.round)
    bracket[round.round] = {
      ...round,
      games
    }
  }

  return bracket
}

/**
 * Send cup match result log messages to team owners
 * @param {GameType} game - The completed cup game
 * @param {Object} gameDetails - Game details including goals
 */
export async function sendCupMatchLogMessages (game, gameDetails) {
  const [[team1], [team2]] = await Promise.all([
    query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    query('SELECT * FROM team WHERE id=?', [game.team_2_id])
  ])

  const goalsTeam1 = gameDetails.goalsTeamA
  const goalsTeam2 = gameDetails.goalsTeamB

  // Determine winner and loser
  const team1Won = goalsTeam1 > goalsTeam2
  const isDraw = goalsTeam1 === goalsTeam2

  // Send messages to team owners
  for (const [team, isTeam1] of [[team1, true], [team2, false]]) {
    if (!team.user_id) continue

    const locale = await getUserLocale(team.user_id)
    const myGoals = isTeam1 ? goalsTeam1 : goalsTeam2
    const theirGoals = isTeam1 ? goalsTeam2 : goalsTeam1
    const opponent = isTeam1 ? team2.name : team1.name
    const won = isTeam1 ? team1Won : !team1Won

    if (isDraw) {
      // In case of draw, we still have a winner determined randomly
      // This shouldn't happen often, but handle it gracefully
      await addLogMessage(
        t('log.cupMatchDraw', { opponent, goalsFor: myGoals, goalsAgainst: theirGoals }, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy'
      )
    } else if (won) {
      await addLogMessage(
        t('log.cupMatchWin', { opponent, goalsFor: myGoals, goalsAgainst: theirGoals }, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy'
      )
    } else {
      await addLogMessage(
        t('log.cupMatchLoss', { opponent, goalsFor: myGoals, goalsAgainst: theirGoals }, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy'
      )
    }
  }
}
