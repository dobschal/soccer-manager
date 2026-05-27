import { UIElement } from '../lib/UIElement.js'
import { off, on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { t } from '../i18n/index.js'
import { showAccountOverlay } from '../partials/accountOverlay.js'
import { currentGamedayLabel } from '../lib/currentGamedayLabel.js'
import { maybeShowEmailPrompt } from '../partials/emailPromptDialog.js'

/**
 * @returns {void}
 */
export function hideNavigation () {
  el('.navbar-collapse')?.classList.remove('show')
}

export class GameLayout extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    const lastSeenMessageId = Number(localStorage.getItem('lastSeenMessageId')) || 0
    const [gameDate, versionData, currentGameday, teamData, newMessageResponse] = await Promise.all([
      server.getNextGameDate(),
      server.getVersion(),
      server.getCurrentGameday(),
      server.getMyTeam(),
      server.getNewLogMessageCount(lastSeenMessageId)
    ])
    this._nextGameDate = gameDate.date
    this._username = teamData.user?.username || ''
    this._avatar = teamData.user?.avatar || ''
    this._version = versionData.version
    this._gameDay = currentGameday.gameDay
    this._season = currentGameday.season
    this._currentGameday = currentGameday
    this._newMessageCount = newMessageResponse.count || 0
    maybeShowEmailPrompt(teamData.user)
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="game-layout">
        <nav class="navbar navbar-expand-lg navbar-dark">
          <div class="navbar-content">
            <a class="navbar-brand" href="#">
                <img src="assets/logo.svg" alt="FootballManager.IO" height="28">
                <span class="ps-2">FootballManager.IO</span>
            </a>
            <button class="navbar-toggler"
                    type="button"
                    data-toggle="collapse"
                    data-target="#navbarNav"
                    aria-controls="navbarNav"
                    aria-expanded="false"
                    aria-label="Toggle navigation">
              <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
              <ul class="navbar-nav navbar-nav-center gap-2">
                ${this._navItem('dashboard', `<i class="fa fa-home" aria-hidden="true"></i> ${t('nav.home')}`)}
                ${this._navItem('my-team', `<i class="fa fa-users" aria-hidden="true"></i> ${t('nav.team')}`)}
                ${this._navItem('results', `<i class="fa fa-trophy" aria-hidden="true"></i> ${t('nav.league')}`)}
                ${this._navItem('club', `<i class="fa fa-futbol-o" aria-hidden="true"></i> ${t('nav.club')}`)}
                ${this._navItem('trades', `<i class="fa fa-handshake-o" aria-hidden="true"></i> ${t('nav.transfers')}`)}
              </ul>
              <button id="settings-button-mobile" class="btn btn-link nav-settings-btn d-lg-none" type="button" aria-label="${t('nav.settings')}">
                <i class="fa fa-cog" aria-hidden="true"></i> ${t('nav.settings')}
              </button>
            </div>
            <button id="settings-button" class="btn btn-link nav-settings-btn nav-avatar-btn d-none d-lg-block" type="button" aria-label="${t('nav.settings')}">
              ${this._avatarImg()}
            </button>
          </div>
        </nav>
        <div class="info-bar">
          <div class="info-bar-content">
            <a href="#results" class="info-bar-item text-decoration-none text-info border-0">
              <i class="fa fa-calendar" aria-hidden="true"></i> ${currentGamedayLabel(this._currentGameday)}
            </a>
            <a href="#dashboard" class="info-bar-item text-decoration-none text-info border-0" id="${this._nextGameInElementId}">
            </a>
            <a href="#club?sub_page=finances" class="info-bar-item text-decoration-none text-info border-0">
              <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
            </a>
          </div>
        </div>
        <div class="container mb-sm-5" id="page"></div>
        <footer class="app-footer">
          <span class="text-muted">FootballManager.IO v${this._version}</span>
          <br>
          <a href="imprint.html" class="text-muted">${t('footer.imprintPrivacy')}</a>
          <span class="text-muted"> | </span>
          <a href="support.html" class="text-muted">${t('footer.support')}</a>
        </footer>
      </div>
    `
  }
  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '#settings-button': {
        click: () => {
          hideNavigation()
          showAccountOverlay()
        }
      },
      '(optional)#settings-button-mobile': {
        click: () => {
          hideNavigation()
          showAccountOverlay()
        }
      },
      '.navbar-toggler': {
        click: () => {
          const navCollapse = el('.navbar-collapse')
          if (navCollapse) {
            navCollapse.classList.toggle('show')
          }
        }
      }
    }
  }
  /**
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      BUY_OFFER_ACCEPTED: (data) => {
        toast(t('trades.buyOfferAccepted', {
          playerName: data.playerName,
          teamName: data.sellerTeamName,
          price: data.price
        }), 'success')
      },
      BUY_OFFER_REJECTED: (data) => {
        toast(t('trades.buyOfferRejected', {
          playerName: data.playerName,
          teamName: data.sellerTeamName
        }), 'error')
      },
      NEW_LOG_MESSAGE: () => {
        this._newMessageCount++
        this._updateMessageBadge()
      }
    }
  }
  /**
   * @returns {void}
   */
  onMounted () {
    this._startTimer()
  }

  /**
   * @returns {void}
   */
  onDestroy () {
    this._stopTimer()
    this._cleanupNavItemEvents()
  }

  _interval = null

  _nextGameInElementId = generateId()

  _messageBadgeId = generateId()
  _nextGameDate = null
  _newMessageCount = 0
  _navItemEventIds = []
  _username = ''
  _avatar = ''
  _version = ''
  _gameDay = 0
  _season = 0

  /**
   * @returns {void}
   */
  _updateMessageBadge () {
    const badgeEl = el('#' + this._messageBadgeId)
    if (!badgeEl) return
    if (this._newMessageCount > 0) {
      badgeEl.innerHTML = `<i class="fa fa-envelope" aria-hidden="true"></i> <span class="badge rounded-pill bg-danger">${this._newMessageCount}</span>`
    } else {
      badgeEl.innerHTML = '<i class="fa fa-envelope" aria-hidden="true"></i>'
    }
  }

  /**
   * @returns {void}
   */
  _startTimer () {
    if (this._interval) clearInterval(this._interval)

    const tick = () => {
      const diff = new Date(Date.parse(this._nextGameDate)).getTime() - Date.now()
      if (diff < 0) {
        server.getNextGameDate()
          .then(r => {
            this._nextGameDate = r.date
          })
          .catch(() => {
            this._stopTimer()
          })
      }

      const timerEl = el('#' + this._nextGameInElementId)
      if (!timerEl) {
        this._stopTimer()
        return
      }

      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const twoDigits = (v) => v < 10 ? '0' + v : v

      const time = `${hours}:${twoDigits(minutes % 60)}:${twoDigits(seconds % 60)}`

      timerEl.innerHTML = `<i class="fa fa-clock-o" aria-hidden="true"></i> ${time}`
    }

    tick()
    this._interval = setInterval(tick, 1000)
  }

  /**
   * @returns {void}
   */
  _stopTimer () {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  /**
   * @returns {void}
   */
  _cleanupNavItemEvents () {
    this._navItemEventIds.forEach(id => off(id))
    this._navItemEventIds = []
  }

  /**
   * @returns {string}
   */
  _avatarImg () {
    if (this._avatar) {
      const baseUrl = window.__NATIVE_SERVER_URL || ''
      return `<img class="nav-avatar" src="${baseUrl}/uploads/avatars/${this._avatar}" alt="${this._username}">`
    }
    return `<img class="nav-avatar nav-avatar--default" src="./assets/avatar-placeholder.svg" alt="${this._username}">`
  }

  /**
   * @param {string} path
   * @param {string} text
   * @returns {string}
   */
  _navItem (path, text) {
    const id = generateId()
    const eventId = on('page-changed', () => {
      const currentPath = window.location.hash.substring(1).split('?')[0]
      const isCurrentPage = (currentPath === path) || (currentPath === '' && path === 'dashboard')
      el('#' + id)?.classList[isCurrentPage ? 'add' : 'remove']('active')
    })
    this._navItemEventIds.push(eventId)

    return `
      <li class="nav-item">
        <a id="${id}" class="nav-link w-100 text-center" href="#${path}">
          ${text}
        </a>
      </li>
    `
  }
}
