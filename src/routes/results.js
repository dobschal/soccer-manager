import { query } from '../lib/database.js'

export default {

  async getResults (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const results = await query(`
      SELECT 
        g.goals_team_1 as goalsTeam1, 
        g.goals_team_2 as goalsTeam2, 
        t1.name as team1,  
        t2.name as team2,
        g.details as details
      FROM game g
      JOIN team t1 ON t1.id=g.team_1_id
      JOIN team t2 ON t2.id=g.team_2_id
      WHERE g.game_day=? AND g.season=? AND g.level=? AND g.league=?
    `, [req.body.gameDay, req.body.season, team.level, team.league])
    return { results }
  },

  async getCurrentGameday () {
    const [{ season, game_day: gameDay }] = await query('SELECT * FROM game WHERE played=0 ORDER BY season ASC, game_day ASC LIMIT 1')
    return { season, gameDay }
  }
}
