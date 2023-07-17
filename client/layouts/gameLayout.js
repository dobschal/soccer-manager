import { on } from '../lib/event.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { goTo } from '../lib/router.js'

export function renderGameLayout () {
  onClick('#logout-button', () => {
    window.localStorage.removeItem('auth-token')
    goTo('')
  })

  return `
    <nav class="navbar navbar-expand-lg navbar-light bg-light mb-4">
      <a class="navbar-brand" href="#">Soccer</a>
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
          ${_navItem('', 'My Team')}
          ${_navItem('results', 'Results')}
        </ul>
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
