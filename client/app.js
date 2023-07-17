import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { render } from './lib/render.js'
import { renderLoginPage } from './pages/login.js'
import { renderMyTeamPage } from './pages/my-team.js'
import { renderResultsPage } from './pages/results.js'

window.addEventListener('hashchange', resolvePage)

const pages = {
  results: [renderGameLayout, renderResultsPage],
  login: [renderDefaultLayout, renderLoginPage],
  '*': [renderGameLayout, renderMyTeamPage]
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
