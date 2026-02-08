import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { News } from '../partials/news.js'
import { renderEmblem } from '../partials/emblem.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { el, generateId } from '../lib/html.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { ActionCards } from '../partials/actionCards.js'
import { LogMessages } from '../partials/logMessages.js'
import { t } from '../i18n/index.js'
import { showManagerChat, wasManagerChatShown } from '../partials/managerChat.js'
import { goTo } from '../lib/router.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { GameSlider } from '../partials/gameSlider.js'

export class DashboardPage extends UIElement {
  _timerInterval = null
  _gameSlider = null
  _sliderGames = []
  _initialSlideIndex = 0
  team = {}
  user = {}
  season = 0
  gameDay = 0
  nextGameDate = null
  standing = []
  teamPosition = 0

  /**
   * @returns {string}
   */
  get template () {
    // Create the game slider instance
    this._gameSlider = new GameSlider({
      games: this._sliderGames,
      teamId: this.team.id,
      initialIndex: this._initialSlideIndex
    })

    return `
      <div>
        <h2 class="d-flex gap-3 align-items-center">${renderEmblem(this.team, 40)} ${this.team.name}</h2>
        <div class="d-flex align-items-center mb-5" style="gap: 4rem;">
          <div class="flex-grow-1">
            ${this._gameSlider}
          </div>
          <div class="d-none d-lg-block flex-shrink-1" style="min-width: 280px; width: 33%;">
            ${this._renderMiniStanding()}
            <a href="#results" class="d-block mt-2 text-info border-0" style="width: 100%; text-align: right">
                <small>...${t('dashboard.standingLink')}</small>
            </a>
          </div>
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

    // Fetch games for slider (past 3 and upcoming 3)
    const sliderResponse = await server.getGamesForSlider(3, 3)
    this.nextGameDate = sliderResponse.nextGameDate

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
        team1Data: this._extractTeamData(g, 1),
        team2Data: this._extractTeamData(g, 2)
      }))
    ]

    // Set initial slide to the latest played game (last of past games)
    this._initialSlideIndex = Math.max(0, sliderResponse.pastGames.length - 1)

    // Fetch current standing to show league position
    this.standing = await server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league)
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
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
   * @returns {void}
   */
  onMounted () {
    this._startCountdownTimer()
    void showTutorialIfNeeded('dashboard')
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
   * @returns {void}
   */
  onDestroy () {
    this._stopCountdownTimer()
  }

  /**
   * @returns {void}
   */
  _startCountdownTimer () {
    if (this._timerInterval) clearInterval(this._timerInterval)
    if (!this.nextGameDate || !this._gameSlider) return

    const countdownElementId = this._gameSlider.getCountdownElementId()

    this._timerInterval = setInterval(() => {
      const diff = new Date(this.nextGameDate).getTime() - Date.now()
      const timerEl = el('#' + countdownElementId)

      if (!timerEl) {
        this._stopCountdownTimer()
        return
      }

      if (diff < 0) {
        timerEl.innerHTML = t('dashboard.startingSoon')
        return
      }

      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const twoDigits = (v) => v < 10 ? '0' + v : v

      timerEl.innerHTML = `${twoDigits(hours)}:${twoDigits(minutes % 60)}:${twoDigits(seconds % 60)}`
    }, 1000)
  }

  /**
   * @returns {void}
   */
  _stopCountdownTimer () {
    if (this._timerInterval) {
      clearInterval(this._timerInterval)
      this._timerInterval = null
    }
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

      onClick('#' + id, () => goTo(`team?id=${item.team.id}`))

      const trClasses = [
        this.team.id === item.team.id ? 'table-info' : '',
        actualIndex < 2 ? 'table-success' : '',
        actualIndex > 13 ? 'table-warning' : ''
      ]

      return `
        <tr id="${id}" class="${trClasses.join(' ')}">
          <th style="width: 30px">${actualIndex + 1}.</th>
          <td>
            <span style="display: inline-block; width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; margin-top: -4px;">
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
