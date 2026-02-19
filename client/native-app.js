import { DefaultLayout } from './layouts/defaultLayout.js'
import { NativeAppLayout } from './layouts/nativeAppLayout.js'
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
import { SimulatorPage } from './pages/simulator.js'
import { initLocale } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
}

server.getVersion().then(({ version }) => {
  console.log(`SoccerManagerIO running version ${version}`)
})

const pages = {
  trades: [NativeAppLayout, TradesPage],
  stadium: [NativeAppLayout, StadiumPage],
  finances: [NativeAppLayout, FinancesPage],
  team: [NativeAppLayout, TeamPage],
  results: [NativeAppLayout, ResultsPage],
  login: [DefaultLayout, LandingPage],
  'my-team': [NativeAppLayout, MyTeamPage],
  simulator: [NativeAppLayout, SimulatorPage],
  '*': [NativeAppLayout, DashboardPage]
}

initRouter(pages)
