import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { renderPlayerImage } from './playerImage.js'
import { renderEmblem } from './emblem.js'

class NewsItem extends UIElement {
  /**
   * @param {object} newsItem
   * @param {object[]} teams
   * @param {object[]} players
   */
  constructor (newsItem, teams, players) {
    super()
    this.newsItem = newsItem
    this.teams = teams
    this.players = players
    this.image = ''
  }

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="card card-body bg-dark mb-3">
        <div class="row align-items-center">
          <div class="col-auto">
            ${this.image}
          </div>
          <div class="col">
            <h5 class="text-info mb-1">${this.newsItem.title}</h5>
            <p class="text-white mb-0">${this.newsItem.text}</p>
          </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    // Prefer team emblem for team-related news
    if (this.newsItem.team_id) {
      const team = this.teams.find(t => t.id === this.newsItem.team_id)
      if (team) {
        this.image = renderEmblem(team, 70)
        return
      }
    }

    // Fall back to player image for player-related news
    if (this.newsItem.player_id) {
      const player = this.players.find(p => p.id === this.newsItem.player_id)
      if (player) {
        const team = this.teams.find(t => t.id === player.team_id)
        if (team) {
          this.image = await renderPlayerImage(player, team, 70)
        }
      }
    }
  }
}

export class News extends UIElement {
  news = []
  teams = []
  players = []
  gameDay = 0
  season = 0

  /**
   * @returns {string}
   */
  get template () {
    const seasonDisplay = this.season + 1
    return `
      <div>
        <h3>News <small class="text-muted">- Game Day ${this.gameDay}, Season ${seasonDisplay}</small></h3>
        ${this.news.length > 0
          ? this.news.map(item => new NewsItem(item, this.teams, this.players)).join('')
          : `<p class="text-muted">No news available...</p>`
        }
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const response = await server.getLeagueNews()
    this.news = response.news || []
    this.teams = response.teams || []
    this.players = response.players || []
    this.gameDay = response.gameDay || 0
    this.season = response.season || 0
  }
}

/**
 * @returns {string}
 */
export function renderNews () {
  return new News().toString()
}
