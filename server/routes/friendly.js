import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getUserLocale, t } from '../i18n/index.js'
import { updateTeamBalance } from '../helper/financeHelper.js'
import { kickoff, playGameStep } from '../play-game.js'

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

  kickoff(activePlayerTeamA, activePlayerTeamB, gameDetails)
  const overtime = Math.floor(Math.random() * 50)
  for (let minute = 0; minute < 900 + overtime; minute++) {
    playGameStep(activePlayerTeamA, activePlayerTeamB, gameDetails)
  }

  // Friendly matches cost half the freshness of league games (no card persistence)
  const freshnessLossByStyle = {
    aggressive: 0.065,
    normal: 0.05,
    friendly: 0.04
  }
  for (const player of activePlayerTeamA) {
    const playStyle = teamA.play_style || 'normal'
    const freshnessLoss = player.position === 'GK' ? 0.04 : freshnessLossByStyle[playStyle]
    player.freshness = Math.max(0, player.freshness - freshnessLoss)
    await query('UPDATE player SET freshness=? WHERE id=?', [player.freshness, player.id])
  }
  // Opponent team does NOT lose freshness in friendly matches (they didn't choose to play)

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
    const priceFactor = (15 / price) ** 2
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

