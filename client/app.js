import { installGlobalErrorHandler } from './lib/clientLogger.js'
import { DefaultLayout } from './layouts/defaultLayout.js'
import { GameLayout } from './layouts/gameLayout.js'
import { initRouter } from './lib/router.js'
import { server } from './lib/gateway.js'
import { DashboardPage } from './pages/dashboard.js'
import { LandingPage } from './pages/landing.js'
import { MyTeamPage } from './pages/my-team.js'
import { ClubPage } from './pages/club.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'
import { ResultsPage } from './pages/results.js'
import { BrowsePage } from './pages/browse.js'
import { AdminPage } from './pages/admin.js'
import { ForumPage } from './pages/forum.js'
import { initLocale } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'

installGlobalErrorHandler()

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
}

server.getVersion().then(({ version }) => {
  console.log(`🚀 FootballManager.IO running version ${version}`)
})

const pages = {
  trades: [GameLayout, TradesPage],
  club: [GameLayout, ClubPage],
  team: [GameLayout, TeamPage],
  results: [GameLayout, ResultsPage],
  login: [DefaultLayout, LandingPage],
  'my-team': [GameLayout, MyTeamPage],
  browse: [GameLayout, BrowsePage],
  admin: [GameLayout, AdminPage],
  forum: [GameLayout, ForumPage],
  '*': [GameLayout, DashboardPage]
}

initRouter(pages)
