import { UIElement } from '../lib/UIElement.js'
import { off, on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'

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
  _version = ''
  _gameDay = 0
  _season = 0

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="game-layout">
        <nav class="navbar navbar-expand-lg navbar-light bg-light">
          <a class="navbar-brand px-3" href="#">SoccerManagerIO</a>
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
            <ul class="navbar-nav px-2">
              ${this._navItem('dashboard', '<i class="fa fa-home" aria-hidden="true"></i> Home')}
              ${this._navItem('my-team', '<i class="fa fa-users" aria-hidden="true"></i> Team')}
              ${this._navItem('results', '<i class="fa fa-trophy" aria-hidden="true"></i> League')}
              ${this._navItem('finances', '<i class="fa fa-money" aria-hidden="true"></i> Finances')}
              ${this._navItem('stadium', '<i class="fa fa-futbol-o" aria-hidden="true"></i> Stadium')}
              ${this._navItem('trades', '<i class="fa fa-handshake-o" aria-hidden="true"></i> Trades')}
            </ul>
            <div class="px-2 d-none d-lg-block">|</div>
            <div class="navbar-info-item px-2 d-none d-xl-block">
              <i class="fa fa-calendar" aria-hidden="true"></i> Day ${this._gameDay} (${this._season + 1})
            </div>
            <div class="navbar-info-item px-2 d-none d-xl-block" id="${this._nextGameInElementId}">
            </div>
            <div class="navbar-info-item px-2 d-none d-lg-block">
                <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
            </div>
            <button id="dev-trigger-button" class="btn btn-outline-warning my-2 my-sm-0 mx-1 ${this._isDevelopment ? '' : 'hidden'}" type="button">
              <i class="fa fa-play" aria-hidden="true"></i> Run
            </button>
            <button id="logout-button" class="btn btn-outline-info my-2 my-sm-0" type="submit">Logout</button>
          </div>
        </nav>
        <div class="container" id="page"></div>
        <footer class="app-footer">
          <span class="text-muted">SoccerManagerIO v${this._version}</span>
        </footer>
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async load () {
    const [gameDate, devMode, versionData, currentGameday] = await Promise.all([
      server.getNextGameDate(),
      server.isDevelopment(),
      server.getVersion(),
      server.getCurrentGameday()
    ])
    this._nextGameDate = gameDate.date
    this._isDevelopment = devMode.isDevelopment
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
    const logoutBtn = document.querySelector(`${this._elementQuery} #logout-button`)
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        hideNavigation()
        window.localStorage.removeItem('auth-token')
        goTo('login')
      })
    }

    const devTriggerBtn = document.querySelector(`${this._elementQuery} #dev-trigger-button`)
    if (devTriggerBtn) {
      devTriggerBtn.addEventListener('click', async () => {
        try {
          devTriggerBtn.disabled = true
          devTriggerBtn.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Running...'
          await server.triggerGameDay()
          toast('Game day completed!', 'success')
          window.location.reload()
        } catch (e) {
          console.error(e)
          toast(e.message ?? 'Something went wrong', 'error')
        } finally {
          devTriggerBtn.disabled = false
          devTriggerBtn.innerHTML = '<i class="fa fa-play" aria-hidden="true"></i> Run Game Day'
        }
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
   * @returns {void}
   */
  _startTimer () {
    if (this._interval) clearInterval(this._interval)

    this._interval = setInterval(() => {
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
    }, 1000)
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
