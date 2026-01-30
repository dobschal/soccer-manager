import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { renderPlayerImage } from './playerImage.js'

class NewsItem extends UIElement {
  constructor (newsItem) {
    super()
    this.newsItem = newsItem
    this.image = ''
  }

  get template () {
    return `
      <div class="article">
        ${this.image}
        <h4>${this.newsItem.title}</h4>
        <p>${this.newsItem.text}</p>
      </div>
    `
  }

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

  get template () {
    return `
      <div>
        <h3>News</h3>
        ${this.news.map(item => new NewsItem(item)).join('')}
      </div>
    `
  }

  async load () {
    const response = await server.getLeagueNews()
    this.news = response.news || []
  }
}

// Backwards compatibility
export function renderNews () {
  return new News().toString()
}
