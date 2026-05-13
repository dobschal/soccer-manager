import { server } from '../../lib/gateway.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { setQueryParams, goTo } from '../../lib/router.js'
import { UIElement } from '../../lib/UIElement.js'
import { renderEmblem } from '../../partials/emblem.js'
import { t } from '../../i18n/index.js'

export class HallOfFamePage extends UIElement {
  /**
   * @param {UIElement} parentPage
   */
  constructor (parentPage) {
    super()
    this.parentPage = parentPage
  }

  async load () {
    const { season, seasons, champions, cupWinner } = await server.getHallOfFame(this.season)
    this.season = season
    this.seasons = seasons
    this.champions = champions
    this.cupWinner = cupWinner

    if (this.season != null) {
      const { comments } = await server.getHallOfFameComments(this.season)
      this.comments = comments
    } else {
      this.comments = []
    }
  }

  get template () {
    if (this.seasons.length === 0) {
      return `<div>
        <h2>${t('hallOfFame.title')}</h2>
        <p class="text-muted">${t('hallOfFame.noData')}</p>
      </div>`
    }

    return `
      <div class="hall-of-fame">
        <div class="mb-4">
          <h2>${t('hallOfFame.title')}</h2>
          <table>
            <tr>
              <th>${t('results.season')}</th>
              <td>
                <span id="hof-prev-season" class="fa fa-chevron-left fa-button"></span>
                ${this.season + 1}
                <span id="hof-next-season" class="fa fa-chevron-right fa-button"></span>
              </td>
            </tr>
          </table>
        </div>

        <div class="hof-winners">
          ${this._renderCupWinner()}
          ${this.champions.length > 0 ? this._renderChampion(this.champions[0]) : ''}
        </div>
        ${this._renderLowerLeagueChampions()}

        <div class="hof-comments-section mt-4">
          <h3>${t('hallOfFame.comments')}</h3>
          <div class="hof-comment-form mb-3">
            <div class="input-group">
              <input type="text" id="hof-comment-input" class="form-control" placeholder="${t('hallOfFame.commentPlaceholder')}" maxlength="500">
              <button id="hof-comment-send" class="btn btn-primary">${t('hallOfFame.send')}</button>
            </div>
          </div>
          ${this.comments.length === 0
    ? `<p class="text-muted">${t('hallOfFame.noComments')}</p>`
    : this.comments.map(c => this._renderComment(c)).join('')}
        </div>
      </div>
    `
  }

  get events () {
    const events = {
      '#hof-prev-season': {
        click: () => this._navigateSeason(-1)
      },
      '#hof-next-season': {
        click: () => this._navigateSeason(1)
      },
      '#hof-comment-send': {
        click: () => this._submitComment()
      },
      '#hof-comment-input': {
        keydown: (e) => {
          if (e.key === 'Enter') this._submitComment()
        }
      }
    }

    for (const comment of this.comments) {
      events[`#${comment._likeId}`] = {
        click: () => this._toggleLike(comment)
      }
    }

    return events
  }

  season = null
  seasons = []
  champions = []
  cupWinner = null
  comments = []

  _getEmblemSize (level) {
    if (level === 0) return 160
    if (level === 1) return 120
    return 90
  }

  _renderUserAvatar (avatar, username) {
    const altText = username || ''
    if (avatar) {
      const baseUrl = window.__NATIVE_SERVER_URL || ''
      return `<img class="hof-user-avatar" src="${baseUrl}/uploads/avatars/${avatar}" alt="${altText}">`
    }
    return `<img class="hof-user-avatar hof-user-avatar--default" src="./assets/avatar-placeholder.svg" alt="${altText}">`
  }

  _getLeagueLabel (champion) {
    const displayLevel = champion.level + 1
    const leagueLetter = String.fromCharCode(65 + champion.league)
    if (champion.league === 0 && !this.champions.some(c => c.level === champion.level && c.league > 0)) {
      return t('hallOfFame.championLevel', { level: displayLevel })
    }
    return t('hallOfFame.championLevel', { level: `${displayLevel}${leagueLetter}` })
  }

