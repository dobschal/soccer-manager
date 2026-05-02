import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { renderPlayerImage } from '../../partials/playerImage.js'
import { renderEmblem } from '../../partials/emblem.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { t } from '../../i18n/index.js'
import { generateId } from '../../lib/html.js'
import { showCommentOverlay } from '../../partials/commentOverlay.js'

class NewsItem extends UIElement {
  /**
   * @param {object} newsItem
   * @param {object[]} teams
   * @param {object[]} players
   * @param {(newsId: number) => void} onLikeToggle
   */
  constructor (newsItem, teams, players, onLikeToggle) {
    super()
    this.newsItem = newsItem
    this.teams = teams
    this.players = players
    this.onLikeToggle = onLikeToggle
    this.image = ''
    this.linkType = null // 'player' or 'team'
    this.linkId = null
    this.teamId = null
    this.likeBtnId = generateId()
    this.commentBtnId = generateId()
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
  /**
   * @returns {string}
   */
  get template () {
    const hasLink = this.linkType !== null
    const liked = this.newsItem.liked
    const likeCount = this.newsItem.likeCount || 0
    const commentCount = this.newsItem.commentCount || 0
    const btnClass = liked ? 'btn-danger' : 'btn-outline-secondary'
    const heartIcon = liked ? 'fa-heart' : 'fa-heart-o'

    return `
      <div class="mb-4">
        <div class="row align-items-start">
          <div class="col-auto py-2 news-image-col">
            ${this.image}
          </div>
          <div class="col">
            <h5 class="text-info mb-1">${this.newsItem.title}</h5>
            <p class="mb-0 news-text">${this.newsItem.text}</p>
          </div>
        </div>
        <div class="d-flex justify-content-end gap-2 mt-2">
          <button
            id="${this.likeBtnId}"
            class="btn btn-sm ${btnClass}"
            title="${t('news.like')}"
          >
            <i class="fa ${heartIcon}" aria-hidden="true"></i> ${likeCount}
          </button>
          <button
            id="${this.commentBtnId}"
            class="btn btn-sm btn-outline-secondary"
            title="${t('news.comments')}"
          >
            <i class="fa fa-comment-o" aria-hidden="true"></i> ${commentCount}
          </button>
          ${hasLink ? `
            <button
              class="news-link btn btn-sm btn-outline-info"
              aria-label="${this.linkType === 'player' ? t('news.viewPlayer') : t('news.viewTeam')}"
              title="${this.linkType === 'player' ? t('news.viewPlayer') : t('news.viewTeam')}"
            >
              <i class="fa fa-chevron-right" aria-hidden="true"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '(optional).news-link': {
        click: () => {
          if (this.linkType === 'player') {
            setQueryParams({ player_id: this.linkId })
          } else if (this.linkType === 'team') {
            goTo(`team?id=${this.linkId}`)
          }
        }
      },
      [`#${this.likeBtnId}`]: {
        click: () => {
          if (this.onLikeToggle) this.onLikeToggle(this.newsItem.id)
        }
      },
      [`#${this.commentBtnId}`]: {
        click: () => {
          showCommentOverlay(this.newsItem.id, this.newsItem.title, () => {
            this.newsItem.commentCount = (this.newsItem.commentCount || 0) + 1
            this.update()
          })
        }
      }
    }
  }
}

export class News extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [response, likedResponse] = await Promise.all([
      server.getLeagueNews(),
      server.getLikedNews()
    ])
    this.news = response.news || []
    this.teams = response.teams || []
    this.players = response.players || []
    this.gameDay = response.gameDay || 0
    this.season = response.season || 0
    this.level = response.level || 0
    this.league = response.league || 0
    this.initialGameDay = this.gameDay
    this.initialSeason = this.season

    this.likedNews = likedResponse.news || []
    this.likedTeams = likedResponse.teams || []
    this.likedPlayers = likedResponse.players || []
  }
  /**
   * @returns {string}
   */
  get template () {
    const seasonDisplay = this.season + 1
    const isAtStart = this.season === 0 && this.gameDay === 0
    const isAtEnd = this.season === this.initialSeason && this.gameDay === this.initialGameDay
    return `
      <div class="mb-5">
        <h3>${t('news.title')}</h3>
        <div class="d-flex align-items-center gap-2 mb-3">
          <button class="news-prev-btn btn btn-sm btn-outline-secondary" ${isAtStart ? 'disabled' : ''}>
            <i class="fa fa-chevron-left" aria-hidden="true"></i>
          </button>
          <span class="text-muted">${t('results.gameDay', { day: this.gameDay + 1 })}, ${t('finances.season', { season: seasonDisplay })}</span>
          <button class="news-next-btn btn btn-sm btn-outline-secondary" ${isAtEnd ? 'disabled' : ''}>
            <i class="fa fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        ${this.news.length > 0
    ? `<div class="row mt-4">
              ${this.news.map(item => `
                <div class="col-12 col-lg-6">
                  ${new NewsItem(item, this.teams, this.players, (newsId) => this._handleLikeToggle(newsId))}
                </div>
              `).join('')}
            </div>`
    : `<p class="text-muted">${t('news.noNews')}</p>`
}
        ${this.likedNews.length > 0 ? `
          <hr class="my-4">
          <h4>${t('news.likedTitle')}</h4>
          <div class="row mt-3">
            ${this.likedNews.map(item => `
              <div class="col-12 col-lg-6">
                ${new NewsItem(item, this.likedTeams, this.likedPlayers, (newsId) => this._handleLikeToggle(newsId))}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `
  }
  get events () {
    return {
      '.news-prev-btn': {
        click: () => this._navigateGameDay(-1)
      },
      '.news-next-btn': {
        click: () => this._navigateGameDay(1)
      }
    }
  }
  news = []
  teams = []
  players = []
  gameDay = 0
  season = 0
  level = 0
  league = 0
  initialGameDay = 0
  initialSeason = 0
  likedNews = []
  likedTeams = []
  likedPlayers = []

  /**
   * @param {number} direction - -1 for previous, +1 for next
   */
  async _navigateGameDay (direction) {
    let newGameDay = this.gameDay + direction
    let newSeason = this.season

    if (newGameDay < 0) {
      if (newSeason <= 0) return
      newSeason--
      const result = await server.getMaxGameDay(newSeason)
      newGameDay = result.maxGameDay ?? 0
    }

    if (newSeason > this.initialSeason || (newSeason === this.initialSeason && newGameDay > this.initialGameDay)) {
      return
    }

    const response = await server.getNewsForGameDay(newGameDay, newSeason, this.level, this.league)
    this.news = response.news || []
    this.teams = response.teams || []
    this.players = response.players || []
    this.gameDay = newGameDay
    this.season = newSeason
    await this.update()
  }

  /**
   * @param {number} newsId
   */
  async _handleLikeToggle (newsId) {
    await server.toggleNewsLike(newsId)

    // Reload current gameday news and liked news
    const [response, likedResponse] = await Promise.all([
      server.getNewsForGameDay(this.gameDay, this.season, this.level, this.league),
      server.getLikedNews()
    ])
    this.news = response.news || []
    this.teams = response.teams || []
    this.players = response.players || []

    this.likedNews = likedResponse.news || []
    this.likedTeams = likedResponse.teams || []
    this.likedPlayers = likedResponse.players || []

    await this.update()
  }
}
