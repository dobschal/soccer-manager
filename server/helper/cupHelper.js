import { query } from '../lib/database.js'
import { Game } from '../entities/game.js'
import { updateTeamBalance } from './financeHelper.js'
import { addLogMessage } from './logMessageHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { getGameDayAndSeason } from './gameDayHelper.js'

const CUP_PRIZE = 2000000 // 2 million euros
const CUP_ROUND_BASE_PRIZE = 25000 // 25k for first round, doubles each round

/**
 * Is team `a` weaker than team `b`? Strength is ranked by team level first,
 * then by league (lower value = stronger). Teams from lower leagues therefore
 * count as weaker.
 * @param {{level?: number, league?: number}} a
 * @param {{level?: number, league?: number}} b
 * @returns {boolean}
 */
function isWeakerTeam (a, b) {
  if ((a.level ?? 0) !== (b.level ?? 0)) return (a.level ?? 0) > (b.level ?? 0)
  return (a.league ?? 0) > (b.league ?? 0)
}

/**
 * Decide home/away for a cup pairing. The weaker team (from a lower league)
 * always plays at home against a stronger opponent — team_1 is the home side
 * in the game model. Equal-strength pairings keep the given order.
 * @param {{id: number, level?: number, league?: number}} teamA
 * @param {{id: number, level?: number, league?: number}} teamB
 * @returns {{home: {id: number}, away: {id: number}}}
 */
function assignCupHomeAway (teamA, teamB) {
  if (isWeakerTeam(teamB, teamA)) return { home: teamB, away: teamA }
  return { home: teamA, away: teamB }
}

/**
 * Compute the total number of rounds from the first round's cup_round value.
 * cup_round uses powers of 2: first round has highest value (e.g., 64), final = 1.
 * @param {number} maxCupRound - The highest cup_round value (first round)
 * @returns {number} Total number of rounds in the tournament
 */
export function getTotalRounds (maxCupRound) {
  if (!maxCupRound || maxCupRound < 1) return 0
  return Math.log2(maxCupRound) + 1
}

/**
 * Get the sequential round number from a cup_round value.
 * @param {number} cupRound - The cup_round value (power of 2, 1=final)
 * @param {number} totalRounds - Total number of rounds in tournament
 * @returns {number} Sequential round number (1 = first round)
 */
export function getSequentialRoundNumber (cupRound, totalRounds) {
  return totalRounds - Math.log2(cupRound)
}

/**
 * Calculate the prize money for winning a cup round.
 * 25,000€ for the first round, doubling each round.
 * @param {number} cupRound - The cup_round value (power of 2, 1=final)
 * @param {number} maxCupRound - The highest cup_round value (first round)
 * @returns {number} Prize money in euros
 */
export function getCupRoundPrize (cupRound, maxCupRound) {
  return CUP_ROUND_BASE_PRIZE * (maxCupRound / cupRound)
}

/**
 * Get the display name for a cup round (server-side, no i18n).
 * @param {number} cupRound - The cup_round value (power of 2, 1=final)
 * @param {number} totalRounds - Total number of rounds in tournament
 * @returns {string} Display name like "Round 1", "Quarter-Final", etc.
 */
export function getCupRoundDisplayName (cupRound, totalRounds) {
  if (cupRound === 1) return 'Final'
  if (cupRound === 2) return 'Semi-Final'
  if (cupRound === 4) return 'Quarter-Final'
  if (cupRound === 8) return 'Round of 16'
  const sequential = getSequentialRoundNumber(cupRound, totalRounds)
  return `Round ${sequential}`
}

/**
 * Calculate the cup schedule based on team count and total game days
 * @param {number} teamCount - Number of teams participating
 * @param {number} totalGameDays - Total game days in a season (usually 34)
 * @returns {Array<{round: number, gameDay: number, roundName: string}>}
 */
