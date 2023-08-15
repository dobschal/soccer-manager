import { server } from '../lib/gateway.js'
import { renderAsync } from '../lib/renderAsync.js'
import { renderPlayerImage } from './playerImage.js'

export const renderNews = renderAsync(async () => {
  const { news } = await server.getLeagueNews()
  return `
    <h3>News</h3>
    ${news.map(_renderNewsItem).join('')}
  `
})

const _renderNewsItem = renderAsync(
  /**
 * @param {Function} update
 * @param {NewsArticle} newsItem
 * @returns {string}
 * @private
 */
  async (update, newsItem) => {
    let image = ''
    if (newsItem.playerId) {
      const player = await server.getPlayerById_V2(newsItem.playerId)
      const { team } = await server.getTeam({ teamId: player.team_id })
      image = await renderPlayerImage(player, team, 100)
    }
    return `
    <div class="article">    
        ${image}
        <h4>${newsItem.title}</h4>        
        <p>${newsItem.text}</p>
        </div>
    `
  })
