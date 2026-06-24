import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'

/**
 * Show the "Report user" overlay. Collects a free-text reason and submits it
 * for admin review (#421).
 * @param {number} userId
 * @param {string} [username]
 * @returns {void}
 */
export function showReportUserOverlay (userId, username = '') {
  const textareaId = generateId()
  const submitBtnId = generateId()

  const content = `
    <div class="report-user-overlay">
      <p class="text-muted">${t('report.description', { username })}</p>
      <textarea id="${textareaId}" class="form-control border-info" rows="5"
        placeholder="${t('report.placeholder')}"></textarea>
      <div class="text-end mt-3">
        <button type="button" id="${submitBtnId}" class="btn btn-danger">
          <i class="fa fa-flag" aria-hidden="true"></i> ${t('report.submit')}
        </button>
      </div>
    </div>
  `

  const overlay = showOverlay(t('report.title'), '', content)

  setTimeout(() => {
    const textarea = el('#' + textareaId)
    const submitBtn = el('#' + submitBtnId)
    if (!textarea || !submitBtn) return

    submitBtn.addEventListener('click', async () => {
      const reason = textarea.value.trim()
      if (reason.length < 3) {
        toast(t('report.reasonTooShort'), 'error')
        return
      }
      submitBtn.disabled = true
      try {
        await server.reportUser(userId, reason)
        toast(t('report.sent'), 'success')
        overlay.remove()
      } catch (err) {
        showServerError(err)
        submitBtn.disabled = false
      }
    })
    textarea.focus()
  }, 0)
}