  _renderChampion (champion) {
    const level = champion.level
    const sizeClass = level === 0 ? '' : level === 1 ? ' hof-winner-card--md' : ' hof-winner-card--sm'

    const teamData = {
      name: champion.teamName,
      color: champion.color,
      emblem: champion.emblem
    }

    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${champion.teamId}`))

    return `<div class="hof-winner-card${sizeClass}">
      <h2 class="hof-winner-title"><i class="fa fa-diamond hof-gold"></i> ${this._getLeagueLabel(champion)}</h2>
      <div class="hof-winner-content" id="${teamId}">
        <div class="hof-emblem">${renderEmblem(teamData, this._getEmblemSize(level))}</div>
        <div class="hof-winner-info">
          <div class="hof-team-name">${champion.teamName}</div>
          ${champion.username ? `<div class="hof-username">${this._renderUserAvatar(champion.avatar, champion.username)} ${champion.username}</div>` : ''}
        </div>
      </div>
    </div>`
  }

  _renderLowerLeagueChampions () {
    const lower = this.champions.slice(1)
    if (lower.length === 0) return ''

    const grouped = {}
    for (const c of lower) {
      if (!grouped[c.level]) grouped[c.level] = []
      grouped[c.level].push(c)
    }

    return Object.values(grouped)
      .map(group => `<div class="hof-winners mt-3">${group.map(c => this._renderChampion(c)).join('')}</div>`)
      .join('')
  }

  _renderCupWinner () {
    if (!this.cupWinner) {
      return `<div class="hof-winner-card">
        <h4><i class="fa fa-trophy"></i> ${t('hallOfFame.cupWinner')}</h4>
        <p class="text-muted">${t('hallOfFame.noCupWinner')}</p>
      </div>`
    }

    const teamData = {
      name: this.cupWinner.teamName,
      color: this.cupWinner.color,
      emblem: this.cupWinner.emblem
    }

    const teamId = generateId()
    onClick(teamId, () => goTo(`team?id=${this.cupWinner.teamId}`))

    return `<div class="hof-winner-card">
      <h2 class="hof-winner-title"><i class="fa fa-trophy hof-gold"></i> ${t('hallOfFame.cupWinner')}</h2>
      <div class="hof-winner-content" id="${teamId}">
        <div class="hof-emblem">${renderEmblem(teamData, 160)}</div>
        <div class="hof-winner-info">
          <div class="hof-team-name">${this.cupWinner.teamName}</div>
          ${this.cupWinner.username ? `<div class="hof-username">${this._renderUserAvatar(this.cupWinner.avatar, this.cupWinner.username)} ${this.cupWinner.username}</div>` : ''}
        </div>
      </div>
    </div>`
  }

  _renderComment (comment) {
    if (!comment._likeId) {
      comment._likeId = generateId()
    }

    const isOwn = comment.user_id === this.parentPage.info?.user?.id
    const timeAgo = this._formatTime(comment.created_at)

    return `<div class="hof-comment">
      <div class="hof-comment-header">
        <span class="hof-comment-author${isOwn ? ' text-info' : ''}">${comment.username}</span>
        <span class="hof-comment-time">${timeAgo}</span>
      </div>
      <div class="hof-comment-text">${this._escapeHtml(comment.text)}</div>
      <div class="hof-comment-actions">
        <span id="${comment._likeId}" class="hof-like-btn u-cursor-pointer">
          <i class="fa fa-heart${comment.liked ? '' : '-o'}"></i> ${comment.like_count || ''}
        </span>
      </div>
    </div>`
  }

  _formatTime (dateStr) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('hallOfFame.justNow')
    if (diffMins < 60) return t('hallOfFame.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('hallOfFame.hoursAgo', { count: diffHours })
    if (diffDays < 30) return t('hallOfFame.daysAgo', { count: diffDays })
    return date.toLocaleDateString()
  }

  _escapeHtml (text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  _navigateSeason (direction) {
    const currentIndex = this.seasons.indexOf(this.season)
    const newIndex = currentIndex - direction

    if (newIndex >= 0 && newIndex < this.seasons.length) {
      setQueryParams({
        sub_page: 'hallOfFame',
        hof_season: this.seasons[newIndex]
      })
    }
  }

  async _submitComment () {
    const input = document.querySelector(`${this._elementQuery} #hof-comment-input`)
    if (!input) return
    const text = input.value.trim()
    if (!text) return

    input.disabled = true
    try {
      await server.addHallOfFameComment(this.season, text)
      input.value = ''
      await this.update(true)
    } finally {
      input.disabled = false
    }
  }

  async _toggleLike (comment) {
    const { liked, likeCount } = await server.toggleHallOfFameCommentLike(comment.id)
    comment.liked = liked
    comment.like_count = likeCount
    await this.update(false)
  }

  /**
   * Called by parent when query params change
   * @param {Object} queryParams
   */
  applyQueryParams (queryParams) {
    if (queryParams.hof_season !== undefined) {
      this.season = Number(queryParams.hof_season)
    }
  }
}
