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

export class DashboardPage extends UIElement {
  _timerInterval = null
  _countdownElementId = generateId()
  team = {}
  user = {}
  season = 0
  gameDay = 0
  game = {}
  gameTeam1 = null
  gameTeam2 = null
  nextGame = null
  nextGameDate = null
  nextGameOpponent = null
  standing = []
  teamPosition = 0

  /**
   * @returns {string}
   */
  get template () {
    const isHomeGame = this.game.team1Id === this.team.id
    const myGoals = isHomeGame ? this.game.goalsTeam1 : this.game.goalsTeam2
    const opponentGoals = isHomeGame ? this.game.goalsTeam2 : this.game.goalsTeam1
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

    return `
      <div>
        <h2>${this.team.name}</h2>
        <div class="d-flex align-items-start gap-3 mb-4">
          <div class="manager-chat d-none d-lg-block">
            <div class="chat-bubble">
              <p class="mb-1">${t('dashboard.hey')} <b>${this.user.username}</b>!</p>
              <p class="mb-1">${t('dashboard.teamPosition', { position: this._getPositionText(), league: this.team.level + 1 })}</p>
              <p class="mb-0">${t('dashboard.gameDayInfo', { gameDay: Math.max(1, this.gameDay), season: this.season + 1, opponent: isHomeGame ? this.game.team2 : this.game.team1 })} ${resultMessage}</p>
            </div>
            <img src="assets/manager-3.png" alt="Manager" class="manager-image" style="width: 300px; height: auto;">
          </div>
          <div class="flex-grow-1">
            ${this._renderLatestGame()}
            ${this._renderUpcomingGame()}
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

    const resultsResponse = await server.getResults(this.gameDay - 1, this.season, this.team.level, this.team.league)
    this.game = resultsResponse.results.find(r => r.team1Id === this.team.id || r.team2Id === this.team.id) ?? {}

    // Fetch team data for emblems
    if (this.game.team1Id && this.game.team2Id) {
      const [team1Response, team2Response] = await Promise.all([
        server.getTeamById(this.game.team1Id),
        server.getTeamById(this.game.team2Id)
      ])
      this.gameTeam1 = team1Response
      this.gameTeam2 = team2Response
    }

    // Fetch next upcoming game
    const nextGameResponse = await server.getNextGame()
    this.nextGame = nextGameResponse.game
    this.nextGameDate = nextGameResponse.nextGameDate
    this.nextGameOpponent = nextGameResponse.opponent

    // Fetch current standing to show league position
    this.standing = await server.getStanding(this.gameDay - 1, this.season, this.team.level, this.team.league)
    this.teamPosition = this.standing.findIndex(s => s.team.id === this.team.id) + 1
  }

  /**
   * @returns {void}
   */
  onMounted () {
    this._startCountdownTimer()
    void showTutorialIfNeeded('dashboard')
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
    if (!this.nextGameDate) return

    this._timerInterval = setInterval(() => {
      const diff = new Date(this.nextGameDate).getTime() - Date.now()
      const timerEl = el('#' + this._countdownElementId)

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
  _renderLatestGame () {
    if (!this.game || !this.game.id) {
      return ''
    }

    const isHomeGame = this.game.team1Id === this.team.id

    return `
      <div class="card card-body bg-dark mb-2">
        <a class="row d-flex align-items-center flex-nowrap" href="#results?game_id=${this.game.id}">
          <div class="col text-white text-center ${isHomeGame ? 'font-weight-bold' : ''}">
            <div class="mb-2">${this.gameTeam1 ? renderEmblem(this.gameTeam1, 60) : ''}</div>
            <h6 class="mb-0">${this.game.team1 ?? ''}</h6>
          </div>
          <div class="col-auto text-center">
            <small class="text-white d-block mb-1">${t('dashboard.latestResult')}</small>
            <h3 class="mb-0"><span class="badge bg-info">${this.game.goalsTeam1 ?? '-'}:${this.game.goalsTeam2 ?? '-'}</span></h3>
          </div>
          <div class="col text-white text-center ${!isHomeGame ? 'font-weight-bold' : ''}">
            <div class="mb-2">${this.gameTeam2 ? renderEmblem(this.gameTeam2, 60) : ''}</div>
            <h6 class="mb-0">${this.game.team2 ?? ''}</h6>
          </div>
        </a>
      </div>
    `
  }

  /**
   * @returns {string}
   */
  _renderUpcomingGame () {
    if (!this.nextGame || !this.nextGameOpponent) {
      return ''
    }

    const isHomeGame = this.nextGame.team1Id === this.team.id

    return `
      <div class="card card-body bg-dark">
        <div class="row d-flex align-items-center flex-nowrap">
          <div class="col text-white text-center ${isHomeGame ? 'font-weight-bold' : ''}">
            <div class="mb-2">${isHomeGame ? renderEmblem(this.team, 60) : renderEmblem(this.nextGameOpponent, 60)}</div>
            <h6 class="mb-0">${isHomeGame ? this.team.name : this.nextGameOpponent.name}</h6>
          </div>
          <div class="col-auto text-center">
            <small class="text-white d-block mb-1">${t('dashboard.nextMatch')}</small>
            <div class="badge bg-info p-2" style="font-size: 1.2rem;">
              <i class="fa fa-clock-o" aria-hidden="true"></i><br>
              <span id="${this._countdownElementId}">--:--:--</span>
            </div>
          </div>
          <div class="col text-white text-center ${!isHomeGame ? 'font-weight-bold' : ''}">
            <div class="mb-2">${!isHomeGame ? renderEmblem(this.team, 60) : renderEmblem(this.nextGameOpponent, 60)}</div>
            <h6 class="mb-0">${!isHomeGame ? this.team.name : this.nextGameOpponent.name}</h6>
          </div>
        </div>
      </div>
    `
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderDashboardPage () {
  return new DashboardPage().toString()
}
