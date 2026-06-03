import { toast } from './toast.js'
import { t } from '../i18n/index.js'

let shownThisSession = false

/**
 * Show a one-shot warning toast on app start when the user signed up with an
 * email address but has not clicked the verification link yet (no verified
 * `email`, only a `pending_email`). Skipped for users with no email at all —
 * those get the [[maybeShowEmailPrompt]] dialog instead.
 * @param {{email?: string|null, pending_email?: string|null}|null|undefined} user
 * @returns {void}
 */
export function maybeShowUnverifiedEmailToast (user) {
  if (shownThisSession) return
  if (!user) return
  if (user.email) return
  if (!user.pending_email) return
  shownThisSession = true
  toast(t('account.emailNotVerifiedToast', { email: user.pending_email }), 'error')
}

/**
 * Reset the "already shown" flag — used by tests.
 * @returns {void}
 */
export function _resetUnverifiedEmailToastForTests () {
  shownThisSession = false
}
