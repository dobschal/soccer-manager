import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { News } from './dashboard/news.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from './dashboard/actionCards.js'
import { LogMessages } from './dashboard/logMessages.js'
import { StartPage } from './dashboard/startPage.js'
import { t } from '../i18n/index.js'
import { el, generateId } from '../lib/html.js'
import { TutorialProgress } from '../partials/tutorialProgress.js'
import { showCardClaimOverlay } from '../partials/cardClaimOverlay.js'

export class DashboardPage extends UIElement {
  _sliderGames = []
  _friendlyGames = []
  _cupGames = []
  _urgencies = []
  _initialSlideIndex = 0
  _tutorialProgress = new TutorialProgress()
  team = {}
  user = {}
  season = 0
  gameDay = 0
  standing = []
  teamPosition = 0

  _actionCardCount = 0
  _pendingCards = []
  subPage = null
  _subPageCache = {}
  _subPageContainerId = generateId()

  /**
   * @returns {string}
   */
  get template () {
    const key = this.subPage || 'start'
    const subPage = this._getOrCreateSubPage()
    return `
      <div>
        ${this._tutorialProgress}

        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''} position-relative" href="#dashboard?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}${this._renderCardBadge()}</a>
          <a class="nav-link ${this.subPage === 'news' ? 'active' : ''}" href="#dashboard?sub_page=news"><i class="fa fa-newspaper-o"></i> ${t('dashboard.tabNews')}</a>
          <a class="nav-link ${this.subPage === 'messages' ? 'active' : ''}" href="#dashboard?sub_page=messages"><i class="fa fa-envelope"></i> ${t('dashboard.tabMessages')}</a>
        </nav>

        <div id="${this._subPageContainerId}">
          <div data-subpage="${key}">${subPage}</div>
        </div>
      </div>
    `
  }