export function calculateCupSchedule (teamCount, totalGameDays = 34) {
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
    if (teamsInRound === 2) {
      roundNames.unshift('final')
    } else if (teamsInRound === 4) {
      roundNames.unshift('semiFinal')
    } else if (teamsInRound === 8) {
      roundNames.unshift('quarterFinal')
    } else {
      roundNames.unshift(`roundOf${teamsInRound}`)
    }
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
 * Calculate an interleaved schedule where cup and league game days never overlap.
 * Cup days are inserted between league days at the positions determined by calculateCupSchedule.
 * @param {number} teamCount - Number of teams participating in the cup
 * @param {number} leagueGameDays - Total number of league game days (default 34 for 18-team leagues)
 * @returns {{ leagueDayMap: number[], cupGameDays: Map<number, number>, totalGameDays: number, cupSchedule: Array }}
 */
export function calculateInterleavedSchedule (teamCount, leagueGameDays = 34) {
  const cupSchedule = calculateCupSchedule(teamCount, leagueGameDays)
  const sortedCupEntries = [...cupSchedule].sort((a, b) => a.gameDay - b.gameDay)
  const cupInsertDays = sortedCupEntries.map(s => s.gameDay)

  const leagueDayMap = [] // index = original league day (0-33), value = actual game_day
  const cupGameDays = new Map() // cupRound -> actual game_day

  let actualDay = 0
  let cupIdx = 0

  for (let leagueDay = 0; leagueDay < leagueGameDays; leagueDay++) {
    // Insert cup days that should be placed before or at this league day
    while (cupIdx < cupInsertDays.length && cupInsertDays[cupIdx] <= leagueDay) {
      cupGameDays.set(sortedCupEntries[cupIdx].round, actualDay)
      actualDay++
      cupIdx++
    }
    leagueDayMap[leagueDay] = actualDay
    actualDay++
  }
  // Any remaining cup rounds go after all league days
  while (cupIdx < cupInsertDays.length) {
    cupGameDays.set(sortedCupEntries[cupIdx].round, actualDay)
    actualDay++
    cupIdx++
  }

  return { leagueDayMap, cupGameDays, totalGameDays: actualDay, cupSchedule }
}

/**
 * Find the next game_day to place a cup match on.
 *
 * Without `teamIds`: returns the next game_day from `minGameDay` onward where
 * no league game is scheduled — the original cup-only-slot semantics, used
 * when rescheduling past-but-unplayed cup games where we don't know yet which
 * teams are involved.
 *
 * With `teamIds`: returns the next game_day where none of the listed teams
 * has a league game. Cup-vs-league overlap is fine for teams not in this
 * round, so a "team-aware" lookup avoids pushing the round all the way to the
 * end of the season just because some other league happens to play that day.
 *
 * @param {number} season
 * @param {number} minGameDay - Earliest acceptable game_day
 * @param {number[]} [teamIds] - Teams that must be league-idle on the slot
 * @returns {Promise<number>}
 */
export async function findNextCupGameDay (season, minGameDay, teamIds) {
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    const placeholders = teamIds.map(() => '?').join(',')
    const conflicts = await query(
      `SELECT DISTINCT game_day FROM game
       WHERE season=? AND (game_type='league' OR game_type IS NULL)
         AND (team_1_id IN (${placeholders}) OR team_2_id IN (${placeholders}))`,
      [season, ...teamIds, ...teamIds]
    )
    const conflictSet = new Set(conflicts.map(d => d.game_day))
    let candidate = minGameDay
    while (conflictSet.has(candidate)) {
      candidate++
    }
    return candidate
  }

  const leagueDays = await query(
    'SELECT DISTINCT game_day FROM game WHERE season=? AND (game_type=\'league\' OR game_type IS NULL)',
    [season]
  )
  const leagueDaySet = new Set(leagueDays.map(d => d.game_day))
  let candidate = minGameDay
  while (leagueDaySet.has(candidate)) {
    candidate++
  }
  return candidate
}

/**
 * Create the initial cup draw for a season
 * @param {number} season
 * @param {number} [currentGameDay=0] - Current game day (used for mid-season cup creation to adjust schedule)
 * @param {Map<number, number>} [cupGameDays=null] - Pre-computed mapping of cupRound -> actual game_day from interleaved schedule
 * @returns {Promise<number>} Number of matches created
 */
