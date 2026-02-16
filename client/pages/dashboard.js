import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { News } from '../partials/news.js'
import { renderEmblem } from '../partials/emblem.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { generateId } from '../lib/html.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from '../partials/actionCards.js'
import { LogMessages } from '../partials/logMessages.js'
import { t } from '../i18n/index.js'
import { showManagerChat, wasManagerChatShown } from '../partials/managerChat.js'
import { showOverlay } from '../partials/overlay.js'
import { goTo } from '../lib/router.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { GameSlider } from '../partials/gameSlider.js'
import { formatLeague } from '../util/league.js'
import { TutorialProgress } from '../partials/tutorialProgress.js'
import { MiniBalanceChart } from '../partials/miniBalanceChart.js'

export class DashboardPage extends UIElement {
  _sliderGames = []
  _friendlyGames = []
  _cupGames = []
  _financeLog = []
  _urgencies = []
  _initialSlideIndex = 0
  _tutorialProgress = new TutorialProgress()
  team = {}
  user = {}
  season = 0
  gameDay = 0
  standing = []
  teamPosition = 0

  /**
   * @returns {string}
   */
  get template () {
    const gameSliderArgs = {
      games: this._sliderGames,
      teamId: this.team.id,
      initialIndex: this._initialSlideIndex
    }
    return `
      <div>
        ${this._tutorialProgress}

        <h5 class="mb-2"><i class="fa fa-futbol-o"></i> ${formatLeague(this.team.level, this.team.league)}</h5>
        <div class="d-flex align-items-center mb-5 u-gap-lg">
          <div class="flex-grow-1">
            ${new GameSlider(gameSliderArgs)}
          </div>
          <div class="d-none d-lg-block flex-shrink-1 text-center u-min-w-280 u-w-33">
            ${renderEmblem(this.team, 160)}
            <h2>${this.team.name}</h2>
          </div>
        </div>

        <h5 class="mb-2"><i class="fa fa-trophy"></i> ${t('cup.title')}</h5>
        <div class="d-flex align-items-center mb-5 u-gap-lg">
          <div class="flex-grow-1">
            ${this._renderCupGames()}
          </div>
          <div class="d-none d-lg-block flex-shrink-1 u-min-w-280 u-w-33">
            ${this._renderMiniStanding()}
            <a href="#results" class="d-block mt-2 text-info border-0 text-end w-100">
                <small>...${t('dashboard.standingLink')}</small>
            </a>
          </div>
        </div>

        <div class="d-flex align-items-start mb-5 u-gap-md">
          <div class="flex-grow-1">
            <h5 class="mb-2"><i class="fa fa-handshake-o"></i> ${t('friendly.title')}</h5>
            ${this._renderFriendlyGames()}
          </div>
          ${this._financeLog.length > 0 ? `
            <div class="d-none d-lg-block flex-shrink-0 u-min-w-280 u-w-33">
              <a href="#finances" class="text-decoration-none d-block">
                <h5 class="mb-2"><i class="fa fa-line-chart"></i> ${t('finances.balance')}</h5>
                ${new MiniBalanceChart(this._financeLog)}
              </a>
            </div>
          ` : ''}
        </div>

        ${new ActionCards()}

        ${new News()}

        ${new LogMessages()}
      </div>
    `
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

    // Show next game if it starts within 2 hours, otherwise show latest result
    this._initialSlideIndex = this._findInitialSlideIndex(this._sliderGames)

    // Fetch current standing, finance log, and urgencies in parallel
    const [standing, financeLogResponse, urgencyResponse] = await Promise.all([
      server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league),
      server.getFinanceLog(
        this.season,
        Math.max(0, this.gameDay - 6),
        this.season,
        this.gameDay
      ),
      server.getDashboardUrgencies()
    ])

    this.standing = standing
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
    this._financeLog = financeLogResponse.log || []
    this._urgencies = urgencyResponse.urgencies || []
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
   * Shows the next upcoming game if it starts within 2 hours, otherwise the latest played game.
   * @param {Array} games
   * @returns {number}
   */
  _findInitialSlideIndex (games) {
    const TWO_HOURS = 2 * 60 * 60 * 1000
    const now = Date.now()

    const nextUpcomingIndex = games.findIndex(g => !g.isPlayed && g.gameDate)
    if (nextUpcomingIndex !== -1) {
      const gameTime = new Date(games[nextUpcomingIndex].gameDate).getTime()
      if (gameTime - now < TWO_HOURS) {
        return nextUpcomingIndex
      }
    }

    // Fall back to last played game
    const lastPlayedIndex = games.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    return Math.max(0, lastPlayedIndex)
  }

