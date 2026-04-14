import { server } from '../lib/gateway.js'
import { News } from './dashboard/news.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from './dashboard/actionCards.js'
import { LogMessages } from './dashboard/logMessages.js'
import { StartPage } from './dashboard/startPage.js'
import { t } from '../i18n/index.js'
import { el } from '../lib/html.js'
import { TutorialProgress } from '../partials/tutorialProgress.js'
import { showCardClaimOverlay } from '../partials/cardClaimOverlay.js'
import { TabbedPage } from '../lib/TabbedPage.js'

export class DashboardPage extends TabbedPage {
  async load () {
    const teamResponse = await server.getMyTeam()
    this.team = teamResponse.team
    this.user = teamResponse.user

    // Register device token for push notifications (fire-and-forget)
    if (window.__nativeDeviceToken && window.__nativePlatform) {
      const { sendLog } = await import('../lib/clientLogger.js')
      sendLog(`[Push] Dashboard load: registering token ${window.__nativeDeviceToken.substring(0, 10)}... platform=${window.__nativePlatform}`)
      server.registerDeviceToken(window.__nativeDeviceToken, window.__nativePlatform)
        .then(() => sendLog('[Push] Dashboard: device token registered successfully'))
        .catch(e => sendLog(`[Push] Dashboard: device token registration FAILED: ${e?.message || JSON.stringify(e)}`, 'error'))
    }

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
      totalRounds: cupResponse.totalRounds,
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

    // Fetch current standing, urgencies, action card count, pending cards, and new message count in parallel
    const lastSeenMessageId = Number(localStorage.getItem('lastSeenMessageId')) || 0
    const [standing, urgencyResponse, actionCardsResponse, pendingCardsResponse, newMessageResponse] = await Promise.all([
      server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league),
      server.getDashboardUrgencies(window.__nativePlatform || 'web'),
      server.getActionCards(),
      server.getPendingActionCards(),
      server.getNewLogMessageCount(lastSeenMessageId)
    ])

    this.standing = standing
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
    this._urgencies = urgencyResponse.urgencies || []
    this._pendingCards = pendingCardsResponse.pendingCards || []

    // Invalidate cached start page so it picks up fresh urgencies/standing
    delete this._subPageCache.start

    // Determine if there are unseen action cards (include pending cards in the count)
    const cardCount = (actionCardsResponse.actionCards?.length || 0) + this._pendingCards.length
    const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
    this._actionCardCount = localStorage.getItem(seenKey) ? 0 : cardCount

    // Set new message count
    this._newMessageCount = newMessageResponse.count || 0
  }
  get template () {
    return `
      <div>
        ${this._tutorialProgress}

        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''} position-relative" href="#dashboard?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}${this._renderCardBadge()}</a>
          <a class="nav-link ${this.subPage === 'news' ? 'active' : ''}" href="#dashboard?sub_page=news"><i class="fa fa-newspaper-o"></i> ${t('dashboard.tabNews')}</a>
          <a class="nav-link ${this.subPage === 'messages' ? 'active' : ''}" href="#dashboard?sub_page=messages"><i class="fa fa-envelope"></i> ${t('dashboard.tabMessages')}${this._renderMessageBadge()}</a>
          <a class="nav-link" href="#forum"><i class="fa fa-comments"></i> ${t('forum.title')}</a>
        </nav>

        ${this.renderSubPageContainer()}
      </div>
    `
  }
  onMounted () {
    void showTutorialIfNeeded('dashboard', this)
    this._showPendingCardsIfNeeded()
  }
  async onQueryChanged (params) {
    const playerId = params.player_id
    if (playerId) {
      const id = Number(playerId)
      if (Number.isFinite(id) && id > 0) {
        await showPlayerModal(id)
      } else if (typeof window !== 'undefined' && typeof URL !== 'undefined') {
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('player_id')
          window.history.replaceState(window.history.state, document.title, url.toString())
        } catch {
          // Ignore URL manipulation errors
        }
      }
    }

    const newSubPage = params.sub_page || null
    if (newSubPage === 'cards' && this._actionCardCount > 0) {
      const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
      localStorage.setItem(seenKey, '1')
      this._actionCardCount = 0
    }
    if (newSubPage === 'messages' && this._newMessageCount > 0) {
      server.getLogMessages(0, 1).then(messages => {
        if (messages?.length > 0) {
          localStorage.setItem('lastSeenMessageId', String(messages[0].id))
        }
      })
      this._newMessageCount = 0
    }
    if (newSubPage !== this.subPage) {
      this.subPage = newSubPage
      // Refresh urgencies and recreate StartPage with fresh data
      if (!newSubPage) {
        const urgencyResponse = await server.getDashboardUrgencies(window.__nativePlatform || 'web')
        this._urgencies = urgencyResponse.urgencies || []
        this._subPageCache.start = this._createStartPage()
      }
      this._switchSubPage()
      this._updateNav()
    }
  }
  get routeName () { return 'dashboard' }
  
  get defaultSubPageKey () { return 'start' }
  
  createSubPage (key) {
    switch (key) {
      case 'cards': return new ActionCards()
      case 'news': return new News()
      case 'messages': return new LogMessages()
      default: return this._createStartPage()
    }
  }

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
  _newMessageCount = 0
  _pendingCards = []

  _renderCardBadge () {
    if (this._actionCardCount <= 0 || this.subPage === 'cards') return ''
    return ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`
  }

  _renderMessageBadge () {
    if (this._newMessageCount <= 0 || this.subPage === 'messages') return ''
    return ` <span class="badge rounded-pill bg-danger action-card-badge message-badge">${this._newMessageCount}</span>`
  }

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
   * Override to also manage badge DOM elements
   */
  _updateNav () {
    super._updateNav()
    const root = el(this._elementQuery)
    if (!root) return
    // Update action card badge
    const badge = root.querySelector('.action-card-badge:not(.message-badge)')
    if (this._actionCardCount <= 0 || this.subPage === 'cards') {
      if (badge) badge.remove()
    } else if (!badge) {
      const cardsLink = root.querySelector('a[href="#dashboard?sub_page=cards"]')
      if (cardsLink) cardsLink.insertAdjacentHTML('beforeend', ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`)
    }
    // Update message badge
    const msgBadge = root.querySelector('.message-badge')
    if (this._newMessageCount <= 0 || this.subPage === 'messages') {
      if (msgBadge) msgBadge.remove()
    } else if (!msgBadge) {
      const messagesLink = root.querySelector('a[href="#dashboard?sub_page=messages"]')
      if (messagesLink) messagesLink.insertAdjacentHTML('beforeend', ` <span class="badge rounded-pill bg-danger action-card-badge message-badge">${this._newMessageCount}</span>`)
    }
  }

  _extractTeamData (game, teamNum) {
    const prefix = `team${teamNum}`
    return {
      id: game[`${prefix}Id`],
      name: game[prefix],
      color: game[`${prefix}Color`],
      emblem: game[`${prefix}Emblem`]
    }
  }

  _findInitialSlideIndex (games, resultAlreadySeen) {
    const lastPlayedIndex = games.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    const nextUpcomingIndex = games.findIndex(g => !g.isPlayed && g.gameDate)

    if (resultAlreadySeen && nextUpcomingIndex !== -1) {
      return nextUpcomingIndex
    }

    return Math.max(0, lastPlayedIndex)
  }

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
}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
