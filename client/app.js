import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { renderDashboardPage } from './pages/dashboard.js'
import { renderFinancesPage } from './pages/finances.js'
import { renderLoginPage } from './pages/login.js'
import { renderMyTeamPage } from './pages/my-team.js'
import { renderResultsPage } from './pages/results.js'
import { renderTeamPage } from './pages/team.js'

const pages = {
  finances: [renderGameLayout, renderFinancesPage],
  team: [renderGameLayout, renderTeamPage],
  results: [renderGameLayout, renderResultsPage],
  login: [renderDefaultLayout, renderLoginPage],
  'my-team': [renderGameLayout, renderMyTeamPage],
  '*': [renderGameLayout, renderDashboardPage]
}

initRouter(pages)
