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
        g.team_1_id as team1Id,
        g.team_2_id as team2Id,
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
  },

  async getStanding (req) {
    const [team] = await query('SELECT * FROM team WHERE user_id=?', [req.user.id])
    const teams = await query(
      'SELECT * FROM team WHERE league=? AND level=?',
      [team.league, team.level]
    )
    const games = await query(
      `SELECT * FROM game g 
      WHERE g.game_day<=? AND g.season=? AND g.level=? AND g.league=? AND g.played=1`,
      [req.body.gameDay, req.body.season, team.level, team.league]
    )
    const standing = {}
    for (const game of games) {
      standing[game.team_1_id] = standing[game.team_1_id] ??
        { games: 0, points: 0, goals: 0, against: 0, team: teams.find(t => t.id === game.team_1_id) }
      standing[game.team_2_id] = standing[game.team_2_id] ??
        { games: 0, points: 0, goals: 0, against: 0, team: teams.find(t => t.id === game.team_2_id) }
      if (game.goals_team_1 > game.goals_team_2) {
        standing[game.team_1_id].points += 3
      } else if (game.goals_team_1 < game.goals_team_2) {
        standing[game.team_2_id].points += 3
      } else {
        standing[game.team_1_id].points += 1
        standing[game.team_2_id].points += 1
      }
      standing[game.team_1_id].goals += game.goals_team_1
      standing[game.team_2_id].goals += game.goals_team_2
      standing[game.team_1_id].against += game.goals_team_2
      standing[game.team_2_id].against += game.goals_team_1
      standing[game.team_1_id].games++
      standing[game.team_2_id].games++
    }
    return Object.values(standing)
  }
}
