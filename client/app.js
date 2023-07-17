import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { renderLoginPage } from './pages/login.js'
import { renderMyTeamPage } from './pages/my-team.js'
import { renderResultsPage } from './pages/results.js'
import { renderTeamPage } from './pages/team.js'

const pages = {
  team: [renderGameLayout, renderTeamPage],
  results: [renderGameLayout, renderResultsPage],
  login: [renderDefaultLayout, renderLoginPage],
  '*': [renderGameLayout, renderMyTeamPage]
}

initRouter(pages)
