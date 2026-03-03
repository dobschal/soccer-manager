import { installGlobalErrorHandler } from './lib/clientLogger.js'
import { DefaultLayout } from './layouts/defaultLayout.js'
import { NativeAppLayout } from './layouts/nativeAppLayout.js'
import { initRouter } from './lib/router.js'
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
  window.__nativeDeviceToken = token
  window.__nativePlatform = platform
  const authToken = window.localStorage.getItem('auth-token')
  if (authToken) {
    try {
      await server.registerDeviceToken(token, platform)
      console.log('[Push] Device token registered')
    } catch (e) {
      console.error('[Push] Failed to register device token:', e)
    }
  }
}

// Initialize locale from localStorage or browser settings
initLocale()

// Connect WebSocket if user is authenticated
if (window.localStorage.getItem('auth-token')) {
  connectWebSocket()
}

// If device token was already injected before JS loaded, register it now
if (window.__nativeDeviceToken && window.__nativePlatform && window.localStorage.getItem('auth-token')) {
  server.registerDeviceToken(window.__nativeDeviceToken, window.__nativePlatform)
    .catch(e => console.error('[Push] Failed to register device token on startup:', e))
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
