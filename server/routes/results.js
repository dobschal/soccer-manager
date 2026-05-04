import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getCachedStanding, saveStandingToCache } from '../helper/standingHelper.js'
import { CACHE_NAMESPACES, cacheKey, getCached } from '../lib/cache.js'
import { getTopScorers as getTopScorersFromCache } from '../helper/playerStatsHelper.js'
import { getTeamStatsFromCache } from '../helper/teamStatsHelper.js'
import { getSeenGameIds, markGameAsSeen as markGameAsSeenInDb } from '../helper/seenGameHelper.js'

export default {

  /**
   * Returns the date of the team's next game. If the team has no game on the
   * immediate next game tick (e.g. cup day and team is eliminated), isRestDay is true.
   * @param {Request} [req]
   * @returns {Promise<{date: Date, isRestDay: boolean}>}
   */
  async getNextGameDate (req) {
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }

    if (!req?.user) return { date: nextTick, isRestDay: false }

    try {
      const team = await getTeam(req)
      const { gameDay: currentGameDay, season } = await getGameDayAndSeason()

      const [nextGame] = await query(
        'SELECT game_day FROM game WHERE played=0 AND season=? AND (team_1_id=? OR team_2_id=?) ORDER BY game_day ASC LIMIT 1',
        [season, team.id, team.id]
      )

      if (!nextGame) return { date: nextTick, isRestDay: false }

      const dayOffset = nextGame.game_day - currentGameDay
      const nextGameDate = new Date(nextTick.getTime() + dayOffset * 12 * 60 * 60 * 1000)
      return { date: nextGameDate, isRestDay: dayOffset > 0 }
    } catch {
      return { date: nextTick, isRestDay: false }
    }
  },

  /**
   * @typedef {object} GameResultType
   * @property {number} id,
   * @property {number} gameDay,
   * @property {number} season,
   * @property {number} goalsTeam1,
   * @property {number} goalsTeam2,
   * @property {string} team1,
   * @property {string} team2,
   * @property {number} team1Id,
   * @property {number} team2Id,
   * @property {string} details,
   * @property {string} created_at
   */

  /**
   * @param {number} season
   * @param {number} tilGameDay
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<GameResultType[]>}
   */
  async getSeasonResults (season, tilGameDay, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const key = cacheKey(CACHE_NAMESPACES.SEASON_RESULTS, season, tilGameDay, actualLevel, actualLeague)

    return getCached(key, async () => {
      return await query(`
          SELECT g.id           as id,
                 g.game_day     as gameDay,
                 g.season       as season,
                 g.goals_team_1 as goalsTeam1,
                 g.goals_team_2 as goalsTeam2,
                 t1.name        as team1,
                 t2.name        as team2,
                 g.team_1_id    as team1Id,
                 g.team_2_id    as team2Id,
                 g.details      as details,
                 g.created_at   as created_at
          FROM game g
                   JOIN team t1 ON t1.id = g.team_1_id
                   JOIN team t2 ON t2.id = g.team_2_id
          WHERE g.game_day <= ?
            AND g.season = ?
            AND g.level = ?
            AND g.league = ?
            AND played = 1
            AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, [tilGameDay, season, actualLevel, actualLeague])
    })
  },

  /**
   * @returns {Promise<{season: number, gameDay: number}>}
   */
  async getCurrentGameday () {
    const current = await getGameDayAndSeason()
    // Find the last played league game day (for results page default)
    const [lastPlayed] = await query(
      "SELECT game_day, season FROM game WHERE played=1 AND (game_type='league' OR game_type IS NULL) ORDER BY season DESC, game_day DESC LIMIT 1"
    )
    if (lastPlayed) {
      current.lastPlayedLeagueGameDay = lastPlayed.game_day
      current.lastPlayedLeagueSeason = lastPlayed.season
    }
    return current
  },

  /**
   * Get recent played games and upcoming games for the user's team (for dashboard slider)
   * @param {number} pastCount - Number of past games to fetch
   * @param {number} upcomingCount - Number of upcoming games to fetch
   * @param {Request} req
   * @returns {Promise<{pastGames: Array, upcomingGames: Array, nextGameDate: Date}>}
   */
  async getGamesForSlider (pastCount, upcomingCount, req) {
    const team = await getTeam(req)
    const { season, gameDay: currentGameDay } = await getGameDayAndSeason()

    // Get past played games for this team
    const pastGames = await query(`
        SELECT g.id           as id,
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
               g.created_at   as playedAt
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 1
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type = 'league' OR g.game_type IS NULL)
        ORDER BY g.game_day DESC
        LIMIT ?
    `, [season, team.id, team.id, pastCount])

    // Get upcoming unplayed games for this team
    const upcomingGames = await query(`
        SELECT g.id           as id,
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
               t2.emblem      as team2Emblem
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 0
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type = 'league' OR g.game_type IS NULL)
        ORDER BY g.game_day ASC
        LIMIT ?
    `, [season, team.id, team.id, upcomingCount])

    // Calculate next game date (games happen at noon and midnight)
    const nextGameDate = new Date()
    nextGameDate.setHours(12)
    nextGameDate.setMinutes(0)
    nextGameDate.setSeconds(0)
    if (Date.now() > nextGameDate.getTime()) {
      nextGameDate.setHours(23)
      nextGameDate.setMinutes(59)
      nextGameDate.setSeconds(59)
    }

    // Calculate game dates for upcoming games based on offset from current game day
    // Each game day is 12 hours apart (one cron tick)
    const upcomingGamesWithDates = upcomingGames.map((game) => {
      const gameDate = new Date(nextGameDate)
      const dayOffset = game.gameDay - currentGameDay
      gameDate.setTime(gameDate.getTime() + dayOffset * 12 * 60 * 60 * 1000)
      return {
        ...game,
        gameDate
      }
    })

    const orderedPastGames = pastGames.reverse() // Oldest first
    const seenIds = await getSeenGameIds(team.id, orderedPastGames.map(g => g.id))
    const pastGamesWithSeen = orderedPastGames.map(g => ({ ...g, seen: seenIds.has(g.id) }))

    return {
      pastGames: pastGamesWithSeen,
      upcomingGames: upcomingGamesWithDates,
      nextGameDate
    }
  },

  /**
   * Mark a game as seen by the current user's team. Idempotent.
   * @param {number} gameId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async markGameAsSeen (gameId, req) {
    if (!req?.user) throw new UnauthorizedError('Not authorized')
    if (!gameId) throw new BadRequestError('gameId required')
    const team = await getTeam(req)
    await markGameAsSeenInDb(team.id, gameId)
    return { success: true }
  },

  /**
   * Get the next upcoming game for the user's team
   * @param {Request} req
   * @returns {Promise<{game: GameResultType|null, nextGameDate: Date, opponent: object|null}>}
   */
  async getNextGame (req) {
    const team = await getTeam(req)
    const { season, gameDay: currentGameDay } = await getGameDayAndSeason()

    // Get the next unplayed game for this team
    const games = await query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.season       as season,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 0
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
        ORDER BY g.game_day ASC
        LIMIT 1
    `, [season, team.id, team.id])

    if (games.length === 0) {
      return {
        game: null,
        nextGameDate: null,
        opponent: null
      }
    }

    const game = games[0]
    const opponentId = game.team1Id === team.id ? game.team2Id : game.team1Id
    const [opponent] = await query('SELECT * FROM team WHERE id = ?', [opponentId])

    // Calculate next game date based on offset from current game day
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }
    const dayOffset = game.gameDay - currentGameDay
    const nextGameDate = new Date(nextTick.getTime() + dayOffset * 12 * 60 * 60 * 1000)

    return {
      game,
      nextGameDate,
      opponent
    }
  },

  /**
   * @param {number} gameDay
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{results: GameResultType[]}>}
   */
  async getResults (gameDay, season, level, league, req) {
    const team = await getTeam(req)
    const [results, cupCheck] = await Promise.all([
      query(`
        SELECT g.id           as id,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.game_day     as gameDay,
               g.season       as season,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               g.details      as details,
               g.created_at   as created_at
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.game_day = ?
          AND g.season = ?
          AND g.level = ?
          AND g.league = ?
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, [gameDay, season, level ?? team.level, league ?? team.league]),
      query(
        "SELECT cup_round FROM game WHERE game_day = ? AND season = ? AND game_type = 'cup' LIMIT 1",
        [gameDay, season]
      )
    ])
    // Extract only needed fields from details to reduce payload size
    return {
      results: results.map(r => {
        const details = r.details ? JSON.parse(r.details) : {}
        return {
          ...r,
          strengthTeamA: details.strengthTeamA,
          strengthTeamB: details.strengthTeamB,
          details: undefined
        }
      }),
      isCupGameDay: cupCheck.length > 0,
      cupRound: cupCheck.length > 0 ? cupCheck[0].cup_round : null
    }
  },

  /**
   * @param {number} gameId
   * @returns {Promise<{result: GameResultType}>}
   */
  async getResult (gameId) {
    const results = await query(`
        SELECT g.id           as id,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.game_day     as gameDay,
               g.season       as season,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               g.details      as details,
               g.created_at   as created_at
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.id = ?
    `, [gameId])
    if (results.length === 0) throw new BadRequestError('Game not found')
    return { result: results[0] }
  },

  /**
   * @param {number} gameDay
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<Array<StandingType>>}
   */
  async getStanding (gameDay, season, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    // Try to get cached standing first
    const cached = await getCachedStanding(gameDay, season, actualLevel, actualLeague)
    if (cached) {
      // Refresh team display data (name, emblem, color) from database
      const teamIds = cached.filter(s => s.team?.id).map(s => s.team.id)
      if (teamIds.length > 0) {
        const freshTeams = await query(`SELECT id, name, emblem, color
                                        FROM team
                                        WHERE id IN (${teamIds.join(', ')})`)
        const teamMap = Object.fromEntries(freshTeams.map(t => [t.id, t]))
        for (const entry of cached) {
          const fresh = entry.team?.id ? teamMap[entry.team.id] : null
          if (fresh) {
            entry.team.name = fresh.name
            entry.team.emblem = fresh.emblem
            entry.team.color = fresh.color
          }
        }
      }
      return cached
    }

    // Calculate standing if not cached (for historical data or edge cases)
    const games = await query(
      `
          SELECT *
          FROM game g
          WHERE g.game_day <= ?
            AND g.season = ?
            AND g.level = ?
            AND g.league = ?
            AND g.played = 1
            AND (g.game_type = 'league' OR g.game_type IS NULL)
      `,
      [gameDay, season, actualLevel, actualLeague]
    )
    let teams = []
    if (games.length > 0) {
      const teamIds = new Set()
      games.forEach(game => {
        teamIds.add(game.team_1_id)
        teamIds.add(game.team_2_id)
      })
      teams = await query(`SELECT *
                           FROM team
                           WHERE id IN (${[...teamIds].join(', ')})`)
    } else {
      teams = await query('SELECT * FROM team WHERE level=? AND league=?', [actualLevel, actualLeague])
    }
    const standing = calculateStanding(games, teams)

    // Cache the calculated standing for future requests
    if (games.length > 0) {
      await saveStandingToCache(gameDay, season, actualLevel, actualLeague, standing)
    }

    return standing
  },

  /**
   * Get top scorers for a league from cached stats
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {number} limit
   * @param {Request} [req]
   * @returns {Promise<{topScorers: Array}>}
   */
  async getTopScorers (season, level, league, limit = 10, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const topScorers = await getTopScorersFromCache(season, actualLevel, actualLeague, limit)
    return { topScorers }
  },

  /**
   * Get suspended players for a league
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{suspendedPlayers: Array}>}
   */
  /**
   * Get team statistics for all teams in a league on a given game day
   * @param {number} gameDay
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{teamStats: Array}>}
   */
  async getTeamStats (gameDay, season, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league
    const stats = await getTeamStatsFromCache(gameDay, season, actualLevel, actualLeague)
    return { teamStats: stats }
  },

  async getInjuredPlayers (level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const injuredPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE t.level = ?
          AND t.league = ?
          AND p.is_injured = 1
        ORDER BY t.name, p.name
    `, [actualLevel, actualLeague])

    return {
      injuredPlayers: injuredPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  },

  async getSuspendedPlayers (level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const suspendedPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE t.level = ?
          AND t.league = ?
          AND p.is_suspended = 1
        ORDER BY t.name, p.name
    `, [actualLevel, actualLeague])

    return {
      suspendedPlayers: suspendedPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  }
}
