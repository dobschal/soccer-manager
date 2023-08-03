import { on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { goTo } from '../lib/router.js'
import { balanceSpan } from '../partials/balance.js'
import { server } from '../lib/gateway.js'

let interval
let mobileNavigationOpen = false

export function hideNavigation () {
  mobileNavigationOpen = false
  el('.navbar-collapse')?.classList.remove('show')
}

export async function renderGameLayout () {
  const nextGameInElementId = generateId()

  const balance = await balanceSpan()

  // show timer for next game day in...
  let { date } = await server.nextGameDate()
  if (interval) clearInterval(interval)
  interval = setInterval(() => {
    const diff = new Date(Date.parse(date)).getTime() - Date.now()
    if (diff < 0) server.nextGameDate().then(r => (date = r.date))
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const twoDigits = (v) => v < 10 ? '0' + v : v
    if (!el('#' + nextGameInElementId)) {
      clearInterval(interval)
      return
    }
    el('#' + nextGameInElementId).innerHTML = `<i class="fa fa-clock-o" aria-hidden="true"></i> ${hours}h ${twoDigits(minutes % 60)}min ${twoDigits(seconds % 60)}sec`
  }, 1000)

  onClick('#logout-button', () => {
    hideNavigation()
    window.localStorage.removeItem('auth-token')
    goTo('')
  })

  onClick('.navbar-toggler', () => {
    mobileNavigationOpen = !mobileNavigationOpen
    el('.navbar-collapse').classList[mobileNavigationOpen ? 'add' : 'remove']('show')
  })

  return `
    <nav class="navbar navbar-expand-lg navbar-light bg-light">
      <a class="navbar-brand" href="#">Soccer-Manager.io</a>
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
        <ul class="navbar-nav mr-auto">
          ${_navItem('my-team', '<i class="fa fa-users" aria-hidden="true"></i> Team')}
          ${_navItem('results', '<i class="fa fa-trophy" aria-hidden="true"></i> League')}
          ${_navItem('finances', '<i class="fa fa-money" aria-hidden="true"></i> Finances')}
          ${_navItem('stadium', '<i class="fa fa-futbol-o" aria-hidden="true"></i> Stadium')}
          ${_navItem('trades', '<i class="fa fa-handshake-o" aria-hidden="true"></i> Trades')}
        </ul>
        <div class="pr-4" id="${nextGameInElementId}">
        </div>
        <div class="pr-4">
            <i class="fa fa-money" aria-hidden="true"></i> ${balance}
        </div>
        <button id="logout-button" class="btn btn-outline-info my-2 my-sm-0" type="submit">Logout</button>
      </div>        
    </nav>
    <div class="container" id="page"></div>
  `
}

function _navItem (path, text) {
  const id = generateId()
  on('page-changed', () => {
    const isCurrentPage = window.location.hash.substring(1).split('?')[0] === path
    el('#' + id)?.classList[isCurrentPage ? 'add' : 'remove']('active')
  })
  return `
    <li id="${id}" class="nav-item">
      <a class="nav-link" href="#${path}">
        ${text}
      </a>
    </li>
  `
}
