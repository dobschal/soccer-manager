import { installGlobalErrorHandler, sendLog } from './lib/clientLogger.js'
import { DefaultLayout } from './layouts/defaultLayout.js'
import { NativeAppLayout } from './layouts/nativeAppLayout.js'
import { initRouter, refreshCurrentPage } from './lib/router.js'
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

// Called from native side when app returns from background
window.__onAppResume = function () {
  if (window.localStorage.getItem('auth-token')) {
    server.clearBadge().catch(() => {})
    refreshCurrentPage()
  }
}

// Fallback: also handle visibilitychange for cases where native bridge doesn't fire
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.localStorage.getItem('auth-token')) {
    server.clearBadge().catch(() => {})
    refreshCurrentPage()
  }
})

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
  server.clearBadge().catch(() => {})
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
