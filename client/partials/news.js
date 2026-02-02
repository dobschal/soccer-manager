import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { renderPlayerImage } from './playerImage.js'

class NewsItem extends UIElement {
  /**
   * @param {object} newsItem
   */
  constructor (newsItem) {
    super()
    this.newsItem = newsItem
    this.image = ''
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="article">
        ${this.image}
        <h4>${this.newsItem.title}</h4>
        <p>${this.newsItem.text}</p>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    if (this.newsItem.playerId) {
      const player = await server.getPlayerById(this.newsItem.playerId)
      const { team } = await server.getTeam(player.team_id)
      this.image = await renderPlayerImage(player, team, 150)
    }
  }
}

export class News extends UIElement {
  news = []

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        <h3>News</h3>
        ${this.news.map(item => new NewsItem(item)).join('')}
        ${this.news.length > 1 ? `` : `<p>No news available...</p>`}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getLeagueNews()
    this.news = response.news || []
  }
}

/**
 * @returns {string}
 */
export function renderNews () {
  return new News().toString()
}