  /**
   * Render the badge for new action cards
   * @returns {string}
   */
  _renderCardBadge () {
    if (this._actionCardCount <= 0 || this.subPage === 'cards') return ''
    return ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`
  }

  /**
   * Get or create a sub-page instance
   * @returns {UIElement|StartPage}
   */
  _getOrCreateSubPage () {
    const key = this.subPage || 'start'
    if (!this._subPageCache[key]) {
      this._subPageCache[key] = this._createSubPage(key)
    }
    return this._subPageCache[key]
  }

  /**
   * Create a new sub-page instance
   * @param {string} key
   * @returns {UIElement|StartPage}
   */
  _createSubPage (key) {
    switch (key) {
      case 'cards':
        return new ActionCards()
      case 'news':
        return new News()
      case 'messages':
        return new LogMessages()
      default:
        return this._createStartPage()
    }
  }

  /**
   * Create a new StartPage with current data
   * @returns {StartPage}
   */
  _createStartPage () {
    return new StartPage({
      sliderGames: this._sliderGames,
      initialSlideIndex: this._initialSlideIndex,
      team: this.team,
      cupGames: this._cupGames,
      cupResultAlreadySeen: this._cupResultAlreadySeen,
      friendlyGames: this._friendlyGames,
      canPlayFriendly: this._canPlayFriendly,
      standing: this.standing,
      teamPosition: this.teamPosition,
      urgencies: this._urgencies
    })
  }

  /**
   * Switch the visible sub-page, using cached instances when available
   */
  _switchSubPage () {
    const container = el('#' + this._subPageContainerId)
    if (!container) return

    const key = this.subPage || 'start'

    // Hide all sub-page wrappers
    container.querySelectorAll('[data-subpage]').forEach(wrapper => {
      wrapper.style.display = 'none'
    })

    // Check if this sub-page is already in the container
    const existing = container.querySelector(`[data-subpage="${key}"]`)
    if (existing) {
      existing.style.display = ''
      const cached = this._subPageCache[key]
      if (cached?.update) cached.update()
      return
    }

    // Create and render new sub-page
    const subPage = this._getOrCreateSubPage()
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-subpage', key)
    wrapper.insertAdjacentHTML('afterbegin', String(subPage))
    container.appendChild(wrapper)
  }

  /**
   * Update nav link active states to match current subPage
   */
  _updateNav () {
    const root = document.querySelector(this._elementQuery)
    if (!root) return
    root.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href')
      const isActive = this.subPage
        ? href === `#dashboard?sub_page=${this.subPage}`
        : href === '#dashboard'
      link.classList.toggle('active', isActive)
    })
    // Update badge
    const badge = root.querySelector('.action-card-badge')
    if (this._actionCardCount <= 0 || this.subPage === 'cards') {
      if (badge) badge.remove()
    } else if (!badge) {
      const cardsLink = root.querySelector('a[href="#dashboard?sub_page=cards"]')
      if (cardsLink) cardsLink.insertAdjacentHTML('beforeend', ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`)
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const teamResponse = await server.getMyTeam()
    this.team = teamResponse.team
    this.user = teamResponse.user

    const gamedayResponse = await server.getCurrentGameday()
    this.season = gamedayResponse.season
    this.gameDay = gamedayResponse.gameDay

    // Fetch games for slider (past 3 and upcoming 3), friendly games, cup games, and tutorial progress
    const [sliderResponse, friendlyResponse, cupResponse, canPlayFriendlyResponse] = await Promise.all([
      server.getGamesForSlider(3, 3),
      server.getFriendlyGames(5),
      server.getMyCupGames(5),
      server.canPlayFriendlyToday(),
      this._tutorialProgress.load()
    ])
    this._canPlayFriendly = canPlayFriendlyResponse.canPlay

    // Combine past and upcoming games for the slider
    // Add team data for emblems directly from the response
    this._sliderGames = [
      ...sliderResponse.pastGames.map(g => ({
        ...g,
        isPlayed: true,
        team1Data: this._extractTeamData(g, 1),
        team2Data: this._extractTeamData(g, 2)
      })),
      ...sliderResponse.upcomingGames.map(g => ({
        ...g,
        isPlayed: false,
        gameDate: g.gameDate,
        team1Data: this._extractTeamData(g, 1),
        team2Data: this._extractTeamData(g, 2)
      }))
    ]

    // Process friendly games for display
    this._friendlyGames = friendlyResponse.games.map(g => ({
      ...g,
      isPlayed: true,
      isFriendly: true,
      team1Data: this._extractTeamData(g, 1),
      team2Data: this._extractTeamData(g, 2)
    }))

    // Process cup games for display
    this._cupGames = cupResponse.games.map(g => ({
      ...g,
      isPlayed: g.played === 1,
      isCup: true,
      team1Data: this._extractTeamData(g, 1),
      team2Data: this._extractTeamData(g, 2)
    }))

    // Show the latest result once, then show the upcoming game on subsequent visits
    const resultSeenKey = `resultSeen_${this.season}_${this.gameDay}`
    const resultAlreadySeen = localStorage.getItem(resultSeenKey)
    this._initialSlideIndex = this._findInitialSlideIndex(this._sliderGames, resultAlreadySeen)
    localStorage.setItem(resultSeenKey, '1')

    // Same logic for cup games
    const cupResultSeenKey = `cupResultSeen_${this.season}_${this.gameDay}`
    this._cupResultAlreadySeen = Boolean(localStorage.getItem(cupResultSeenKey))
    localStorage.setItem(cupResultSeenKey, '1')

    // Fetch current standing, urgencies, action card count, and pending cards in parallel
    const [standing, urgencyResponse, actionCardsResponse, pendingCardsResponse] = await Promise.all([
      server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league),
      server.getDashboardUrgencies(),
      server.getActionCards(),
      server.getPendingActionCards()
    ])

    this.standing = standing
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
    this._urgencies = urgencyResponse.urgencies || []
    this._pendingCards = pendingCardsResponse.pendingCards || []

    // Determine if there are unseen action cards (include pending cards in the count)
    const cardCount = (actionCardsResponse.actionCards?.length || 0) + this._pendingCards.length
    const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
    this._actionCardCount = localStorage.getItem(seenKey) ? 0 : cardCount
  }

  /**
   * Extract team data for emblem rendering from flattened game response
   * @param {Object} game
   * @param {number} teamNum - 1 or 2
   * @returns {Object}
   */
  _extractTeamData (game, teamNum) {
    const prefix = `team${teamNum}`
    return {
      id: game[`${prefix}Id`],
      name: game[prefix],
      color: game[`${prefix}Color`],
      emblem: game[`${prefix}Emblem`] // Keep as JSON string for renderEmblem
    }
  }

  /**
   * Find the initial slide index for a game slider.
   * Shows the latest result on first visit, then the next upcoming game on subsequent visits.
   * @param {Array} games
   * @param {boolean} resultAlreadySeen - whether the latest result was already seen
   * @returns {number}
   */
  _findInitialSlideIndex (games, resultAlreadySeen) {
    const lastPlayedIndex = games.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    const nextUpcomingIndex = games.findIndex(g => !g.isPlayed && g.gameDate)

    if (resultAlreadySeen && nextUpcomingIndex !== -1) {
      return nextUpcomingIndex
    }

    return Math.max(0, lastPlayedIndex)
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('dashboard', this)
    this._showPendingCardsIfNeeded()
  }

  /**
   * Shows the card claim overlay if there are pending cards
   * @returns {void}
   */
  _showPendingCardsIfNeeded () {
    if (this._pendingCards.length === 0) return
    setTimeout(async () => {
      if (!this._isMounted) return
      await showCardClaimOverlay(this._pendingCards)
      this._pendingCards = []
      // Update badge count after claiming
      const actionCardsResponse = await server.getActionCards()
      const cardCount = actionCardsResponse.actionCards?.length || 0
      const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
      this._actionCardCount = localStorage.getItem(seenKey) ? 0 : cardCount
      this._updateNav()
    }, 500)
  }

  /**
   * @param {{ player_id?: string, sub_page?: string }} queryParams
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    player_id: playerId,
    sub_page: subPage
  }) {
    if (playerId) {
      const id = Number(playerId)
      if (Number.isFinite(id) && id > 0) {
        await showPlayerModal(id)
      } else if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
        // Clear invalid player_id from the URL to avoid repeated invalid calls
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('player_id')
          window.history.replaceState(window.history.state, document.title, url.toString())
        } catch {
          // Ignore URL manipulation errors
        }
      }
    }

    const newSubPage = subPage || null
    if (newSubPage === 'cards' && this._actionCardCount > 0) {
      const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
      localStorage.setItem(seenKey, '1')
      this._actionCardCount = 0
    }
    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      // StartPage is synchronous — always recreate with fresh data
      if (!newSubPage) this._subPageCache.start = this._createStartPage()
      this._switchSubPage()
      this._updateNav()
    }
  }

}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
