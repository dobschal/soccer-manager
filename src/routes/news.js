import { getTeam, getTeamById } from '../helper/teamHelper.js'
import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getPlayerById } from '../helper/playerHelper.js'
import { euroFormat } from '../../client/util/currency.js'
import { randomItem } from '../lib/util.js'

const texts = {
  transfer: [{
    title: 'Record-breaking Transfer Sees {playerName} Join {toTeam} for {price}',
    text: 'In a groundbreaking deal that has shattered previous transfer records, {fromTeam}\' star player {playerName} has completed a historic move to {toTeam} for an eye-popping sum of {price}. The soccer world is buzzing with excitement and disbelief at the magnitude of this transfer fee. This move not only solidifies {playerName}\'s status as one of the most sought-after talents but also underlines {toTeam}\'s commitment to assembling a championship-caliber team. Fans are eager to witness how {playerName}\'s exceptional skills will mesh with {toTeam}\'s style of play, making this one of the most anticipated pairings of the upcoming season.'
  }, {
    title: ' {playerName}\'s Shocking Transfer to {toTeam}: A Bargain at {price}',
    text: 'In a jaw-dropping twist, {fromTeam}\' beloved {playerName} has switched sides to join {toTeam} for a mere {price}. Analysts are calling this move one of the biggest bargains in recent soccer history, given {playerName}\'s reputation as a top-tier player. As {fromTeam}\' faithful come to terms with the departure of their talisman, {toTeam}\'s supporters are rejoicing at the prospect of having {playerName} bolster their ranks at such an affordable price. This transfer has ignited debates about valuation in the soccer market, and all eyes will be on {playerName}\'s performances as he takes to the field in {toTeam}\'s colors.'
  }, {
    title: '{playerName}\'s Mega Move: {fromTeam} Sells Star Player to {toTeam} for {price}',
    text: '{fromTeam} FC has bid farewell to their star player {playerName}, who has embarked on a new journey with {toTeam}, all for the nominal fee of {price}. This unexpected move has left fans on both sides in awe, questioning the rationale behind such a seemingly low transfer amount for a player of {playerName}\'s caliber. {toTeam}\'s management, however, sees this as a strategic coup, bringing in a world-class talent at a fraction of the usual cost. As the soccer community debates the implications of this transfer, {playerName}\'s performance at {toTeam} will undoubtedly be under the microscope as he adapts to his new surroundings.'
  }, {
    title: '{toTeam} Lands {playerName} from {fromTeam} for {price} in Sensational Transfer',
    text: '{toTeam} has pulled off a transfer coup by securing the services of {playerName} from {fromTeam} for a remarkably modest sum of {price}. This unexpected move has caught the soccer world off guard, prompting speculation about the behind-the-scenes negotiations that led to such an affordable deal. {toTeam}\'s management has expressed their delight at adding {playerName} to their roster, believing his skills will be a perfect fit for their squad. Meanwhile, {fromTeam}\' fans are left reflecting on the departure of their star player and the implications for their team\'s performance in the upcoming season.'
  }, {
    title: '{playerName}\'s Transfer Saga: {fromTeam} to {toTeam} for {price}',
    text: 'The much-anticipated transfer of {playerName} from {fromTeam} to {toTeam} has been finalized for a transfer fee of just {price}. This move has sparked widespread discussion, with pundits and fans alike debating the value of such a transfer for a player of {playerName}\'s stature. While some view it as a steal for {toTeam}, others question {fromTeam}\' decision to let go of their key asset for such a nominal amount. As {playerName} settles into his new environment under the guidance of {toTeam}\'s management, the soccer community eagerly awaits the impact he will make on the pitch in his new team\'s colors.'
  }]
}

export default {
  //
  // TODO: Rename this
  //
  async getLogMessages (req) {
    const team = await getTeam(req)
    const messages = await query('SELECT * FROM news WHERE team_id=?', [team.id])
    return { messages }
  },

  /**
   * @typedef {Object} NewsArticle
   * @property {string} title
   * @property {string} text
   * @property {number} [playerId]
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
    const { gameDay, season } = await getGameDayAndSeason()
    const results = await query('SELECT * FROM trade_history WHERE season=? AND game_day=? ORDER BY price DESC LIMIT 1', [season, gameDay])
    if (results.length > 0) {
      /** @type {TradeHistoryType} */
      const tradeHistory = results[0]
      const player = await getPlayerById(tradeHistory.player_id)
      const newTeam = await getTeamById(tradeHistory.to_team_id)
      const oldTeam = await getTeamById(tradeHistory.from_team_id)
      let { title, text } = randomItem(texts.transfer)
      title = title.replaceAll('{playerName}', player.name)
      text = text.replaceAll('{playerName}', player.name)
      title = title.replaceAll('{fromTeam}', oldTeam.name)
      text = text.replaceAll('{fromTeam}', oldTeam.name)
      title = title.replaceAll('{toTeam}', newTeam.name)
      text = text.replaceAll('{toTeam}', newTeam.name)
      title = title.replaceAll('{price}', euroFormat.format(tradeHistory.price))
      text = text.replaceAll('{price}', euroFormat.format(tradeHistory.price))
      news.push({ title, text, playerId: player.id })
    }
    return { news }
  }
}
