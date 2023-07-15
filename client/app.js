import { renderPage } from './lib/renderPage.js'
import { renderGamesPage } from './pages/games.js'
import { renderTeamsPage } from './pages/teams.js'

window.addEventListener('hashchange', resolvePage)

const pages = {
  games: renderGamesPage,
  '*': renderTeamsPage
}

async function resolvePage () {
  const pageRenderFn = pages[window.location.hash.substring(1)] ?? pages['*']
  renderPage(await pageRenderFn())
}

resolvePage()