  /**
   * @returns {void}
   */
  onMounted () {
    void showTutorialIfNeeded('dashboard', this)
    this._showManagerChatIfNeeded()
    this._showUrgencyOverlayIfNeeded()
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
   * Shows the urgency overlay once per game day if there are pending actions
   * @returns {void}
   */
  _showUrgencyOverlayIfNeeded () {
    if (this._urgencies.length === 0) return

    const storageKey = `urgencyOverlayShown_${this.season}_${this.gameDay}`
    if (localStorage.getItem(storageKey) === 'true') return

    const urgencyMap = {
      INCOMPLETE_LINEUP: {
        text: 'dashboard.urgencyLineup',
        link: '#my-team',
        linkText: 'dashboard.urgencyLinkTeam'
      },
      LOW_FRESHNESS: {
        text: 'dashboard.urgencyFreshness',
        link: '#my-team',
        linkText: 'dashboard.urgencyLinkTeam'
      },
      YOUTH_LOW_STATS: {
        text: 'dashboard.urgencyYouth',
        link: '#my-team?tab=youth',
        linkText: 'dashboard.urgencyLinkYouth'
      },
      INCOMING_OFFERS: {
        text: 'dashboard.urgencyOffers',
        link: '#trades?tab=incoming',
        linkText: 'dashboard.urgencyLinkTrades'
      },
      NO_SPONSOR: {
        text: 'dashboard.urgencySponsor',
        link: '#finances',
        linkText: 'dashboard.urgencyLinkFinances'
      }
    }

    const items = this._urgencies.map(u => {
      const config = urgencyMap[u.type]
      if (!config) return ''
      const message = t(config.text, { count: u.count || 0 })
      return `<li class="mb-2">${message} <a class="text-info" href="${config.link}"> 👉 ${t(config.linkText)}</a></li>`
    }).filter(Boolean).join('')

    const delay = wasManagerChatShown(this.gameDay, this.season) ? 0 : 1500
    setTimeout(() => {
      showOverlay(
        t('dashboard.urgencyTitle'),
        t('dashboard.urgencySubtitle'),
        `<ul class="list-unstyled mb-0">${items}</ul>`
      )
      localStorage.setItem(storageKey, 'true')
    }, delay)
  }

  /**
   * @param {{ player_id?: string }} queryParams
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ player_id: playerId }) {
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

  /**
   * Render cup games section
   * @returns {GameSlider|string}
   */
  _renderCupGames () {
    if (this._cupGames.length === 0) {
      return `
        <div class="card bg-light border-0">
          <div class="card-body text-center text-muted py-4">
            <i class="fa fa-trophy fa-2x mb-2 opacity-50"></i>
            <p class="mb-0">${t('cup.noGames')}</p>
          </div>
        </div>
      `
    }

    const cupSliderArgs = {
      games: this._cupGames,
      teamId: this.team.id,
      initialIndex: this._findInitialSlideIndex(this._cupGames)
    }

    return new GameSlider(cupSliderArgs)
  }

  /**
   * Render friendly games section
   * @returns {GameSlider|string}
   */
  _renderFriendlyGames () {
    if (this._friendlyGames.length === 0) {
      return `
        <div class="card bg-light border-0">
          <div class="card-body text-center text-muted py-4">
            <i class="fa fa-handshake-o fa-2x mb-2 opacity-50"></i>
            <p class="mb-0">${t('friendly.noGames')}</p>
          </div>
        </div>
      `
    }

    const friendlySliderArgs = {
      games: this._friendlyGames,
      teamId: this.team.id,
      initialIndex: this._friendlyGames.length - 1
    }

    return new GameSlider(friendlySliderArgs)
  }

  /**
   * @returns {string}
   */
  _renderMiniStanding () {
    if (!this.standing || this.standing.length === 0) {
      return ''
    }

    // Calculate which 5 teams to show based on user's position
    // Position is 1-indexed, array is 0-indexed
    const pos = this.teamPosition - 1
    let startIndex = Math.max(0, pos - 2)
    const endIndex = Math.min(this.standing.length, startIndex + 5)
    // Adjust start if we're near the end
    if (endIndex - startIndex < 5) {
      startIndex = Math.max(0, endIndex - 5)
    }

    const teamsToShow = this.standing.slice(startIndex, endIndex)

    const rows = teamsToShow.map((item, idx) => {
      const actualIndex = startIndex + idx
      const hasUser = Boolean(item.team.user_id)
      const id = generateId()
      const isMyTeam = this.team.id === item.team.id

      onClick('#' + id, () => goTo(`team?id=${item.team.id}`))

      const trClasses = [
        isMyTeam ? 'table-info' : '',
        !isMyTeam && actualIndex < 2 ? 'table-success' : '',
        !isMyTeam && actualIndex > 13 ? 'table-warning' : ''
      ]

      return `
        <tr id="${id}" class="${trClasses.join(' ')}">
          <th class="results-rank-cell">${actualIndex + 1}.</th>
          <td>
            <span class="emblem-thumb--sm">
              ${renderEmblem(item.team, 20)}
            </span>
            ${item.team.name} ${hasUser ? '<i class="fa fa-user" aria-hidden="true"></i>' : ''}
          </td>
          <td>${item.points}</td>
        </tr>
      `
    }).join('')

    return `
      <table class="table table-hover table-sm mb-0">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">${t('results.team')}</th>
            <th scope="col">${t('results.points')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
