import { html } from '../lib/html.js'

export function renderGameLayout () {
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
        <ul class="navbar-nav">
          ${_navItem('games', 'Games')}
          ${_navItem('', 'Teams')}
          ${_navItem('players', 'My Player')}          
        </ul>
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
