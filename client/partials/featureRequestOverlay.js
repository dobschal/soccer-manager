import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { goTo } from '../lib/router.js'

const FEATURE_REQUEST_CATEGORY_ID = 3

export function showFeatureRequestOverlay () {
  const titleInputId = generateId()
  const textInputId = generateId()
  const submitBtnId = generateId()

  const content = `
    <div class="feature-request-overlay">
      <p class="text-muted">${t('dashboard.featureRequestDescription')}</p>
      <label class="form-label mt-2" for="${titleInputId}">${t('dashboard.featureRequestTitleLabel')}</label>
      <input type="text" id="${titleInputId}" class="form-control border-info" maxlength="255" placeholder="${t('dashboard.featureRequestTitlePlaceholder')}">
      <label class="form-label mt-2" for="${textInputId}">${t('dashboard.featureRequestTextLabel')}</label>
      <textarea id="${textInputId}" class="form-control border-info" rows="4" maxlength="5000" placeholder="${t('dashboard.featureRequestTextPlaceholder')}"></textarea>
      <button type="button" id="${submitBtnId}" class="btn btn-info w-100 mt-3">
        <i class="fa fa-paper-plane" aria-hidden="true"></i> ${t('dashboard.featureRequestSubmit')}
      </button>
    </div>
  `

  const overlay = showOverlay(t('dashboard.featureRequestOverlayTitle'), '', content)

  setTimeout(() => {
    const titleInput = el('#' + titleInputId)
    const textInput = el('#' + textInputId)
    const submitBtn = el('#' + submitBtnId)
    if (!titleInput || !textInput || !submitBtn) return

    const submit = async () => {
      const title = titleInput.value.trim()
      const text = textInput.value.trim()
      if (!title || !text) {
        toast(t('dashboard.featureRequestMissingFields'), 'error')
        return
      }
      submitBtn.disabled = true
      try {
        const { postId } = await server.createForumPost(FEATURE_REQUEST_CATEGORY_ID, title, text, null)
        toast(t('dashboard.featureRequestCreated'), 'success')
        overlay.remove()
        if (postId) {
          goTo(`dashboard?sub_page=forum&category=${FEATURE_REQUEST_CATEGORY_ID}&post=${postId}`)
        }
      } catch (err) {
        showServerError(err)
        submitBtn.disabled = false
      }
    }

    submitBtn.addEventListener('click', submit)
    titleInput.focus()
  }, 0)
}
