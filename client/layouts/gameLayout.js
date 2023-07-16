import { goTo } from '../app.js'
import { onClick } from '../lib/eventHandlers.js'
import { html } from '../lib/html.js'

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
          ${_navItem('games', 'Games')}
          ${_navItem('', 'Teams')}
          ${_navItem('players', 'My Player')}          
        </ul>
        <button id="logout-button" class="btn btn-outline-info my-2 my-sm-0" type="submit">Logout</button>
      </div>        
    </nav>
    <div class="container" id="page"></div>
  `
}

function _navItem (path, text) {
  if (window.location.hash.substring(1) === path) {
    return `
      <li class="nav-item active">
        <a class="nav-link" href="#${path}">
          ${text}
          <span class="sr-only">(current)</span>
        </a>
      </li>
    `
  }
  return `
    <li class="nav-item">
      <a class="nav-link" href="#${path}">
        ${text}
      </a>
    </li>
  `
}
