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
import { AdminPage } from './pages/admin.js'
import { ChooseTeamPage } from './pages/choose-team.js'
import { initLocale } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'
import { applyNoIndexOnSandbox, showSandboxBanner } from './partials/sandboxBanner.js'
import { on } from './lib/event.js'
import { initTabBarAnimations } from './lib/tabBarAnimation.js'
import { initPullToRefresh } from './lib/pullToRefresh.js'

installGlobalErrorHandler()

// Initialize locale from localStorage or browser settings
initLocale()

// On the sandbox/test host: hide the site from search engines and show a
// persistent banner that links back to the production game. The router wipes
// document.body on every layout switch, so re-insert the banner after each
// page render (showSandboxBanner is idempotent).
applyNoIndexOnSandbox()
showSandboxBanner()
on('page-changed', showSandboxBanner)

// Animate sub-page tab bars on every page open: slide in from the left, then
// peek-scroll right if there is hidden overflow, to hint that more tabs exist.
initTabBarAnimations()

// Edge swipe-back is intentionally only wired up in native-app.js: mobile
// browsers (iOS Safari, Chrome Android) already ship their own native swipe-
// back gesture and the two gestures would visually fight each other.

// Native-feeling pull-to-refresh: when scrolled to the top, swiping further
// down reveals a bouncing-ball indicator; releasing past the arm threshold
// reloads the webapp and lands on the same page.
initPullToRefresh()

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
  admin: [GameLayout, AdminPage],
  'choose-team': [DefaultLayout, ChooseTeamPage],
  '*': [GameLayout, DashboardPage]
}

initRouter(pages)
