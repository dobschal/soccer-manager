import { renderGamesPage } from './pages/games.js'
import { renderTeamsPage } from './pages/teams.js'

window.addEventListener('hashchange', resolvePage)

const pages = {
  games: renderGamesPage,
  '*': renderTeamsPage
}

async function resolvePage () {
  document.body.innerHTML = ''
  const pageRenderFn = pages[window.location.hash.substring(1)] ?? pages['*']
  document.body.insertAdjacentHTML('afterbegin', await pageRenderFn())
}

resolvePage()
