import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { isValidEmail } from '../lib/emailRegex.js'

/**
 * Share the invite link via the native share sheet when available, otherwise
 * copy it to the clipboard. Falls back to a hidden textarea + execCommand for
 * older WebViews where the async clipboard API is unavailable.
 * @param {string} link
 * @returns {Promise<'shared'|'copied'>}
 */
async function shareOrCopyLink (link) {
  if (navigator.share) {
    await navigator.share({ url: link, text: t('referral.shareText') })
    return 'shared'
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(link)
    return 'copied'
  }
  const textarea = document.createElement('textarea')
  textarea.value = link
  textarea.setAttribute('readonly', '')
  textarea.className = 'u-offscreen'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  return 'copied'
}

/**
 * Show the "Invite a friend" overlay. Offers two ways to invite: by email (we
 * send an invitation on the user's behalf) and via a personal link that can be
 * copied/shared. New users that register from the same device/IP after opening
 * the link are attributed to the inviter.
 * @returns {void}
 */
export function showInviteFriendOverlay () {
  const inputId = generateId()
  const submitBtnId = generateId()
  const linkInputId = generateId()
  const copyBtnId = generateId()

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
      <hr class="my-3">
      <label class="form-label" for="${linkInputId}">${t('referral.linkLabel')}</label>
      <p class="text-muted small">${t('referral.linkDescription')}</p>
      <div class="input-group">
        <input type="text" id="${linkInputId}" class="form-control border-info" readonly value="${t('referral.linkLoading')}">
        <button type="button" id="${copyBtnId}" class="btn btn-info" disabled>
          <i class="fa fa-copy" aria-hidden="true"></i> ${t('referral.copyLink')}
        </button>
      </div>
    </div>
  `

  const overlay = showOverlay(t('referral.overlayTitle'), '', content)

  setTimeout(() => {
    const input = el('#' + inputId)
    const submitBtn = el('#' + submitBtnId)
    const linkInput = el('#' + linkInputId)
    const copyBtn = el('#' + copyBtnId)
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

    // Load the personal invite link and wire up the copy/share button.
    if (linkInput && copyBtn) {
      let inviteLink = null
      server.getInviteLink()
        .then(({ url }) => {
          inviteLink = url
          linkInput.value = url
          copyBtn.disabled = false
        })
        .catch(() => {
          linkInput.value = t('referral.linkError')
        })

      copyBtn.addEventListener('click', async () => {
        if (!inviteLink) return
        try {
          const how = await shareOrCopyLink(inviteLink)
          if (how === 'copied') {
            toast(t('referral.linkCopied'), 'success')
            linkInput.select()
          }
        } catch {
          // User dismissed the share sheet, or share/clipboard was denied —
          // not an error worth surfacing.
        }
      })
    }
  }, 0)
}
