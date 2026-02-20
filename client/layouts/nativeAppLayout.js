import { UIElement } from '../lib/UIElement.js'
import { off, on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { getLocale, setLocale, t } from '../i18n/index.js'
import { showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'
import { ADMIN_USERNAME } from '../util/constants.js'

export class NativeAppLayout extends UIElement {
  _interval = null
  _nextGameInElementId = generateId()
  _nextGameDate = null
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
        toast(t('trades.buyOfferAccepted', { playerName: data.playerName, teamName: data.sellerTeamName, price: data.price }), 'success')
      }
    }
  }

  get template () {
    return `
      <div class="game-layout native-app-layout">
        <div class="native-top-bar">
          <div class="info-bar-content">
            <div class="info-bar-item">
              <i class="fa fa-calendar" aria-hidden="true"></i> ${t('nav.day', {
      gameDay: this._gameDay + 1,
      season: this._season + 1
    })}
            </div>
            <div class="info-bar-item" id="${this._nextGameInElementId}">
            </div>
            <div class="info-bar-item">
              <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
            </div>
            <button id="settings-button" class="native-settings-btn" type="button" aria-label="${t('nav.settings')}">
              <i class="fa fa-cog" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="container" id="page"></div>
        <nav class="native-tab-bar">
          ${this._tabItem('dashboard', 'fa-home', t('nav.home'))}
          ${this._tabItem('my-team', 'fa-users', t('nav.team'))}
          ${this._tabItem('results', 'fa-trophy', t('nav.league'))}
          ${this._tabItem('stadium', 'fa-futbol-o', t('nav.club'))}
          ${this._tabItem('trades', 'fa-handshake-o', t('nav.transfers'))}
        </nav>
      </div>
    `
  }

  async load () {
    const [gameDate, devMode, versionData, currentGameday, teamData] = await Promise.all([
      server.getNextGameDate(),
      server.isDevelopment(),
      server.getVersion(),
      server.getCurrentGameday(),
      server.getMyTeam()
    ])
    this._nextGameDate = gameDate.date
    this._isDevelopment = devMode.isDevelopment
    this._username = teamData.user?.username || ''
    this._version = versionData.version
    this._gameDay = currentGameday.gameDay
    this._season = currentGameday.season
  }

  onMounted () {
    this._attachEventHandlers()
    this._startTimer()
    this._setupScrollListener()
  }

  onDestroy () {
    this._stopTimer()
    this._cleanupNavItemEvents()
    this._removeScrollListener()
  }

  _setupScrollListener () {
    const topBar = document.querySelector(`${this._elementQuery} .native-top-bar`)
    if (!topBar) return
    this._scrollHandler = () => {
      topBar.classList.toggle('hidden', window.scrollY > 10)
    }
    this._scrollHandler()
    window.addEventListener('scroll', this._scrollHandler, { passive: true })
  }

  _removeScrollListener () {
    if (this._scrollHandler) {
      window.removeEventListener('scroll', this._scrollHandler)
      this._scrollHandler = null
    }
  }

  _attachEventHandlers () {
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
            <button id="settings-lang-en" class="btn ${currentLocale === 'en' ? 'btn-info' : 'btn-outline-info'}">English</button>
            <button id="settings-lang-de" class="btn ${currentLocale === 'de' ? 'btn-info' : 'btn-outline-info'}">Deutsch</button>
          </div>
        </div>
        <button id="settings-logout" class="btn btn-outline-danger w-100">
          <i class="fa fa-sign-out" aria-hidden="true"></i> ${t('nav.logout')}
        </button>
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

      const time = hours > 0
        ? `${hours}h ${twoDigits(minutes % 60)}min`
        : `${twoDigits(minutes % 60)}min ${twoDigits(seconds % 60)}sec`

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
      const isCurrentPage = window.location.hash.substring(1).split('?')[0] === path
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
