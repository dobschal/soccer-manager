import { renderDefaultLayout } from './layouts/defaultLayout.js'
import { renderGameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { renderDashboardPage } from './pages/dashboard.js'
import { renderFinancesPage } from './pages/finances.js'
import { LoginPage } from './pages/login.js'
import { MyTeamPage } from './pages/my-team.js'
import { renderResultsPage } from './pages/results.js'
import { renderStadiumPage } from './pages/stadium.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'

const pages = {
  trades: [renderGameLayout, TradesPage],
  stadium: [renderGameLayout, renderStadiumPage],
  finances: [renderGameLayout, renderFinancesPage],
  team: [renderGameLayout, TeamPage],
  results: [renderGameLayout, renderResultsPage],
  login: [renderDefaultLayout, LoginPage],
  'my-team': [renderGameLayout, MyTeamPage],
  '*': [renderGameLayout, renderDashboardPage]
}

initRouter(pages)
