import { server } from '../lib/gateway.js'
import { renderAsync } from '../lib/renderAsync.js'
import { renderPlayerImage } from './playerImage.js'

export const renderNews = renderAsync(async () => {
  const { news } = await server.getLeagueNews()
  return `
    <h3>News</h3>
    ${news.map(renderAsync(_renderNewsItem)).join('')}
  `
})

/**
 * @param {NewsArticle} newsItem
 * @returns {Promise<string>}
 * @private
 */
async function _renderNewsItem (newsItem) {
  let image = ''
  if (newsItem.playerId) {
    const player = await server.getPlayerById_V2(newsItem.playerId)
    const { team } = await server.getTeam({ teamId: player.team_id })
    image = await renderPlayerImage(player, team, 150)
  }
  return `
    <div class="article">    
        ${image}
        <h4>${newsItem.title}</h4>        
        <p>${newsItem.text}</p>
        </div>
    `
}
