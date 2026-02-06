import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTeam } from '../helper/teamHelper.js'
import { getNewsByLeague } from '../helper/newsHelper.js'
import { getLocaleFromRequest } from '../i18n/index.js'

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
    let newsGameDay = gameDay - 1
    let newsSeason = season

    // On first game day of a new season, show last game day from previous season
    if (newsGameDay < 0 && season > 0) {
      newsSeason = season - 1
      const [lastGame] = await query(
        'SELECT MAX(game_day) as lastGameDay FROM game WHERE season = ?',
        [newsSeason]
      )
      newsGameDay = lastGame?.lastGameDay ?? 0
    }

    // For very first game ever, no news yet
    if (newsGameDay < 0) {
      return { gameDay: 0, season, news: [], teams: [], players: [] }
    }

    const locale = getLocaleFromRequest(req)
    const news = await getNewsByLeague(newsGameDay, newsSeason, team.level, team.league, locale)

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
      season: newsSeason,
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
   * @param {Request} req
   * @returns {Promise<NewsResponse>}
   */
  async getNewsForGameDay (gameDay, season, level, league, req) {
    const locale = getLocaleFromRequest(req)
    const news = await getNewsByLeague(gameDay, season, level, league, locale)

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
