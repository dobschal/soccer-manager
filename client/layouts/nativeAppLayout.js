import { UIElement } from '../lib/UIElement.js'
import { off, on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { t } from '../i18n/index.js'
import { showSettingsOverlay } from '../partials/settingsOverlay.js'

export class NativeAppLayout extends UIElement {
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
    this._isAdmin = teamData.isAdmin || false
    this._version = versionData.version
    this._gameDay = currentGameday.gameDay
    this._season = currentGameday.season
    this._newMessageCount = newMessageResponse.count || 0
  }

  get template () {
    return `
      <div class="native-app-layout">
        <div class="native-top-bar">
          <div class="info-bar-content">
            <img src="assets/logo.svg" alt="Logo" class="info-bar-logo" id="info-bar-logo">
            <div class="info-bar-links">
              <a href="#results" class="info-bar-item text-decoration-none text-white border-0">
                <i class="fa fa-calendar" aria-hidden="true"></i> 
                ${this._gameDay + 1} (${this._season + 1})
              </a>
              <a href="#dashboard" class="info-bar-item text-decoration-none text-white border-0" id="${this._nextGameInElementId}">
              </a>
              <a href="#club?sub_page=finances" class="info-bar-item text-decoration-none text-white border-0">
                <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
              </a>
            </div>
            <button id="settings-button" class="native-settings-btn" type="button" aria-label="${t('nav.settings')}">
              <i class="fa fa-cog text-info" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div id="page"></div>
        <nav class="native-tab-bar">
          ${this._tabItem('dashboard', 'fa-home', t('nav.home'))}
          ${this._tabItem('my-team', 'fa-users', t('nav.team'))}
          ${this._tabItem('results', 'fa-trophy', t('nav.league'))}
          ${this._tabItem('club', 'fa-futbol-o', t('nav.club'))}
          ${this._tabItem('trades', 'fa-handshake-o', t('nav.transfers'))}
        </nav>
      </div>
    `
  }

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

  onMounted () {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    })
    this._attachEventHandlers()
    this._startTimer()
    setTimeout(() => document.querySelector(`${this._elementQuery} .native-tab-bar`)
      ?.classList.remove('hidden'), 1000)
  }

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
  _isAdmin = false
  _username = ''
  _version = ''
  _gameDay = 0
  _season = 0
  _scrollHandler = null

  _attachEventHandlers () {
    const settingsBtn = document.querySelector(`${this._elementQuery} #settings-button`)
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        showSettingsOverlay({
          isAdmin: this._isAdmin,
          version: this._version
        })
      })
    }
    const logoBtn = document.querySelector(`${this._elementQuery} #info-bar-logo`)
    if (logoBtn) {
      logoBtn.addEventListener('click', () => {
        window.location.hash = 'dashboard'
        window.location.reload()
      })
    }
  }

  _updateMessageBadge () {
    const badgeEl = el('#' + this._messageBadgeId)
    if (!badgeEl) return
    if (this._newMessageCount > 0) {
      badgeEl.innerHTML = `<i class="fa fa-envelope" aria-hidden="true"></i> <span class="badge rounded-pill bg-danger">${this._newMessageCount}</span>`
    } else {
      badgeEl.innerHTML = '<i class="fa fa-envelope" aria-hidden="true"></i>'
    }
  }

  _startTimer () {
    if (this._interval) clearInterval(this._interval)

    const tick = () => {
      const diff = new Date(Date.parse(this._nextGameDate)).getTime() - Date.now()
      if (diff < 0) {
        server.getNextGameDate()
          .then(r => (this._nextGameDate = r.date))
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

  _stopTimer () {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  _cleanupNavItemEvents () {
    this._navItemEventIds.forEach(id => off(id))
    this._navItemEventIds = []
  }

  _tabItem (path, icon, label) {
    const id = generateId()
    const eventId = on('page-changed', () => {
      const currentPath = window.location.hash.substring(1).split('?')[0]
      const isCurrentPage = currentPath === path || (path === 'dashboard' && currentPath === '')
      el('#' + id)?.classList[isCurrentPage ? 'add' : 'remove']('active')
    })
    this._navItemEventIds.push(eventId)

    return `
      <a id="${id}" class="native-tab-item" href="#${path}">
        <i class="fa ${icon}" aria-hidden="true"></i>
        <span>${label}</span>
      </a>
    `
  }
}
