import { DefaultLayout } from './layouts/defaultLayout.js'
import { GameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { server } from './lib/gateway.js'
import { DashboardPage } from './pages/dashboard.js'
import { FinancesPage } from './pages/finances.js'
import { LandingPage } from './pages/landing.js'
import { MyTeamPage } from './pages/my-team.js'
import { StadiumPage } from './pages/stadium.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'
import { ResultsPage } from './pages/results.js'
import { initLocale } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
}

server.getVersion().then(({ version }) => {
  console.log(`🚀 SoccerManagerIO running version ${version}`)
})

const pages = {
  trades: [GameLayout, TradesPage],
  stadium: [GameLayout, StadiumPage],
  finances: [GameLayout, FinancesPage],
  team: [GameLayout, TeamPage],
  results: [GameLayout, ResultsPage],
  login: [DefaultLayout, LandingPage],
  'my-team': [GameLayout, MyTeamPage],
  '*': [GameLayout, DashboardPage]
}

initRouter(pages)
