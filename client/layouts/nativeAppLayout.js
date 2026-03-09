import { UIElement } from '../lib/UIElement.js'
import { off, on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { getLocale, setLocale, t } from '../i18n/index.js'
import { showConfirmDialog, showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'
import { ADMIN_USERNAME } from '../util/constants.js'

export class NativeAppLayout extends UIElement {
  _interval = null
  _nextGameInElementId = generateId()
  _messageBadgeId = generateId()
  _nextGameDate = null
  _newMessageCount = 0
  _navItemEventIds = []
  _isDevelopment = false
  _username = ''
  _version = ''
  _gameDay = 0
  _season = 0
  _scrollHandler = null

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

  get template () {
    return `
      <div class="native-app-layout">
        <div class="native-top-bar">
          <div class="info-bar-content">
            <a href="#results" class="info-bar-item text-decoration-none text-info border-0">
              <i class="fa fa-calendar" aria-hidden="true"></i> ${t('nav.day', {
      gameDay: this._gameDay + 1,
      season: this._season + 1
    })}
            </a>
            <a href="#dashboard" class="info-bar-item text-decoration-none text-info border-0" id="${this._nextGameInElementId}">
            </a>
            <a href="#club?sub_page=finances" class="info-bar-item text-decoration-none text-info border-0">
              <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
            </a>
            <button id="search-button" class="native-settings-btn" type="button" aria-label="${t('nav.search')}">
              <i class="fa fa-search" aria-hidden="true"></i>
            </button>
            <button id="settings-button" class="native-settings-btn" type="button" aria-label="${t('nav.settings')}">
              <i class="fa fa-cog" aria-hidden="true"></i>
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

  async load () {
    const lastSeenMessageId = Number(localStorage.getItem('lastSeenMessageId')) || 0
    const [gameDate, devMode, versionData, currentGameday, teamData, newMessageResponse] = await Promise.all([
      server.getNextGameDate(),
      server.isDevelopment(),
      server.getVersion(),
      server.getCurrentGameday(),
      server.getMyTeam(),
      server.getNewLogMessageCount(lastSeenMessageId)
    ])
    this._nextGameDate = gameDate.date
    this._isDevelopment = devMode.isDevelopment
    this._username = teamData.user?.username || ''
    this._version = versionData.version
    this._gameDay = currentGameday.gameDay
    this._season = currentGameday.season
    this._newMessageCount = newMessageResponse.count || 0
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

  _attachEventHandlers () {
    const searchBtn = document.querySelector(`${this._elementQuery} #search-button`)
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        goTo('browse')
      })
    }

    const settingsBtn = document.querySelector(`${this._elementQuery} #settings-button`)
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this._showSettingsOverlay()
      })
    }
  }

  get _showPlayButton () {
    return this._isDevelopment || this._username === ADMIN_USERNAME
  }

  _showSettingsOverlay () {
    const currentLocale = getLocale()

    const content = `
      <div class="settings-overlay-content">
        <div class="mb-3">
          <label class="form-label">${t('nav.language')}</label>
          <div class="btn-group w-100" role="group">
            <button id="settings-lang-en" class="btn ${currentLocale === 'en' ? 'btn-primary' : 'btn-outline-info'}">English</button>
            <button id="settings-lang-de" class="btn ${currentLocale === 'de' ? 'btn-primary' : 'btn-outline-info'}">Deutsch</button>
          </div>
        </div>
        <button id="settings-logout" class="btn btn-outline-danger w-100">
          <i class="fa fa-sign-out" aria-hidden="true"></i> ${t('nav.logout')}
        </button>
        <hr>
        <a href="support.html" class="btn btn-outline-info w-100 mb-2">
          <i class="fa fa-life-ring" aria-hidden="true"></i> ${t('nav.support')}
        </a>
        <button id="settings-delete-account" class="btn btn-outline-danger w-100">
          <i class="fa fa-trash" aria-hidden="true"></i> ${t('nav.deleteAccount')}
        </button>
        ${window.__NATIVE_SERVER_URL ? `
        <div class="mt-3 text-muted small" id="settings-version-info">
          <hr>
          <div>Server: v${this._version}</div>
          <div id="settings-client-version">${t('common.loading')}</div>
        </div>
        ` : ''}
      </div>
    `

    const overlay = showOverlay(t('nav.settings'), '', content)

    setTimeout(() => {
      const langEnBtn = el('#settings-lang-en')
      const langDeBtn = el('#settings-lang-de')
      const logoutBtn = el('#settings-logout')

      if (langEnBtn) {
        langEnBtn.addEventListener('click', async () => {
          if (currentLocale !== 'en') {
            setLocale('en')
            try {
              await server.setLanguage('en')
            } catch (err) {
              console.error('Failed to save language preference:', err)
            }
            window.location.reload()
          }
        })
      }

      if (langDeBtn) {
        langDeBtn.addEventListener('click', async () => {
          if (currentLocale !== 'de') {
            setLocale('de')
            try {
              await server.setLanguage('de')
            } catch (err) {
              console.error('Failed to save language preference:', err)
            }
            window.location.reload()
          }
        })
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          overlay.remove()
          disconnectWebSocket()
          window.localStorage.removeItem('auth-token')
          goTo('login')
        })
      }

      const deleteAccountBtn = el('#settings-delete-account')
      if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', async () => {
          const confirmed = await showConfirmDialog(t('nav.deleteAccountConfirm'), t('nav.deleteAccount'))
          if (!confirmed) return
          try {
            await server.deleteAccount()
            overlay.remove()
            disconnectWebSocket()
            window.localStorage.removeItem('auth-token')
            goTo('login')
          } catch (err) {
            toast(err.message ?? t('toast.somethingWentWrong'), 'error')
          }
        })
      }

      // Load client version info for native app
      if (window.__NATIVE_SERVER_URL) {
        const clientVersionEl = el('#settings-client-version')
        if (clientVersionEl) {
          fetch('./native-version.json')
            .then(r => r.json())
            .then(data => {
              clientVersionEl.textContent = `Client: v${data.version} (${data.commitHash})`
            })
            .catch(() => {
              clientVersionEl.textContent = 'Client: unknown'
            })
        }
      }
    }, 0)
  }

  async _triggerGameDay (btn) {
    try {
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>'
      await server.triggerGameDay()
      toast(t('toast.gameDayCompleted'), 'success')
      window.location.reload()
    } catch (e) {
      console.error(e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
      btn.disabled = false
      btn.innerHTML = '<i class="fa fa-play fa-lg" aria-hidden="true"></i>'
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
