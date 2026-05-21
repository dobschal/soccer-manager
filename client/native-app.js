import { installGlobalErrorHandler, sendLog } from './lib/clientLogger.js'
import { DefaultLayout } from './layouts/defaultLayout.js'
import { NativeAppLayout } from './layouts/nativeAppLayout.js'
import { initRouter, refreshCurrentPage } from './lib/router.js'
import { server } from './lib/gateway.js'
import { redirectIfPendingActionCards } from './lib/pendingCardsRedirect.js'
import { DashboardPage } from './pages/dashboard.js'
import { NativeLandingPage } from './pages/native-landing.js'
import { MyTeamPage } from './pages/my-team.js'
import { ClubPage } from './pages/club.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'
import { ResultsPage } from './pages/results.js'
import { BrowsePage } from './pages/browse.js'
import { AdminPage } from './pages/admin.js'
import { ForumPage } from './pages/forum.js'
import { initLocale, t } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'
import { toast } from './partials/toast.js'
import { initSwipeBackNavigation } from './lib/swipeBackNavigation.js'
import { initPullToRefresh } from './lib/pullToRefresh.js'
import { initTabBarAnimations } from './lib/tabBarAnimation.js'

installGlobalErrorHandler()

// OTA update toast - called from native side via evaluateJavascript
window.__showOtaToast = function () {
  toast(t('ota.updateInstalled'), 'success')
}

// Called from native side when a device token is available
window.__onNativeDeviceToken = async function (token, platform) {
  sendLog(`[Push] __onNativeDeviceToken called - platform: ${platform}, token: ${token ? token.substring(0, 10) + '...' : 'EMPTY'}, tokenLength: ${token?.length ?? 0}`)
  window.__nativeDeviceToken = token
  window.__nativePlatform = platform
  const authToken = window.localStorage.getItem('auth-token')
  sendLog(`[Push] authToken present: ${!!authToken}`)
  if (authToken) {
    try {
      sendLog(`[Push] Calling server.registerDeviceToken...`)
      await server.registerDeviceToken(token, platform)
      sendLog('[Push] Device token registered successfully')
    } catch (e) {
      sendLog(`[Push] Failed to register device token: ${e?.message || JSON.stringify(e)}`, 'error')
    }
  } else {
    sendLog('[Push] No auth token - skipping device token registration', 'warn')
  }
}

// Shared resume handler – debounced so that native bridge + visibilitychange
// firing in quick succession only trigger one refresh.
let _lastResumeTs = 0
async function _onResume () {
  const now = Date.now()
  if (now - _lastResumeTs < 1000) return
  _lastResumeTs = now
  if (!window.localStorage.getItem('auth-token')) return
  server.clearBadge().catch(() => {})
  const redirected = await redirectIfPendingActionCards()
  if (redirected) return
  refreshCurrentPage()
}

// Called from native side when app returns from background
window.__onAppResume = _onResume

// Fallback: also handle visibilitychange for cases where native bridge doesn't fire
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _onResume()
})

// On every navigation, also check for pending cards so the overlay shows even
// when the user crosses a game-day boundary while the app was already open.
let _lastNavCheckTs = 0
window.addEventListener('hashchange', () => {
  const currentPath = (window.location.hash || '').substring(1).split('?')[0]
  if (currentPath === 'dashboard' || currentPath === '') return
  const now = Date.now()
  if (now - _lastNavCheckTs < 10000) return
  _lastNavCheckTs = now
  void redirectIfPendingActionCards()
})

// Initialize locale from localStorage or browser settings
initLocale()

// Animate sub-page tab bars on every page open: peek-scroll to hint that more
// tabs exist. Was missing from the native entry point so the animation never
// ran inside iOS WKWebView / Android WebView even though it works in browser.
initTabBarAnimations()

// Enable native-feeling edge swipe-back: swiping right from the left edge of
// the screen calls history.back() so users can return through the navigation
// chain (e.g. league → match → team → swipe → match → swipe → league).
initSwipeBackNavigation()

// Native-feeling pull-to-refresh: when scrolled to the top, swiping further
// down reveals a bouncing-ball indicator; releasing past the arm threshold
// reloads the webapp and lands on the same page.
initPullToRefresh()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
  server.clearBadge().catch(() => {})
  // On cold start (e.g. iOS recycled the WebView while suspended), the page
  // may not be the dashboard. Detect unclaimed cards here so the user is
  // funneled to the claim overlay instead of getting stuck on the last page.
  // `reload: false` is critical — the page hasn't rendered yet, so reloading
  // would loop: the pending cards stay until dashboard's claim overlay runs,
  // and reloading before render means it never gets a chance to. Setting the
  // hash is enough; the router picks up #dashboard during initial resolve.
  void redirectIfPendingActionCards({ reload: false })
}

// If device token was already injected before JS loaded, register it now
sendLog(`[Push] Startup check - nativeDeviceToken: ${window.__nativeDeviceToken ? 'present(' + window.__nativeDeviceToken.substring(0, 10) + '...)' : 'MISSING'}, nativePlatform: ${window.__nativePlatform || 'MISSING'}, authToken: ${!!window.localStorage.getItem('auth-token')}`)
if (window.__nativeDeviceToken && window.__nativePlatform && window.localStorage.getItem('auth-token')) {
  sendLog('[Push] Startup fallback: calling registerDeviceToken...')
  server.registerDeviceToken(window.__nativeDeviceToken, window.__nativePlatform)
    .then(() => sendLog('[Push] Startup fallback: device token registered successfully'))
    .catch(e => sendLog(`[Push] Startup fallback FAILED: ${e?.message || JSON.stringify(e)}`, 'error'))
} else {
  sendLog('[Push] Startup fallback: conditions not met, skipping')
}

server.getVersion().then(({ version }) => {
  console.log(`FootballManager.IO running version ${version}`)
})

const pages = {
  trades: [NativeAppLayout, TradesPage],
  club: [NativeAppLayout, ClubPage],
  team: [NativeAppLayout, TeamPage],
  results: [NativeAppLayout, ResultsPage],
  login: [DefaultLayout, NativeLandingPage],
  'my-team': [NativeAppLayout, MyTeamPage],
  browse: [NativeAppLayout, BrowsePage],
  admin: [NativeAppLayout, AdminPage],
  forum: [NativeAppLayout, ForumPage],
  '*': [NativeAppLayout, DashboardPage]
}

initRouter(pages)
