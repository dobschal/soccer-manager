import { UIElement } from '../lib/UIElement.js'
import { on, off } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { Balance } from '../partials/balance.js'
import { server } from '../lib/gateway.js'

export function hideNavigation () {
  el('.navbar-collapse')?.classList.remove('show')
}

export class GameLayout extends UIElement {
  _interval = null
  _mobileNavigationOpen = false
  _nextGameInElementId = generateId()
  _nextGameDate = null
  _navItemEventIds = []

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
              ${this._navItem('my-team', '<i class="fa fa-users" aria-hidden="true"></i> Team')}
              ${this._navItem('results', '<i class="fa fa-trophy" aria-hidden="true"></i> League')}
              ${this._navItem('finances', '<i class="fa fa-money" aria-hidden="true"></i> Finances')}
              ${this._navItem('stadium', '<i class="fa fa-futbol-o" aria-hidden="true"></i> Stadium')}
              ${this._navItem('trades', '<i class="fa fa-handshake-o" aria-hidden="true"></i> Trades')}
            </ul>
            <div class="px-2 d-none d-md-block">|</div>
            <div class="navbar-info-item px-2" id="${this._nextGameInElementId}">
            </div>
            <div class="navbar-info-item px-2">
                <i class="fa fa-money" aria-hidden="true"></i> ${new Balance()}
            </div>
            <button id="logout-button" class="btn btn-outline-info my-2 my-sm-0" type="submit">Logout</button>
          </div>
        </nav>
        <div class="container" id="page"></div>
      </div>
    `
  }

  async load () {
    const response = await server.getNextGameDate()
    this._nextGameDate = response.date
  }

  onMounted () {
    this._attachEventHandlers()
    this._startTimer()
  }

  onDestroy () {
    this._stopTimer()
    this._cleanupNavItemEvents()
  }

  _attachEventHandlers () {
    const logoutBtn = document.querySelector(`${this._elementQuery} #logout-button`)
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        hideNavigation()
        window.localStorage.removeItem('auth-token')
        goTo('login')
      })
    }

    const toggleBtn = document.querySelector(`${this._elementQuery} .navbar-toggler`)
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this._mobileNavigationOpen = !this._mobileNavigationOpen
        el('.navbar-collapse').classList[this._mobileNavigationOpen ? 'add' : 'remove']('show')
      })
    }
  }

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

  _navItem (path, text) {
    const id = generateId()
    const eventId = on('page-changed', () => {
      const isCurrentPage = window.location.hash.substring(1).split('?')[0] === path
      el('#' + id)?.classList[isCurrentPage ? 'add' : 'remove']('active')
    })
    this._navItemEventIds.push(eventId)

    return `
      <li id="${id}" class="nav-item">
        <a class="nav-link" href="#${path}">
          ${text}
        </a>
      </li>
    `
  }
}

// Backwards compatibility
export async function renderGameLayout () {
  return new GameLayout().toString()
}
