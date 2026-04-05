import { installGlobalErrorHandler, sendLog } from './lib/clientLogger.js'
import { DefaultLayout } from './layouts/defaultLayout.js'
import { NativeAppLayout } from './layouts/nativeAppLayout.js'
import { goTo, initRouter, refreshCurrentPage } from './lib/router.js'
import { server } from './lib/gateway.js'
import { DashboardPage } from './pages/dashboard.js'
import { NativeLandingPage } from './pages/native-landing.js'
import { MyTeamPage } from './pages/my-team.js'
import { ClubPage } from './pages/club.js'
import { TeamPage } from './pages/team.js'
import { TradesPage } from './pages/trades.js'
import { ResultsPage } from './pages/results.js'
import { BrowsePage } from './pages/browse.js'
import { initLocale, t } from './i18n/index.js'
import { connectWebSocket } from './lib/websocket.js'
import { toast } from './partials/toast.js'

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

// Track the last known game day so we can detect new ones on resume
let _lastKnownGameDay = null
let _lastKnownSeason = null

// Shared resume handler – debounced so that native bridge + visibilitychange
// firing in quick succession only trigger one refresh.
let _lastResumeTs = 0
async function _onResume () {
  const now = Date.now()
  if (now - _lastResumeTs < 1000) return
  _lastResumeTs = now
  if (window.localStorage.getItem('auth-token')) {
    server.clearBadge().catch(() => {})
    try {
      const currentGameday = await server.getCurrentGameday()
      if (_lastKnownGameDay !== null &&
        (currentGameday.gameDay !== _lastKnownGameDay || currentGameday.season !== _lastKnownSeason)) {
        _lastKnownGameDay = currentGameday.gameDay
        _lastKnownSeason = currentGameday.season
        goTo('dashboard')
        return
      }
      _lastKnownGameDay = currentGameday.gameDay
      _lastKnownSeason = currentGameday.season
    } catch {
      // Fall through to refresh
    }
    refreshCurrentPage()
  }
}

// Called from native side when app returns from background
window.__onAppResume = _onResume

// Fallback: also handle visibilitychange for cases where native bridge doesn't fire
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _onResume()
})

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
  server.clearBadge().catch(() => {})
  // Capture initial game day so we can detect changes on resume
  server.getCurrentGameday()
    .then(gd => { _lastKnownGameDay = gd.gameDay; _lastKnownSeason = gd.season })
    .catch(() => {})
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
  '*': [NativeAppLayout, DashboardPage]
}

initRouter(pages)
