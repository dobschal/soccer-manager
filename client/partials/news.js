import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { renderPlayerImage } from './playerImage.js'
import { renderEmblem } from './emblem.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { t } from '../i18n/index.js'

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
    this.linkType = null // 'player' or 'team'
    this.linkId = null
    this.teamId = null
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.news-link': {
        click: () => {
          if (this.linkType === 'player') {
            setQueryParams({ player_id: this.linkId })
          } else if (this.linkType === 'team') {
            goTo(`team?id=${this.linkId}`)
          }
        }
      }
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    const hasLink = this.linkType !== null
    return `
      <div class="mb-4 position-relative">
        <div class="row align-items-start">
          <div class="col-auto py-2" style="background: linear-gradient(135deg, #dedede 0%, #f3f3f3 100%); border-radius: 8px;">
            ${this.image}
          </div>
          <div class="col" style="padding-bottom: 2rem;">
            <h5 class="text-info mb-1">${this.newsItem.title}</h5>
            <p class="mb-0" style="font-size: 0.9em;">${this.newsItem.text}</p>
          </div>
        </div>
        ${hasLink ? `
          <button
            class="news-link btn btn-sm btn-outline-info position-absolute"
            style="bottom: 10px; right: 10px;"
            aria-label="${this.linkType === 'player' ? t('news.viewPlayer') : t('news.viewTeam')}"
            title="${this.linkType === 'player' ? t('news.viewPlayer') : t('news.viewTeam')}"
          >
            <i class="fa fa-chevron-right" aria-hidden="true"></i>
          </button>
        ` : ''}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    // Prefer player image for player-related news
    if (this.newsItem.player_id) {
      const player = this.players.find(p => p.id === this.newsItem.player_id)
      if (player) {
        const team = this.teams.find(t => t.id === player.team_id)
        if (team) {
          this.image = await renderPlayerImage(player, team, 100)
          this.linkType = 'player'
          this.linkId = player.id
          this.teamId = team.id
          return
        }
      }
    }

    // Fall back to team emblem
    if (this.newsItem.team_id) {
      const team = this.teams.find(t => t.id === this.newsItem.team_id)
      if (team) {
        this.image = renderEmblem(team, 100)
        this.linkType = 'team'
        this.linkId = team.id
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
      <div class="mb-5">
        <h3>${t('news.title')}</h3>
        <p class="text-muted">${t('results.gameDay', { day: this.gameDay + 1 })}, ${t('finances.season', { season: seasonDisplay })}</p>
        ${this.news.length > 0
      ? `<div class="row mt-4">
              ${this.news.map(item => `
                <div class="col-12 col-lg-6">
                  ${new NewsItem(item, this.teams, this.players)}
                </div>
              `).join('')}
            </div>`
      : `<p class="text-muted">${t('news.noNews')}</p>`
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
