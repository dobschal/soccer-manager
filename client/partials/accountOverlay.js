import { el } from '../lib/html.js'
import { goTo } from '../lib/router.js'
import { server } from '../lib/gateway.js'
import { toast } from '../partials/toast.js'
import { getLocale, setLocale, t } from '../i18n/index.js'
import { showConfirmDialog, showOverlay } from '../partials/overlay.js'
import { disconnectWebSocket } from '../lib/websocket.js'

/**
 * Shows the account settings overlay with language and delete account options
 * @returns {void}
 */
export function showAccountOverlay () {
  const currentLocale = getLocale()

  const content = `
    <div class="settings-overlay-content">
      <div class="mb-3">
        <label class="form-label mt-2">${t('nav.language')}</label>
        <div class="btn-group w-100" role="group">
          <button id="account-lang-en" class="btn ${currentLocale === 'en' ? 'btn-primary' : 'btn-outline-info'}">English</button>
          <button id="account-lang-de" class="btn ${currentLocale === 'de' ? 'btn-primary' : 'btn-outline-info'}">Deutsch</button>
        </div>
      </div>
      <hr>
      <button id="account-delete" class="btn btn-outline-danger w-100">
        <i class="fa fa-trash" aria-hidden="true"></i> ${t('nav.deleteAccount')}
      </button>
    </div>
  `

  const overlay = showOverlay(t('nav.account'), '', content)

  setTimeout(() => {
    const langEnBtn = el('#account-lang-en')
    const langDeBtn = el('#account-lang-de')

    if (langEnBtn) {
      langEnBtn.addEventListener('click', async () => {
        if (currentLocale !== 'en') {
          setLocale('en')
          try {
            await server.setLanguage('en')
          } catch (err) {
            console.error('Failed to save language preference:', err)
          }
          window.location.reload()
        }
      })
    }

    if (langDeBtn) {
      langDeBtn.addEventListener('click', async () => {
        if (currentLocale !== 'de') {
          setLocale('de')
          try {
            await server.setLanguage('de')
          } catch (err) {
            console.error('Failed to save language preference:', err)
          }
          window.location.reload()
        }
      })
    }

    const deleteAccountBtn = el('#account-delete')
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog(t('nav.deleteAccountConfirm'), t('nav.deleteAccount'))
        if (!confirmed) return
        try {
          await server.deleteAccount()
          overlay.remove()
          disconnectWebSocket()
          window.localStorage.removeItem('auth-token')
          goTo('login')
        } catch (err) {
          toast(err.message ?? t('toast.somethingWentWrong'), 'error')
        }
      })
    }
  }, 0)
}
