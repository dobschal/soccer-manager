import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getPlayerById } from '../helper/playerHelper.js'
import { euroFormat } from '../../client/util/currency.js'

export default {
  //
  // TODO: Renam this
  //
  async getNews (req) {
    const team = await getTeam(req)
    const news = await query('SELECT * FROM news WHERE team_id=?', [team.id])
    return { news }
  },

  /**
   * @typedef {Object} NewsArticle
   * @property {string} title
   * @property {string} text
   *
   * Collect information to write some nice news articles about:
   * * most expensive trade (/)
   * * highest win
   * * team new in the relegation places
   * * team new in the promotion places
   * * level up history
   * * new top scorer
   * @param {Request} req
   * @returns {Promise<NewsArticle[]>}
   */
  async getLeagueNews (req) {
    const news = []
    const team = await getTeam(req)
    const { gameDay, season } = await getGameDayAndSeason()
    const results = await query('SELECT * FROM trade_history WHERE season=? AND game_day=? ORDER BY price DESC LIMIT 1', [season, gameDay])
    if (results.length > 0) {
      /** @type {TradeHistoryType} */
      const tradeHistory = results[0]
      const player = await getPlayerById(tradeHistory.player_id)
      const newTeam = await getTeamById(tradeHistory.to_team_id)
      const oldTeam = await getTeamById(tradeHistory.from_team_id)
      const title = 'The new top transfer of today!'
      const text = `${oldTeam.name} agreed on letting ${player.name} go. Coach of ${oldTeam.name} said: "We are sure he will make his way. All luck for the future.". ${newTeam.name} is paying ${euroFormat.format(tradeHistory.price)} for the talented boy to join the team.`
      news.push({ title, text })
    }
    return { news }
  }
}
