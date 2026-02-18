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
import { showSearchOverlay } from '../partials/search.js'
import { ADMIN_USERNAME } from '../util/constants.js'

/**
 * @returns {void}
 */
export function hideNavigation () {
  el('.navbar-collapse')?.classList.remove('show')
}

export class GameLayout extends UIElement {
  _interval = null
  _nextGameInElementId = generateId()
  _nextGameDate = null
  _navItemEventIds = []
  _isDevelopment = false
  _username = ''
  _version = ''
  _gameDay = 0
  _season = 0

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="game-layout">
        <nav class="navbar navbar-expand-lg navbar-dark">
          <div class="navbar-content">
            <a class="navbar-brand" href="#">SoccerManagerIO</a>
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
                ${this._navItem('finances', `<i class="fa fa-money" aria-hidden="true"></i> ${t('nav.finances')}`)}
                ${this._navItem('stadium', `<i class="fa fa-futbol-o" aria-hidden="true"></i> ${t('nav.stadium')}`)}
                ${this._navItem('trades', `<i class="fa fa-handshake-o" aria-hidden="true"></i> ${t('nav.transfers')}`)}
              </ul>
              <button id="search-button-mobile" class="btn btn-link nav-settings-btn d-lg-none" type="button" aria-label="${t('nav.search')}">
                <i class="fa fa-search" aria-hidden="true"></i> ${t('nav.search')}
              </button>
              ${this._showPlayButton ? `<button id="play-button-mobile" class="btn btn-link nav-settings-btn d-lg-none" type="button" aria-label="${t('nav.run')}">
                <i class="fa fa-play" aria-hidden="true"></i> ${t('nav.run')}
              </button>` : ''}
              <button id="settings-button-mobile" class="btn btn-link nav-settings-btn d-lg-none" type="button" aria-label="${t('nav.settings')}">
                <i class="fa fa-cog" aria-hidden="true"></i> ${t('nav.settings')}
              </button>
            </div>
            <button id="search-button" class="btn btn-link nav-settings-btn d-none d-lg-block" type="button" aria-label="${t('nav.search')}">
              <i class="fa fa-search fa-lg" aria-hidden="true"></i>
            </button>
            ${this._showPlayButton ? `<button id="play-button" class="btn btn-link nav-settings-btn d-none d-lg-block" type="button" aria-label="${t('nav.run')}">
              <i class="fa fa-play fa-lg" aria-hidden="true"></i>
            </button>` : ''}
            <button id="settings-button" class="btn btn-link nav-settings-btn d-none d-lg-block" type="button" aria-label="${t('nav.settings')}">
              <i class="fa fa-cog fa-lg" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
        <div class="info-bar">
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
          </div>
        </div>
        <div class="container" id="page"></div>
        <footer class="app-footer">
          <span class="text-muted">SoccerManagerIO v${this._version}</span>
          <br>
          <a href="imprint.html" class="text-muted">${t('footer.imprintPrivacy')}</a>
        </footer>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
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

  /**
   * @returns {void}
   */
  onMounted () {
    this._attachEventHandlers()
    this._startTimer()
  }

  /**
   * @returns {void}
   */
  onDestroy () {
    this._stopTimer()
    this._cleanupNavItemEvents()
  }

  /**
   * @returns {void}
   */
  _attachEventHandlers () {
    const settingsBtn = document.querySelector(`${this._elementQuery} #settings-button`)
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        hideNavigation()
        this._showSettingsOverlay()
      })
    }

    const settingsBtnMobile = document.querySelector(`${this._elementQuery} #settings-button-mobile`)
    if (settingsBtnMobile) {
      settingsBtnMobile.addEventListener('click', () => {
        hideNavigation()
        this._showSettingsOverlay()
      })
    }

    const searchBtn = document.querySelector(`${this._elementQuery} #search-button`)
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        hideNavigation()
        showSearchOverlay()
      })
    }

    const searchBtnMobile = document.querySelector(`${this._elementQuery} #search-button-mobile`)
    if (searchBtnMobile) {
      searchBtnMobile.addEventListener('click', () => {
        hideNavigation()
        showSearchOverlay()
      })
    }

    const playBtn = document.querySelector(`${this._elementQuery} #play-button`)
    if (playBtn) {
      playBtn.addEventListener('click', () => this._triggerGameDay(playBtn))
    }

    const playBtnMobile = document.querySelector(`${this._elementQuery} #play-button-mobile`)
    if (playBtnMobile) {
      playBtnMobile.addEventListener('click', () => {
        hideNavigation()
        this._triggerGameDay(playBtnMobile)
      })
    }

    const toggleBtn = document.querySelector(`${this._elementQuery} .navbar-toggler`)
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const navCollapse = el('.navbar-collapse')
        if (navCollapse) {
          navCollapse.classList.toggle('show')
        }
      })
    }
  }

  /**
   * @returns {boolean}
   */
  get _showPlayButton () {
    return this._isDevelopment || this._username === ADMIN_USERNAME
  }

  /**
   * Shows the settings overlay with language and logout options
   * @returns {void}
   */
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

    // Attach event handlers after overlay is shown
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

  /**
   * @param {HTMLButtonElement} btn
   * @returns {Promise<void>}
   */
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

  /**
   * @returns {void}
   */
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
   * @param {string} path
   * @param {string} text
   * @returns {string}
   */
  _navItem (path, text) {
    const id = generateId()
    const eventId = on('page-changed', () => {
      const isCurrentPage = window.location.hash.substring(1).split('?')[0] === path
      el('#' + id)?.classList[isCurrentPage ? 'add' : 'remove']('active')
    })
    this._navItemEventIds.push(eventId)

    return `
      <li id="${id}" class="nav-item">
        <a class="nav-link w-100 text-center" href="#${path}">
          ${text}
        </a>
      </li>
    `
  }
}

// Backwards compatibility
/**
 * @returns {Promise<string>}
 */
export async function renderGameLayout () {
  return new GameLayout().toString()
}
