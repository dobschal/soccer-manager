import { server } from '../lib/gateway.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from './dashboard/actionCards.js'
import { LogMessages } from './dashboard/logMessages.js'
import { StartPage } from './dashboard/startPage.js'
import { FriendsPage } from './dashboard/friendsPage.js'
import { ForumPage } from './forum.js'
import { WikiPage } from './wiki.js'
import { SearchPanel } from '../partials/searchPanel.js'
import { t } from '../i18n/index.js'
import { el, generateId } from '../lib/html.js'
import { TutorialProgress } from '../partials/tutorialProgress.js'
import { showCardClaimOverlay } from '../partials/cardClaimOverlay.js'
import { showSeasonReviewOverlay, isSeasonReviewDismissed } from '../partials/seasonReviewOverlay.js'
import { maybeShowSpielTickerOverlay } from '../partials/spielTickerOverlay.js'
import { maybeShowEmailPrompt } from '../partials/emailPromptDialog.js'
import { CHAT_MESSAGES_READ_EVENT } from '../partials/chatOverlay.js'
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
    this.lastPlayedLeagueMatchDay = gamedayResponse.lastPlayedLeagueMatchDay ?? 0

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

    this._initialSlideIndex = this._findInitialSlideIndex(this._sliderGames)

    // Fetch current standing, urgencies, action card count, pending cards, and new message count in parallel
    const lastSeenMessageId = Number(localStorage.getItem('lastSeenMessageId')) || 0
    const [standing, urgencyResponse, actionCardsResponse, pendingCardsResponse, newMessageResponse, unreadChatResponse, seasonReview] = await Promise.all([
      server.getStanding(this.lastPlayedLeagueMatchDay, this.season, this.team.level, this.team.league),
      server.getDashboardUrgencies(window.__nativePlatform || 'web'),
      server.getActionCards(),
      server.getPendingActionCards(),
      server.getNewLogMessageCount(lastSeenMessageId),
      server.getUnreadChatCount(),
      // Prefetch the season review here (null = auto-detect the just-finished
      // season) so the overlay can open immediately in onMounted instead of
      // flashing the dashboard while a post-render request is in flight.
      server.getSeasonReview(null).catch(() => null)
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

    // Unread chat messages (shown under "Action Required")
    this._unreadChatCount = unreadChatResponse.count || 0
    this._unreadChatUserId = unreadChatResponse.latestUserId || null

    // Prefetched season review (shown as an overlay in onMounted).
    this._seasonReview = seasonReview
  }
  get template () {
    return `
      <div>
        ${this._tutorialProgress}

        <nav class="nav nav-pills">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link ${this.subPage === 'forum' ? 'active' : ''}" href="#dashboard?sub_page=forum"><i class="fa fa-comments"></i> ${t('forum.title')}</a>
          <a class="nav-link ${this.subPage === 'friends' ? 'active' : ''}" href="#dashboard?sub_page=friends"><i class="fa fa-users"></i> ${t('dashboard.tabFriends')}</a>
          <a class="nav-link ${this.subPage === 'wiki' ? 'active' : ''}" href="#dashboard?sub_page=wiki"><i class="fa fa-book"></i> ${t('wiki.title')}</a>
          <a class="nav-link ${this.subPage === 'search' ? 'active' : ''}" href="#dashboard?sub_page=search"><i class="fa fa-search"></i> ${t('search.title')}</a>
        </nav>

        <div id="${this._chatBannerId}">${this._renderUnreadChatBanner()}</div>

        ${this.renderSubPageContainer()}
      </div>
    `
  }
  /**
   * Live-update the unread-chat banner when a new 1:1 message arrives, so it
   * appears without a page reload (the count is otherwise only fetched in
   * `load()`).
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      NEW_CHAT_MESSAGE: (data) => {
        this._unreadChatCount++
        if (data?.fromUserId) this._unreadChatUserId = data.fromUserId
        this._updateUnreadChatBanner()
      }
    }
  }
  onMounted () {
    void this._showDashboardOverlays()
    // Refresh the unread-chat banner whenever the chat overlay reads a
    // conversation, so it disappears once all messages have been read.
    window.addEventListener(CHAT_MESSAGES_READ_EVENT, this._onChatMessagesRead)
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
        await this._refreshStartPageData()
      }
      this._switchSubPage()
      this._updateNav()
      // A cached forum sub-page that's becoming visible again needs the
      // latest URL params pushed in — its own query-changed listener bailed
      // while it was hidden. (Freshly created instances pick up params in
      // load() themselves.)
      if (newSubPage === 'forum') {
        const forum = this._subPageCache.forum
        if (forum?._isMounted && typeof forum.onQueryChanged === 'function') {
          forum.onQueryChanged(params)
        }
      }
      // Same for the wiki sub-page: a cached instance becoming visible again
      // needs the latest id param pushed in (#441).
      if (newSubPage === 'wiki') {
        const wiki = this._subPageCache.wiki
        if (wiki?._isMounted && typeof wiki.onQueryChanged === 'function') {
          wiki.onQueryChanged(params)
        }
      }
    } else if (!newSubPage && this._initialQueryChangeHandled) {
      // Returning to the start tab from another page — refresh data.
      // Skip on the very first onQueryChanged after mount: the page just
      // rendered with fresh data, so refreshing here would replace the
      // start sub-page in the DOM and trigger a visible fade-in flicker.
      await this._refreshStartPageData()
      this._switchSubPage()
    }
    // SearchPanel doesn't listen for query-changed itself, so push params on
    // every change while it is the active sub-page (covers both activation
    // and same-tab pagination/search-query updates).
    if ((newSubPage || this.subPage) === 'search') {
      const search = this._subPageCache.search
      if (search && typeof search.applyQueryParams === 'function') {
        await search.applyQueryParams(params)
        if (typeof search.update === 'function') await search.update(true)
      }
    }
    this._initialQueryChangeHandled = true
  }
  onDestroy () {
    window.removeEventListener(CHAT_MESSAGES_READ_EVENT, this._onChatMessagesRead)
  }
  /**
   * Re-fetch the unread 1:1 chat count and patch the banner in place. Bound as
   * a field so it can be added/removed as a window listener. Triggered by the
   * chat overlay after it marks a conversation read.
   * @returns {Promise<void>}
   */
  _onChatMessagesRead = async () => {
    const res = await server.getUnreadChatCount()
    this._unreadChatCount = res.count || 0
    this._unreadChatUserId = res.latestUserId || null
    this._updateUnreadChatBanner()
  }
  
  get routeName () { return 'dashboard' }

  get defaultSubPageKey () { return 'start' }

  createSubPage (key) {
    switch (key) {
      case 'cards': return new ActionCards()
      case 'messages': return new LogMessages()
      case 'forum': return new ForumPage()
      case 'friends': return new FriendsPage()
      case 'wiki': return new WikiPage()
      case 'search': return new SearchPanel()
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
  _unreadChatCount = 0
  _unreadChatUserId = null
  _chatBannerId = generateId()
  _seasonReview = null
  _pendingCards = []
  _initialQueryChangeHandled = false

  /**
   * Banner shown at the top of the dashboard (below the tabs) when the user has
   * unread 1:1 chat messages. Links to the most recent sender's chat (or the
   * friends sub-page as a fallback). Returns an empty string when there is
   * nothing unread.
   * @returns {string}
   */
  _renderUnreadChatBanner () {
    if (!this._unreadChatCount || this._unreadChatCount <= 0) return ''
    const target = this._unreadChatUserId
      ? `#dashboard?chat_user=${this._unreadChatUserId}`
      : '#dashboard?sub_page=friends'
    return `
      <a href="${target}" class="alert alert-info d-flex align-items-center gap-2 text-decoration-none mt-2 mb-0">
        <i class="fa fa-comment"></i>
        <span>${t('chat.unreadMessages')}</span>
        <span class="badge rounded-pill bg-danger ms-auto">${this._unreadChatCount}</span>
      </a>
    `
  }

  /**
   * Patch the unread-chat banner in place (used by the NEW_CHAT_MESSAGE server
   * event) without re-rendering the whole dashboard.
   * @returns {void}
   */
  _updateUnreadChatBanner () {
    const bannerEl = el('#' + this._chatBannerId)
    if (!bannerEl) return
    bannerEl.innerHTML = this._renderUnreadChatBanner()
  }

  _renderCardBadge () {
    if (this._actionCardCount <= 0 || this.subPage === 'cards') return ''
    return ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`
  }

  async _refreshStartPageData () {
    const gamedayResponse = await server.getCurrentGameday()
    this.season = gamedayResponse.season
    this.gameDay = gamedayResponse.gameDay
    this.lastPlayedLeagueMatchDay = gamedayResponse.lastPlayedLeagueMatchDay ?? 0

    const [teamResponse, sliderResponse, friendlyResponse, cupResponse, canPlayFriendlyResponse, standing, urgencyResponse] = await Promise.all([
      server.getMyTeam(),
      server.getGamesForSlider(3, 3),
      server.getFriendlyGames(5),
      server.getMyCupGames(5),
      server.canPlayFriendlyToday(),
      server.getStanding(this.lastPlayedLeagueMatchDay, this.season, this.team.level, this.team.league),
      server.getDashboardUrgencies(window.__nativePlatform || 'web')
    ])
    this.team = teamResponse.team
    this.user = teamResponse.user

    this._sliderGames = [
      ...sliderResponse.pastGames.map(g => ({ ...g, isPlayed: true, team1Data: this._extractTeamData(g, 1), team2Data: this._extractTeamData(g, 2) })),
      ...sliderResponse.upcomingGames.map(g => ({ ...g, isPlayed: false, gameDate: g.gameDate, team1Data: this._extractTeamData(g, 1), team2Data: this._extractTeamData(g, 2) }))
    ]
    this._friendlyGames = friendlyResponse.games.map(g => ({ ...g, isPlayed: true, isFriendly: true, team1Data: this._extractTeamData(g, 1), team2Data: this._extractTeamData(g, 2) }))
    this._cupGames = cupResponse.games.map(g => ({ ...g, isPlayed: g.played === 1, isCup: true, totalRounds: cupResponse.totalRounds, team1Data: this._extractTeamData(g, 1), team2Data: this._extractTeamData(g, 2) }))
    this._canPlayFriendly = canPlayFriendlyResponse.canPlay
    this._initialSlideIndex = this._findInitialSlideIndex(this._sliderGames)

    this.standing = standing
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
    this._urgencies = urgencyResponse.urgencies || []
    // Remove old start page from DOM and recreate cached instance
    const container = el('#' + this._subPageContainerId)
    if (container) {
      const oldWrapper = container.querySelector('[data-subpage="start"]')
      if (oldWrapper) oldWrapper.remove()
    }
    this._subPageCache.start = this._createStartPage()
  }

  _createStartPage () {
    return new StartPage({
      sliderGames: this._sliderGames,
      initialSlideIndex: this._initialSlideIndex,
      team: this.team,
      cupGames: this._cupGames,
      friendlyGames: this._friendlyGames,
      canPlayFriendly: this._canPlayFriendly,
      standing: this.standing,
      teamPosition: this.teamPosition,
      urgencies: this._urgencies,
      newMessageCount: this._newMessageCount
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
    const badge = root.querySelector('.action-card-badge')
    if (this._actionCardCount <= 0 || this.subPage === 'cards') {
      if (badge) badge.remove()
    } else if (!badge) {
      const cardsLink = root.querySelector('a[href="#dashboard?sub_page=cards"]')
      if (cardsLink) cardsLink.insertAdjacentHTML('beforeend', ` <span class="badge rounded-pill bg-danger action-card-badge">${this._actionCardCount}</span>`)
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

  _findInitialSlideIndex (games) {
    const lastPlayedIndex = games.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    const nextUpcomingIndex = games.findIndex(g => !g.isPlayed && g.gameDate)
    if (lastPlayedIndex === -1) return Math.max(0, nextUpcomingIndex)

    // Once the user has opened the dashboard for this game day and seen the
    // last played game, default to the next upcoming game on subsequent visits.
    const seenKey = `dashboardSliderSeen_${this.season}_${this.gameDay}`
    if (localStorage.getItem(seenKey) && nextUpcomingIndex !== -1) {
      return nextUpcomingIndex
    }
    localStorage.setItem(seenKey, '1')
    return lastPlayedIndex
  }

  async _showDashboardOverlays () {
    // Fixed order — each overlay waits for the previous one to close so the
    // user never sees two overlays at once.
    await this._showEmailPromptIfNeeded()
    await this._showSeasonReviewIfNeeded()
    await this._showTutorialIfNeeded()
    await this._showSpielTickerIfNeeded()
    await this._showPendingCardsIfNeeded()
  }

  /**
   * Show the animated match ticker for the user's most recent game, before the
   * action-card claim overlay (#402).
   * @returns {Promise<void>}
   * @private
   */
  async _showSpielTickerIfNeeded () {
    if (!this._isMounted) return
    const lastGame = this._findLastPlayedGame()
    if (!lastGame) return
    await maybeShowSpielTickerOverlay({
      season: this.season,
      gameDay: this.gameDay,
      myTeamId: this.team.id,
      lastGame
    })
  }

  /**
   * The most recent played game across league and cup, so the match ticker
   * also pops up after a cup game (#402). Each cron tick plays exactly one
   * game day, so a higher game day is always the more recent game; the id is
   * a deterministic tie-break.
   *
   * Cup byes are excluded: at season prep the first cup round's byes are
   * created already "played" with no opponent and an empty log, and they sit
   * on a higher game_day than the first league day. Without this filter such a
   * bye would be picked as the "most recent" game, the ticker would bail out on
   * its empty details, and the real season-opener match would never show.
   * @returns {object|null}
   * @private
   */
  _findLastPlayedGame () {
    const played = [
      ...(this._sliderGames || []),
      ...(this._cupGames || [])
    ].filter(g => g.isPlayed && g.id && !(g.isCup && !g.team2Id))
    if (played.length === 0) return null
    return played.reduce((latest, g) =>
      (g.gameDay > latest.gameDay || (g.gameDay === latest.gameDay && g.id > latest.id))
        ? g
        : latest)
  }

  async _showEmailPromptIfNeeded () {
    if (!this._isMounted) return
    await maybeShowEmailPrompt(this.user)
  }

  async _showTutorialIfNeeded () {
    if (!this._isMounted) return
    // No delay — previous overlay closing is already a natural "page settled"
    // moment, and the dashboard is fully rendered by the time we get here.
    await showTutorialIfNeeded('dashboard', this, { delay: 0 })
  }

  async _showPendingCardsIfNeeded () {
    if (this._pendingCards.length === 0) return
    if (!this._isMounted) return
    await showCardClaimOverlay(this._pendingCards)
    this._pendingCards = []
    // Update badge count after claiming
    const actionCardsResponse = await server.getActionCards()
    const cardCount = actionCardsResponse.actionCards?.length || 0
    const seenKey = `actionCardsSeen_${this.season}_${this.gameDay}`
    this._actionCardCount = localStorage.getItem(seenKey) ? 0 : cardCount
    this._updateNav()
  }

  async _showSeasonReviewIfNeeded () {
    if (!this._isMounted) return
    // Uses the review prefetched in load() so the overlay opens immediately
    // instead of flashing the dashboard while a request is in flight.
    const review = this._seasonReview
    if (!review?.isSeasonEnd) return
    if (isSeasonReviewDismissed(review.season)) return
    if (!this._isMounted) return
    await showSeasonReviewOverlay(review)
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