export async function createCupDraw (season, currentGameDay = 0, cupGameDays = null) {
  // Get all teams
  const teams = await query('SELECT * FROM team WHERE is_system_team = 0 ORDER BY level ASC, league ASC')
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

  // Apply pre-computed interleaved game_days if provided
  if (cupGameDays) {
    for (const round of schedule) {
      if (cupGameDays.has(round.round)) {
        round.gameDay = cupGameDays.get(round.round)
      }
    }
  }

  // For mid-season creation, adjust round game days so they are in the future
  if (currentGameDay > 0) {
    const futureRounds = schedule.filter(s => s.gameDay > currentGameDay)
    if (futureRounds.length === 0) {
      // No room left — put all rounds on remaining days, finding cup-only slots
      const leagueDays = await query(
        'SELECT DISTINCT game_day FROM game WHERE season=? AND (game_type=\'league\' OR game_type IS NULL)',
        [season]
      )
      const leagueDaySet = new Set(leagueDays.map(d => d.game_day))
      let nextSlot = currentGameDay + 1
      for (let i = 0; i < schedule.length; i++) {
        while (leagueDaySet.has(nextSlot)) nextSlot++
        schedule[i].gameDay = nextSlot
        nextSlot++
      }
    } else {
      // Push early rounds to be at least currentGameDay + 1
      for (const round of schedule) {
        if (round.gameDay <= currentGameDay) {
          round.gameDay = currentGameDay + 1
        }
      }
    }
  }

  const firstRound = schedule[0]
  const totalRounds = schedule.length
  const firstRoundMatchDay = getSequentialRoundNumber(firstRound.round, totalRounds)

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

    // The weaker team (lower league) gets home advantage against a stronger opponent.
    const { home, away } = assignCupHomeAway(teamA, teamB)

    const game = new Game({
      team_1_id: home.id,
      team_2_id: away.id,
      season,
      game_day: firstRound.gameDay,
      match_day: firstRoundMatchDay,
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

  // Create bye game entries for teams that get a bye. Byes stay `played=0`
  // until the round's game day is actually reached — `_playCupGames` resolves
  // them to 0:0 alongside the real matches. Marking them played right at the
  // draw made `created_at` (= "played at" for cup games) the draw timestamp, so
  // the dashboard showed a finished match days before the round took place.
  for (const byeTeam of byeTeams) {
    const byeGame = new Game({
      team_1_id: byeTeam.id,
      team_2_id: null,
      season,
      game_day: firstRound.gameDay,
      match_day: firstRoundMatchDay,
      level: 0,
      league: 0,
      played: 0,
      details: '{}',
      game_type: 'cup',
      cup_round: firstRound.round
    })

    await query('INSERT INTO game SET ?', byeGame)
  }

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
    `SELECT *
     FROM game
     WHERE game_type = 'cup'
       AND season = ?
       AND cup_round = ?
       AND played = 0`,
    [season, completedRound]
  )

  if (unplayedGames.length > 0) {
    return {
      advanced: false,
      isComplete: false
    }
  }

  // Get all played games in this round
  const playedGames = await query(
    `SELECT *
     FROM game
     WHERE game_type = 'cup'
       AND season = ?
       AND cup_round = ?
       AND played = 1`,
    [season, completedRound]
  )

  // Get winners — bye games (team_2_id IS NULL) automatically advance team_1
  const winners = playedGames.map(game => {
    if (game.team_2_id == null) return game.team_1_id
    if (game.goals_team_1 > game.goals_team_2) return game.team_1_id
    if (game.goals_team_2 > game.goals_team_1) return game.team_2_id
    // Cup games should never end in a draw (extra time is played), but as a safety fallback pick team 1
    console.warn(`Cup game ${game.id} ended in a draw (${game.goals_team_1}-${game.goals_team_2}) — this should not happen`)
    return game.team_1_id
  })

  const nextRoundTeams = [...winners]

  // Look up the season's max cup_round so we can derive the user-facing match_day for the next round
  const [{ maxRound }] = await query(
    "SELECT MAX(cup_round) as maxRound FROM game WHERE game_type='cup' AND season=?",
    [season]
  )

  // If only 1 team left, cup is complete
  if (nextRoundTeams.length === 1) {
    await awardCupWinner(season, nextRoundTeams[0])
    return {
      advanced: true,
      isComplete: true
    }
  }

  // Calculate next round number
  const nextRound = completedRound / 2
  if (nextRound < 1) {
    return {
      advanced: false,
      isComplete: true
    }
  }

  // Find the next game_day on which none of the advancing teams has a league
  // game. Searching team-aware (vs "no league anywhere") keeps the cup-round
  // cadence tight: it lands on a day where the participating teams are idle,
  // even if other leagues happen to play that day.
  const completedGameDay = Math.max(...playedGames.map(g => g.game_day))
  const nextGameDay = await findNextCupGameDay(season, completedGameDay + 1, nextRoundTeams)

  // Sequential cup match day (1 = first round, totalRounds = final)
  const totalRounds = getTotalRounds(maxRound)
  const nextMatchDay = getSequentialRoundNumber(nextRound, totalRounds)

  // Shuffle next round teams for random matchups
  const shuffledTeams = [...nextRoundTeams].sort(() => Math.random() - 0.5)

  // Look up level/league of the advancing teams so we can grant the weaker
  // team home advantage in each pairing (team_1 is the home side).
  const teamStrength = new Map()
  if (shuffledTeams.length > 0) {
    const rows = await query(
      `SELECT id, level, league FROM team WHERE id IN (${shuffledTeams.map(() => '?').join(',')})`,
      shuffledTeams
    )
    if (Array.isArray(rows)) rows.forEach(r => teamStrength.set(r.id, r))
  }

  // Create next round matches
  for (let i = 0; i < shuffledTeams.length; i += 2) {
    const teamAId = shuffledTeams[i]
    const teamBId = shuffledTeams[i + 1]

    if (!teamAId || !teamBId) break

    const teamA = teamStrength.get(teamAId) ?? { id: teamAId }
    const teamB = teamStrength.get(teamBId) ?? { id: teamBId }
    const { home, away } = assignCupHomeAway(teamA, teamB)

    const game = new Game({
      team_1_id: home.id,
      team_2_id: away.id,
      season,
      game_day: nextGameDay,
      match_day: nextMatchDay,
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
  return {
    advanced: true,
    isComplete: false
  }
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
      'trophy',
      undefined,
      'success'
    )
  }

  console.log(`Cup winner: ${team.name} - Prize: ${CUP_PRIZE}€`)
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
      SELECT g.id           as id,
             g.game_day     as gameDay,
             g.match_day    as matchDay,
             g.season       as season,
             g.goals_team_1 as goalsTeam1,
             g.goals_team_2 as goalsTeam2,
             g.cup_round    as cupRound,
             g.played       as played,
             t1.name        as team1,
             t2.name        as team2,
             t1.short_name  as team1Short,
             t2.short_name  as team2Short,
             g.team_1_id    as team1Id,
             g.team_2_id    as team2Id,
             t1.color       as team1Color,
             t1.emblem      as team1Emblem,
             t2.color       as team2Color,
             t2.emblem      as team2Emblem,
             t1.user_id     as team1UserId,
             t2.user_id     as team2UserId,
             g.created_at   as playedAt
      FROM game g
               JOIN team t1 ON t1.id = g.team_1_id
               LEFT JOIN team t2 ON t2.id = g.team_2_id
      WHERE g.game_type = 'cup'
        AND g.season = ?
        AND (g.team_1_id = ? OR g.team_2_id = ?)
      ORDER BY g.cup_round ASC, g.game_day ASC
      LIMIT ?
  `, [season, teamId, teamId, limit])

  return games.reverse()
}

/**
 * Get cup results for a specific round
 * @param {number} season
 * @param {number} round - Cup round number (1=final, 2=semi, etc.)
 * @returns {Promise<Array>}
 */
export async function getCupResultsForRound (season, round) {
  const games = await query(`
      SELECT g.id           as id,
             g.game_day     as gameDay,
             g.season       as season,
             g.goals_team_1 as goalsTeam1,
             g.goals_team_2 as goalsTeam2,
             g.cup_round    as cupRound,
             g.played       as played,
             t1.name        as team1,
             t2.name        as team2,
             t1.short_name  as team1Short,
             t2.short_name  as team2Short,
             g.team_1_id    as team1Id,
             g.team_2_id    as team2Id,
             t1.color       as team1Color,
             t1.emblem      as team1Emblem,
             t2.color       as team2Color,
             t2.emblem      as team2Emblem,
             t1.user_id     as team1UserId,
             t2.user_id     as team2UserId
      FROM game g
               JOIN team t1 ON t1.id = g.team_1_id
               LEFT JOIN team t2 ON t2.id = g.team_2_id
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
      SELECT cup_round                           as round,
             MIN(game_day)                       as gameDay,
             MIN(played) = 1 AND MAX(played) = 1 as allPlayed,
             COUNT(*)                            as matchCount
      FROM game
      WHERE game_type = 'cup'
        AND season = ?
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
 * Get total number of cup rounds for a season from the database.
 * @param {number} season
 * @returns {Promise<number>}
 */
export async function getTotalRoundsForSeason (season) {
  const [result] = await query(
    'SELECT MAX(cup_round) as maxRound FROM game WHERE game_type=\'cup\' AND season=?',
    [season]
  )
  return getTotalRounds(result?.maxRound)
}

/**
 * Get seasons that have cup data
 * @returns {Promise<number[]>}
 */
export async function getCupSeasons () {
  const seasons = await query(`
      SELECT DISTINCT season
      FROM game
      WHERE game_type = 'cup'
      ORDER BY season DESC
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

  return orderBracketByPairings(bracket)
}

/**
 * Determine the winner team id of a cup game.
 * Returns null if the game is unplayed or has no winner yet.
 * Bye games (team2Id null) automatically advance team_1.
 * @param {Object} game
 * @returns {number|null}
 */
function getCupGameWinnerId (game) {
  if (game.team2Id == null) return game.team1Id
  if (typeof game.goalsTeam1 === 'number' && typeof game.goalsTeam2 === 'number') {
    if (game.goalsTeam1 > game.goalsTeam2) return game.team1Id
    if (game.goalsTeam2 > game.goalsTeam1) return game.team2Id
  }
  return null
}

/**
 * Reorder bracket games so two games from an earlier round visually align
 * with the follow-up game in the next round. Walks from the final outward,
 * placing each round's games in the order their winners feed into the
 * already-ordered next round.
 * @param {Object} bracket - keyed by cup_round
 * @returns {Object} bracket with reordered games arrays
 */
export function orderBracketByPairings (bracket) {
  const sortedRounds = Object.keys(bracket).map(Number).sort((a, b) => a - b)
  if (sortedRounds.length === 0) return bracket

  const ordered = {}
  const finalRound = sortedRounds[0]
  ordered[finalRound] = { ...bracket[finalRound], games: [...(bracket[finalRound].games || [])] }
  let currentOrder = ordered[finalRound].games

  for (let i = 1; i < sortedRounds.length; i++) {
    const round = sortedRounds[i]
    const games = [...(bracket[round].games || [])]
    const used = new Set()
    const newOrder = []

    for (const nextGame of currentOrder) {
      for (const teamId of [nextGame.team1Id, nextGame.team2Id]) {
        if (teamId == null) continue
        const feederIdx = games.findIndex((g, idx) => !used.has(idx) && getCupGameWinnerId(g) === teamId)
        if (feederIdx !== -1) {
          newOrder.push(games[feederIdx])
          used.add(feederIdx)
        }
      }
    }

    games.forEach((g, idx) => {
      if (!used.has(idx)) newOrder.push(g)
    })

    ordered[round] = { ...bracket[round], games: newOrder }
    currentOrder = newOrder
  }

  return ordered
}

/**
 * Send cup match result log messages to team owners
 * @param {GameType} game - The completed cup game
 * @param {Object} gameDetails - Game details including goals
 */
/**
 * Validate and progress any cup rounds that were played but never progressed.
 * This can be called at startup (prepareSeason) or after game day calculation.
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function validateAndProgressCupRounds (season) {
  // Fix unplayed cup games that are scheduled in the past
  const { gameDay: currentGameDay } = await getGameDayAndSeason()
  const pastCupGames = await query(
    'SELECT id, game_day FROM game WHERE game_type=\'cup\' AND season=? AND played=0 AND game_day < ?',
    [season, currentGameDay]
  )
  if (pastCupGames.length > 0) {
    const newGameDay = await findNextCupGameDay(season, currentGameDay + 1)
    await query(
      'UPDATE game SET game_day=? WHERE game_type=\'cup\' AND season=? AND played=0 AND game_day < ?',
      [newGameDay, season, currentGameDay]
    )
    console.log(`Cup fix-up: rescheduled ${pastCupGames.length} unplayed cup games from past game days to day ${newGameDay}`)
  }

  const rounds = await getCupRoundsForSeason(season)

  for (const round of rounds) {
    if (!round.played) continue

    // Check if this round has already been progressed by looking for next round games
    const nextRoundNumber = Math.floor(round.round / 2)
    if (nextRoundNumber >= 1) {
      const [{ count }] = await query(
        'SELECT COUNT(*) as count FROM game WHERE game_type=\'cup\' AND season=? AND cup_round=?',
        [season, nextRoundNumber]
      )
      if (count > 0) continue // Next round already exists
    } else {
      continue // round.round is 1 (the final) and it's played — cup is done
    }

    console.log(`Cup catch-up: round ${round.round} was played but never progressed, fixing now...`)
    const result = await progressCupRound(season, round.round)
    if (result.isComplete) {
      console.log('🏆 Cup is complete!')
    } else if (result.advanced) {
      console.log(`Cup round ${round.round} complete, advanced to next round`)
    }
  }
}

export async function sendCupMatchLogMessages (game, gameDetails) {
  // Bye games have no team_2 — no log messages needed
  if (game.team_2_id == null) return

  const [[team1], [team2]] = await Promise.all([
    query('SELECT * FROM team WHERE id=?', [game.team_1_id]),
    query('SELECT * FROM team WHERE id=?', [game.team_2_id])
  ])

  const goalsTeam1 = gameDetails.goalsTeamA
  const goalsTeam2 = gameDetails.goalsTeamB

  // Determine winner and loser
  const team1Won = goalsTeam1 > goalsTeam2
  const isDraw = goalsTeam1 === goalsTeam2
  const winnerTeam = team1Won ? team1 : (goalsTeam2 > goalsTeam1 ? team2 : null)

  // Calculate round prize (25k for first round, doubles each round)
  let roundPrize = 0
  if (winnerTeam) {
    const [{ maxRound }] = await query(
      'SELECT MAX(cup_round) as maxRound FROM game WHERE season=? AND game_type=\'cup\'',
      [game.season]
    )
    if (maxRound) {
      roundPrize = getCupRoundPrize(game.cup_round, maxRound)
      const locale = await getUserLocale(winnerTeam.user_id)
      const reason = t('finance.cupRoundPrize', {}, locale)
      await updateTeamBalance(winnerTeam, roundPrize, reason, game.game_day, game.season)
    }
  }

  // Pick the right message key based on how the match was decided:
  // penalty shootout > extra time > regular.
  const penalties = gameDetails.penaltyShootout
  const extraTime = gameDetails.extraTime
  const winKey = penalties ? 'log.cupMatchWinPenalties' : extraTime ? 'log.cupMatchWinExtraTime' : 'log.cupMatchWin'
  const lossKey = penalties ? 'log.cupMatchLossPenalties' : extraTime ? 'log.cupMatchLossExtraTime' : 'log.cupMatchLoss'

  // Send messages to team owners
  for (const [team, isTeam1] of [[team1, true], [team2, false]]) {
    if (!team.user_id) continue

    const locale = await getUserLocale(team.user_id)
    const myGoals = isTeam1 ? goalsTeam1 : goalsTeam2
    const theirGoals = isTeam1 ? goalsTeam2 : goalsTeam1
    const opponent = isTeam1 ? team2.name : team1.name
    const won = isTeam1 ? team1Won : !team1Won

    const params = {
      opponent,
      goalsFor: myGoals,
      goalsAgainst: theirGoals
    }
    if (penalties) {
      params.penaltiesFor = isTeam1 ? penalties.goalsTeamA : penalties.goalsTeamB
      params.penaltiesAgainst = isTeam1 ? penalties.goalsTeamB : penalties.goalsTeamA
    }

    if (isDraw) {
      // Should not happen — extra time + penalties always produce a winner.
      // Keep this as a safety fallback so a malformed game still surfaces something.
      await addLogMessage(
        t('log.cupMatchDraw', params, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy',
        undefined,
        'info'
      )
    } else if (won) {
      await addLogMessage(
        t(winKey, { ...params, prize: roundPrize.toLocaleString() + '€' }, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy',
        undefined,
        'success'
      )
    } else {
      await addLogMessage(
        t(lossKey, params, locale),
        team,
        'OPEN_GAME',
        game.id,
        'trophy',
        undefined,
        'danger'
      )
    }
  }
}
