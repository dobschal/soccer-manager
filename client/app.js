import { DefaultLayout } from './layouts/defaultLayout.js'
import { GameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { DashboardPage } from './pages/dashboard.js'
import { FinancesPage } from './pages/finances.js'
import { LoginPage } from './pages/login.js'
import { MyTeamPage } from './pages/my-team.js'
import { StadiumPage } from './pages/stadium.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'
import { ResultsPage } from './pages/results.js'

const pages = {
  trades: [GameLayout, TradesPage],
  stadium: [GameLayout, StadiumPage],
  finances: [GameLayout, FinancesPage],
  team: [GameLayout, TeamPage],
  results: [GameLayout, ResultsPage],
  login: [DefaultLayout, LoginPage],
  'my-team': [GameLayout, MyTeamPage],
  '*': [GameLayout, DashboardPage]
}

initRouter(pages)
