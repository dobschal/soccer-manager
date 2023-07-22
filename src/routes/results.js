import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'

export default {

  async nextGameDate () {
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

  async getResults (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const results = await query(`
      SELECT 
        g.goals_team_1 as goalsTeam1, 
        g.goals_team_2 as goalsTeam2, 
        t1.name as team1,  
        t2.name as team2,
        g.team_1_id as team1Id,
        g.team_2_id as team2Id,
        g.details as details
      FROM game g
      JOIN team t1 ON t1.id=g.team_1_id
      JOIN team t2 ON t2.id=g.team_2_id
      WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=?
    `, [req.body.gameDay, req.body.season, req.body.level ?? team.level, req.body.league ?? team.league])
    return { results }
  },

  async getCurrentGameday () {
    const [{ season, game_day: gameDay }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
    return { season, gameDay }
  },

  async getStanding (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const teams = await query('SELECT * FROM team')
    const games = await query(
      `SELECT * FROM game g 
      WHERE g.game_day<=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1`,
      [req.body.gameDay, req.body.season, req.body.level ?? team.level, req.body.league ?? team.league]
    )
    return calculateStanding(games, teams.filter(t => games.some(g => g.team_1_id === t.id || g.team_2_id === t.id)))
  }
}
