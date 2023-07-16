import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { render } from './lib/render.js'
import { renderGamesPage } from './pages/games.js'
import { renderLoginPage } from './pages/login.js'
import { renderTeamsPage } from './pages/teams.js'

window.addEventListener('hashchange', resolvePage)

const pages = {
  games: [renderGameLayout, renderGamesPage],
  login: [renderDefaultLayout, renderLoginPage],
  '*': [renderGameLayout, renderTeamsPage]
}

async function resolvePage () {
  const currentPath = window.location.hash.substring(1)
  if (!isAuthenticated() && currentPath !== 'login') {
    return goTo('login')
  }
  const [layoutRenderFn, pageRenderFn] = pages[currentPath] ?? pages['*']
  render('body', await layoutRenderFn())
  render('#page', await pageRenderFn())
}

/**
 * Open a page under a specific path.
 *
 * @param {string} path
 */
export function goTo (path) {
  window.location.hash = path
  resolvePage()
}

/**
 *  We use JWT authentication, and store the token in the localStorage
 *
 * @returns {boolean}
 */
function isAuthenticated () {
  return Boolean(window.localStorage.getItem('auth-token'))
}

resolvePage()
