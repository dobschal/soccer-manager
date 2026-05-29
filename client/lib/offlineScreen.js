import { t } from '../i18n/index.js'
import { server } from './gateway.js'

/**
 * Light health check against the API. Used to gate the native app boot
 * so we can show an offline screen instead of crashing silently when the
 * first layout's load() fails on every parallel server call.
 *
 * @returns {Promise<boolean>}
 */
export async function isApiReachable () {
  try {
    await server.getVersion()
    return true
  } catch {
    return false
  }
}

/**
 * Render the offline screen into <body>. The retry button calls back into
 * the connectivity check and reloads the app on success — on failure it
 * just re-enables itself so the user can try again.
 *
 * @returns {void}
 */
export function showOfflineScreen () {
  const retryId = 'offline-retry-btn'
  const labelId = 'offline-retry-label'
  document.body.innerHTML = `
    <div class="offline-screen">
      <img src="assets/logo.svg" alt="FootballManager.IO" class="offline-screen-logo">
      <h1 class="offline-screen-title">${t('offline.title')}</h1>
      <p class="offline-screen-text">${t('offline.text')}</p>
      <button id="${retryId}" type="button" class="btn btn-primary offline-screen-retry">
        <span id="${labelId}">${t('offline.retry')}</span>
      </button>
    </div>
  `

  const btn = document.getElementById(retryId)
  const label = document.getElementById(labelId)
  btn.addEventListener('click', async () => {
    if (btn.disabled) return
    btn.disabled = true
    label.textContent = t('offline.retrying')
    if (await isApiReachable()) {
      window.location.reload()
      return
    }
    btn.disabled = false
    label.textContent = t('offline.retry')
  })
}
