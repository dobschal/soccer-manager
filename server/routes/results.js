import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'

export default {

  /**
   * @returns {Promise<{date: Date}>}
   */
  async getNextGameDate () {
    const d = new Date()
    d.setHours(12)
    d.setMinutes(0)
    d.setSeconds(0)
    if (Date.now() > d.getTime()) { // afternoon
      d.setHours(23)
      d.setMinutes(59)
      d.setSeconds(59)
    }
    return { date: d }
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
    `, [tilGameDay, season, level ?? team.level, league ?? team.league])
  },

  /**
   * @returns {Promise<{season: number, gameDay: number}>}
   */
  async getCurrentGameday () {
    return await getGameDayAndSeason()
  },

  /**
   * Get the next upcoming game for the user's team
   * @param {Request} req
   * @returns {Promise<{game: GameResultType|null, nextGameDate: Date, opponent: object|null}>}
   */
  async getNextGame (req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()

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
      return { game: null, nextGameDate: null, opponent: null }
    }

    const game = games[0]
    const opponentId = game.team1Id === team.id ? game.team2Id : game.team1Id
    const [opponent] = await query('SELECT * FROM team WHERE id = ?', [opponentId])

    // Calculate next game date
    const d = new Date()
    d.setHours(12)
    d.setMinutes(0)
    d.setSeconds(0)
    if (Date.now() > d.getTime()) {
      d.setHours(23)
      d.setMinutes(59)
      d.setSeconds(59)
    }

    return { game, nextGameDate: d, opponent }
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
        WHERE g.game_day = ?
          AND g.season = ?
          AND g.level = ?
          AND g.league = ?
    `, [gameDay, season, level ?? team.level, league ?? team.league])
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
      })
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
    const t1 = Date.now()
    const games = await query(
      `
          SELECT *
          FROM game g
          WHERE g.game_day <= ?
            AND g.season = ?
            AND g.level = ?
            AND g.league = ?
            AND g.played = 1
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
    console.log('Calculate standing in ' + (Date.now() - t1) + 'ms')
    return standing
  }
}
