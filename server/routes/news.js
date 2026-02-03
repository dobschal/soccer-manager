import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTeam } from '../helper/teamHelper.js'
import { getNewsByLeague } from '../helper/newsHelper.js'

export default {

  /**
   * @typedef {object} NewsResponse
   * @property {number} gameDay
   * @property {number} season
   * @property {Array<NewsType>} news
   * @property {Array<TeamType>} teams
   * @property {Array<PlayerType>} players
   */

  /**
   * Get league news filtered by current game day, season, and user's league
   * @param {Request} req
   * @returns {Promise<NewsResponse>}
   */
  async getLeagueNews (req) {
    const { gameDay, season } = await getGameDayAndSeason()
    const team = await getTeam(req)

    // Get news for the previous game day (current day's games may not have been processed yet)
    const newsGameDay = gameDay > 1 ? gameDay - 1 : gameDay

    const news = await getNewsByLeague(newsGameDay, season, team.level, team.league)

    // Collect related teams and players for rendering
    const teamIds = new Set()
    const playerIds = new Set()

    for (const item of news) {
      if (item.team_id) teamIds.add(item.team_id)
      if (item.player_id) playerIds.add(item.player_id)
    }

    let teams = []
    if (teamIds.size > 0) {
      teams = await query(`SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`)
    }

    let players = []
    if (playerIds.size > 0) {
      players = await query(`SELECT * FROM player WHERE id IN (${[...playerIds].join(', ')})`)
      // Also get team info for players
      const playerTeamIds = players.map(p => p.team_id).filter(id => id && !teamIds.has(id))
      if (playerTeamIds.length > 0) {
        const playerTeams = await query(`SELECT * FROM team WHERE id IN (${playerTeamIds.join(', ')})`)
        teams = [...teams, ...playerTeams]
      }
    }

    return {
      gameDay: newsGameDay,
      season,
      news,
      teams,
      players
    }
  },

  /**
   * Get news for a specific game day
   * @param {number} gameDay
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @returns {Promise<NewsResponse>}
   */
  async getNewsForGameDay (gameDay, season, level, league) {
    const news = await getNewsByLeague(gameDay, season, level, league)

    const teamIds = new Set()
    const playerIds = new Set()

    for (const item of news) {
      if (item.team_id) teamIds.add(item.team_id)
      if (item.player_id) playerIds.add(item.player_id)
    }

    let teams = []
    if (teamIds.size > 0) {
      teams = await query(`SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`)
    }

    let players = []
    if (playerIds.size > 0) {
      players = await query(`SELECT * FROM player WHERE id IN (${[...playerIds].join(', ')})`)
      const playerTeamIds = players.map(p => p.team_id).filter(id => id && !teamIds.has(id))
      if (playerTeamIds.length > 0) {
        const playerTeams = await query(`SELECT * FROM team WHERE id IN (${playerTeamIds.join(', ')})`)
        teams = [...teams, ...playerTeams]
      }
    }

    return {
      gameDay,
      season,
      news,
      teams,
      players
    }
  }
}
