import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { isValidEmail } from '../lib/emailRegex.js'

let shownThisSession = false

/**
 * Show the "please add your email" dialog if the user hasn't entered one yet.
 * Skips when:
 *  - it has already been shown in this session
 *  - the user already has either a verified email or a pending email change
 * Calling site is responsible for passing the user object (typically the
 * `user` field from getMyTeam).
 * @param {{email?: string|null, pending_email?: string|null}|null|undefined} user
 * @returns {void}
 */
export function maybeShowEmailPrompt (user) {
  if (shownThisSession) return
  if (!user) return
  if (user.email || user.pending_email) return
  shownThisSession = true

  const inputId = generateId()
  const saveBtnId = generateId()
  const laterBtnId = generateId()
  const content = `
    <p>${t('emailPrompt.intro')}</p>
    <div class="form-group mb-2">
      <label for="${inputId}" class="form-label">${t('account.email')}</label>
      <input id="${inputId}" type="email" class="form-control" autocomplete="email" placeholder="${t('account.emailPlaceholder')}">
    </div>
    <small class="form-text text-muted d-block mb-3">${t('emailPrompt.hint')}</small>
    <div class="d-flex gap-2">
      <button id="${laterBtnId}" type="button" class="btn btn-outline-secondary flex-fill">${t('emailPrompt.later')}</button>
      <button id="${saveBtnId}" type="button" class="btn btn-primary flex-fill">${t('emailPrompt.save')}</button>
    </div>
  `

  const overlay = showOverlay(t('emailPrompt.title'), '', content)

  setTimeout(() => {
    const input = el('#' + inputId)
    const saveBtn = el('#' + saveBtnId)
    const laterBtn = el('#' + laterBtnId)

    input?.focus()

    if (laterBtn) {
      laterBtn.addEventListener('click', () => overlay.remove())
    }

    if (saveBtn && input) {
      const submit = async () => {
        const email = input.value.trim()
        if (!isValidEmail(email)) {
          toast(t('landing.emailInvalid'), 'error')
          return
        }
        saveBtn.disabled = true
        try {
          await server.setEmail(email)
          toast(t('emailPrompt.saved'), 'success')
          overlay.remove()
        } catch (err) {
          showServerError(err)
          saveBtn.disabled = false
        }
      }
      saveBtn.addEventListener('click', submit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit()
      })
    }
  }, 0)
}

/**
 * Reset the "already shown" flag — used by tests.
 * @returns {void}
 */
export function _resetEmailPromptForTests () {
  shownThisSession = false
}
