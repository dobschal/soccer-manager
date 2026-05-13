import { el } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { t } from '../i18n/index.js'
import { showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'
import { showAccountOverlay } from './accountOverlay.js'
import { fetchText } from '../lib/fetchText.js'

/**
 * Shows the settings overlay with menu items
 * @param {object} options
 * @param {boolean} options.isAdmin
 * @param {string} options.version
 * @returns {void}
 */
export function showSettingsOverlay ({ isAdmin, version }) {
  const content = `
    <div class="settings-overlay-content">
      <div class="list-group">
        <button id="settings-account" class="list-group-item list-group-item-action">
          <i class="fa fa-user" aria-hidden="true"></i> ${t('nav.account')}
        </button>
        ${isAdmin ? `<a href="#admin" id="settings-admin-link" class="list-group-item list-group-item-action list-group-item-warning">
          <i class="fa fa-shield" aria-hidden="true"></i> Admin
        </a>` : ''}
        <a href="#forum" id="settings-forum-link" class="list-group-item list-group-item-action">
          <i class="fa fa-comments" aria-hidden="true"></i> ${t('forum.title')}
        </a>
        <button id="settings-search" class="list-group-item list-group-item-action">
          <i class="fa fa-search" aria-hidden="true"></i> ${t('nav.search')}
        </button>
        <a href="imprint.html" class="list-group-item list-group-item-action">
          <i class="fa fa-file-text-o" aria-hidden="true"></i> ${t('nav.privacyPolicy')}
        </a>
        <a href="support.html" class="list-group-item list-group-item-action">
          <i class="fa fa-life-ring" aria-hidden="true"></i> ${t('nav.support')}
        </a>
        <button id="settings-logout" class="list-group-item list-group-item-action list-group-item-danger">
          <i class="fa fa-sign-out" aria-hidden="true"></i> ${t('nav.logout')}
        </button>
      </div>
      <div class="text-muted small text-center mt-3">
        FootballManager.IO v${version}
      </div>
      ${window.__NATIVE_SERVER_URL ? `
      <div class="text-muted small text-center" id="settings-client-version">${t('common.loading')}</div>
      ` : ''}
    </div>
  `

  const overlay = showOverlay(t('nav.settings'), '', content)

  setTimeout(() => {
    const accountBtn = el('#settings-account')
    if (accountBtn) {
      accountBtn.addEventListener('click', () => {
        overlay.remove()
        showAccountOverlay()
      })
    }

    const searchBtn = el('#settings-search')
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        overlay.remove()
        goTo('browse')
      })
    }

    const forumLink = el('#settings-forum-link')
    if (forumLink) {
      forumLink.addEventListener('click', () => {
        overlay.remove()
      })
    }

    const adminLink = el('#settings-admin-link')
    if (adminLink) {
      adminLink.addEventListener('click', () => {
        overlay.remove()
      })
    }

    const logoutBtn = el('#settings-logout')
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        overlay.remove()
        disconnectWebSocket()
        window.localStorage.removeItem('auth-token')
        goTo('login')
      })
    }

    // Load client version info for native app
    if (window.__NATIVE_SERVER_URL) {
      const clientVersionEl = el('#settings-client-version')
      if (clientVersionEl) {
        fetchText('./native-version.json')
          .then(text => JSON.parse(text))
          .then(data => {
            clientVersionEl.textContent = `Client: v${data.version} (${data.commitHash})`
          })
          .catch(() => {
            clientVersionEl.textContent = 'Client: unknown'
          })
      }
    }
  }, 0)
}
