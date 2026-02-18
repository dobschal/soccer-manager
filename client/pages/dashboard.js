import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { News } from './dashboard/news.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from './dashboard/actionCards.js'
import { LogMessages } from './dashboard/logMessages.js'
import { StartPage } from './dashboard/startPage.js'
import { t } from '../i18n/index.js'
import { showManagerChat, wasManagerChatShown } from '../partials/managerChat.js'
import { TutorialProgress } from '../partials/tutorialProgress.js'

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
  subPage = null

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div>
        ${this._tutorialProgress}

        <nav class="nav nav-pills mb-4">
          <a class="nav-link ${!this.subPage ? 'active' : ''}" href="#dashboard"><i class="fa fa-home"></i> ${t('dashboard.tabStart')}</a>
          <a class="nav-link ${this.subPage === 'cards' ? 'active' : ''} position-relative" href="#dashboard?sub_page=cards"><i class="fa fa-clone"></i> ${t('dashboard.tabCards')}${this._renderCardBadge()}</a>
          <a class="nav-link ${this.subPage === 'news' ? 'active' : ''}" href="#dashboard?sub_page=news"><i class="fa fa-newspaper-o"></i> ${t('dashboard.tabNews')}</a>
          <a class="nav-link ${this.subPage === 'messages' ? 'active' : ''}" href="#dashboard?sub_page=messages"><i class="fa fa-envelope"></i> ${t('dashboard.tabMessages')}</a>
        </nav>

        ${this._renderSubPage()}
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
   * Render the active sub-page content
   * @returns {string|ActionCards|News|LogMessages}
   */
  _renderSubPage () {
    switch (this.subPage) {
      case 'cards':
        return new ActionCards()
      case 'news':
        return new News()
      case 'messages':
        return new LogMessages()
      default:
        return this._renderStartPage()
    }
  }

  /**
   * Render the start page with game sliders, standings, and charts
   * @returns {StartPage}
   */
  _renderStartPage () {
    return new StartPage({
      sliderGames: this._sliderGames,
      initialSlideIndex: this._initialSlideIndex,
      team: this.team,
      cupGames: this._cupGames,
      friendlyGames: this._friendlyGames,
      standing: this.standing,
      teamPosition: this.teamPosition,
      urgencies: this._urgencies
    })
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
    const [sliderResponse, friendlyResponse, cupResponse] = await Promise.all([
      server.getGamesForSlider(3, 3),
      server.getFriendlyGames(5),
      server.getMyCupGames(5),
      this._tutorialProgress.load()
    ])

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

    // Fetch current standing, urgencies, and action card count in parallel
    const [standing, urgencyResponse, actionCardsResponse] = await Promise.all([
      server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league),
      server.getDashboardUrgencies(),
      server.getActionCards()
    ])

    this.standing = standing
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
    this._urgencies = urgencyResponse.urgencies || []

    // Determine if there are unseen action cards
    const cardCount = actionCardsResponse.actionCards?.length || 0
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
    this._showManagerChatIfNeeded()
  }

  /**
   * Shows the manager chat if it's the first visit on this game day and on a large screen
   * @returns {void}
   */
  _showManagerChatIfNeeded () {
    const isLargeScreen = window.matchMedia('(min-width: 992px)').matches
    if (!isLargeScreen) return
    if (wasManagerChatShown(this.gameDay, this.season)) return

    // Get the latest played game for the chat message
    const latestGame = this._sliderGames.filter(g => g.isPlayed).pop()
    if (!latestGame) return

    const isHomeGame = latestGame.team1Id === this.team.id
    const myGoals = isHomeGame ? latestGame.goalsTeam1 : latestGame.goalsTeam2
    const opponentGoals = isHomeGame ? latestGame.goalsTeam2 : latestGame.goalsTeam1
    const hasResult = typeof myGoals === 'number' && typeof opponentGoals === 'number'
    const isWin = hasResult && myGoals > opponentGoals
    const isDraw = hasResult && myGoals === opponentGoals
    const resultMessage = !hasResult
      ? t('dashboard.resultNotAvailable')
      : isWin
        ? t('dashboard.congratsWin')
        : isDraw
          ? t('dashboard.drawMessage')
          : t('dashboard.lossMessage')

    const chatText = `
      <p class="mb-1">${t('dashboard.hey')} <b>${this.user.username}</b>!</p>
      <p class="mb-1">${t('dashboard.teamPosition', {
      position: this._getPositionText(),
      league: this.team.level + 1
    })}</p>
      <p class="mb-0">${t('dashboard.gameDayInfo', {
      gameDay: Math.max(1, this.gameDay),
      season: this.season + 1,
      opponent: isHomeGame ? latestGame.team2 : latestGame.team1
    })} ${resultMessage}</p>
    `

    void showManagerChat(this.team.color, chatText, this.gameDay, this.season)
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
      this.update()
    }
  }

  /**
   * @returns {string}
   */
  _getPositionText () {
    if (this.teamPosition === 0) return t('dashboard.notRankedYet')
    const pos = this.teamPosition
    if (pos === 1) return t('dashboard.positionSt', { pos })
    if (pos === 2) return t('dashboard.positionNd', { pos })
    if (pos === 3) return t('dashboard.positionRd', { pos })
    return t('dashboard.positionTh', { pos })
  }

}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
