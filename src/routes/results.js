import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'

export default {

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
   * @typedef {Object} GameResultType
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
  async getSeasonResults_V2 (season, tilGameDay, level, league, req) {
    const team = await getTeam(req)
    return await query(`
      SELECT
        g.id as id,
        g.game_day as gameDay,
        g.season as season,
        g.goals_team_1 as goalsTeam1, 
        g.goals_team_2 as goalsTeam2, 
        t1.name as team1,  
        t2.name as team2,
        g.team_1_id as team1Id,
        g.team_2_id as team2Id,
        g.details as details,
        g.created_at as created_at
      FROM game g
      JOIN team t1 ON t1.id=g.team_1_id
      JOIN team t2 ON t2.id=g.team_2_id
      WHERE g.game_day<=? AND g.season=? AND g.level=? AND g.league=? AND played=1
    `, [tilGameDay, season, level ?? team.level, league ?? team.league])
  },

  async getResults (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const results = await query(`
      SELECT
        g.id as id,
        g.goals_team_1 as goalsTeam1, 
        g.goals_team_2 as goalsTeam2, 
        t1.name as team1,  
        t2.name as team2,
        g.team_1_id as team1Id,
        g.team_2_id as team2Id,
        g.details as details,
        g.created_at as created_at
      FROM game g
      JOIN team t1 ON t1.id=g.team_1_id
      JOIN team t2 ON t2.id=g.team_2_id
      WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=?
    `, [req.body.gameDay, req.body.season, req.body.level ?? team.level, req.body.league ?? team.league])
    return { results }
  },

  /**
   * @param req
   * @returns {Promise<{result: { id: number, details: string, team1Id: number, team2Id: number, team1: TeamType, team2: TeamType, goalsTeam1: number, goalsTeam2: number}}>}
   */
  async getResult (req) {
    const results = await query(`
      SELECT
        g.id as id,
        g.goals_team_1 as goalsTeam1, 
        g.goals_team_2 as goalsTeam2, 
        t1.name as team1,  
        t2.name as team2,
        g.team_1_id as team1Id,
        g.team_2_id as team2Id,
        g.details as details,
        g.created_at as created_at
      FROM game g
      JOIN team t1 ON t1.id=g.team_1_id
      JOIN team t2 ON t2.id=g.team_2_id
      WHERE g.id=?
    `, [req.body.id])
    if (results.length === 0) throw new BadRequestError('Game not found')
    return { result: results[0] }
  },

  async getCurrentGameday () {
    return await getGameDayAndSeason()
  },

  /**
   * @returns {Promise<Array<StandingType>>}
   */
  async getStanding (req) {
    const team = await getTeam(req)
    const level = req.body.level ?? team.level
    const league = req.body.league ?? team.league
    const t1 = Date.now()
    /** @type {GameType[]} */
    const games = await query(
      `
        SELECT * FROM game g 
        WHERE g.game_day<=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1
      `,
      [
        req.body.gameDay,
        req.body.season,
        level,
        league
      ]
    )
    /** @type {TeamType[]} */
    let teams = []
    if (games.length > 0) {
      const teamIds = new Set()
      games.forEach(game => {
        teamIds.add(game.team_1_id)
        teamIds.add(game.team_2_id)
      })
      teams = await query(`SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`)
    } else {
      teams = await query('SELECT * FROM team WHERE level=? AND league=?', [level, league])
    }
    const standing = calculateStanding(games, teams)
    console.log('Calculate standing in ' + (Date.now() - t1) + 'ms')
    return standing
  }
}
