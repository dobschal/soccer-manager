import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { isValidEmail } from '../lib/emailRegex.js'

/**
 * Show the "Invite a friend" overlay. Collects the friend's email and asks
 * the server to send an invitation. On successful registration with that
 * email the inviting user will receive the configured action card bonus.
 * @returns {void}
 */
export function showInviteFriendOverlay () {
  const inputId = generateId()
  const submitBtnId = generateId()

  const content = `
    <div class="invite-friend-overlay">
      <p class="text-muted">${t('referral.overlayDescription')}</p>
      <label class="form-label mt-2" for="${inputId}">${t('account.email')}</label>
      <div class="input-group">
        <input type="email" id="${inputId}" class="form-control border-info" autocomplete="email" placeholder="${t('referral.emailPlaceholder')}">
        <button type="button" id="${submitBtnId}" class="btn btn-info">
          <i class="fa fa-paper-plane" aria-hidden="true"></i> ${t('referral.send')}
        </button>
      </div>
    </div>
  `

  const overlay = showOverlay(t('referral.overlayTitle'), '', content)

  setTimeout(() => {
    const input = el('#' + inputId)
    const submitBtn = el('#' + submitBtnId)
    if (!input || !submitBtn) return

    const submit = async () => {
      const email = input.value.trim()
      if (!isValidEmail(email)) {
        toast(t('landing.emailInvalid'), 'error')
        return
      }
      submitBtn.disabled = true
      try {
        const result = await server.inviteFriendByEmail(email)
        const message = result?.sent
          ? t('referral.sent', { email })
          : t('referral.queued')
        toast(message, 'success')
        overlay.remove()
      } catch (err) {
        showServerError(err)
        submitBtn.disabled = false
      }
    }

    submitBtn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    })
    input.focus()
  }, 0)
}
