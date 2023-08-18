import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { renderDashboardPage } from './pages/dashboard.js'
import { renderFinancesPage } from './pages/finances.js'
import { renderLoginPage } from './pages/login.js'
import { renderMyTeamPage } from './pages/my-team.js'
import { renderResultsPage } from './pages/results.js'
import { renderStadiumPage } from './pages/stadium.js'
import { TeamPage } from './pages/team.js'
import { renderTradesPage } from './pages/trades.js'

const pages = {
  trades: [renderGameLayout, renderTradesPage],
  stadium: [renderGameLayout, renderStadiumPage],
  finances: [renderGameLayout, renderFinancesPage],
  team: [renderGameLayout, TeamPage],
  results: [renderGameLayout, renderResultsPage],
  login: [renderDefaultLayout, renderLoginPage],
  'my-team': [renderGameLayout, renderMyTeamPage],
  '*': [renderGameLayout, renderDashboardPage]
}

initRouter(pages)
