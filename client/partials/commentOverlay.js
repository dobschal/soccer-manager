import { showOverlay } from './overlay.js'
import { server } from '../lib/gateway.js'
import { t } from '../i18n/index.js'
import { formatDate } from '../lib/date.js'
import { generateId } from '../lib/html.js'
import { on, onClick } from '../lib/htmlEventHandlers.js'

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Render a single comment as HTML
 * @param {object} comment
 * @returns {string}
 */
function renderComment (comment) {
  const date = formatDate('WORDY hh:mm', comment.created_at)
  return `
    <div class="mb-3 pb-2 border-bottom">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <strong>${escapeHtml(comment.author_name)}</strong>
        <small class="text-muted">${date}</small>
      </div>
      <div>${escapeHtml(comment.text)}</div>
    </div>
  `
}

/**
 * Show comment overlay for a news item
 * @param {number} newsId
 * @param {string} newsTitle
 * @param {() => void} onCommentAdded
 */
export function showCommentOverlay (newsId, newsTitle, onCommentAdded) {
  const listId = generateId()
  const inputId = generateId()
  const sendBtnId = generateId()

  const content = `
    <div id="${listId}" style="max-height: 300px; overflow-y: auto;" class="mb-3">
      <p class="text-muted">${t('common.loading')}</p>
    </div>
    <div class="input-group">
      <input id="${inputId}" type="text" class="form-control" placeholder="${t('news.commentPlaceholder')}" maxlength="500">
      <button id="${sendBtnId}" class="btn btn-primary" type="button">
        <i class="fa fa-paper-plane" aria-hidden="true"></i>
      </button>
    </div>
  `

  const overlay = showOverlay(t('news.comments'), newsTitle, content)

  // Load comments
  server.getNewsComments(newsId).then(({ comments }) => {
    const listEl = document.getElementById(listId)
    if (!listEl) return
    if (comments.length === 0) {
      listEl.innerHTML = `<p class="text-muted">${t('news.noComments')}</p>`
    } else {
      listEl.innerHTML = comments.map(renderComment).join('')
      listEl.scrollTop = listEl.scrollHeight
    }
  })

  async function submitComment () {
    const inputEl = document.getElementById(inputId)
    if (!inputEl) return
    const text = inputEl.value.trim()
    if (!text) return

    inputEl.disabled = true
    try {
      const { comment } = await server.addNewsComment(newsId, text)
      inputEl.value = ''
      inputEl.disabled = false

      const listEl = document.getElementById(listId)
      if (listEl) {
        // Remove "no comments" message if present
        const noCommentsMsg = listEl.querySelector('p.text-muted')
        if (noCommentsMsg) noCommentsMsg.remove()
        listEl.insertAdjacentHTML('beforeend', renderComment(comment))
        listEl.scrollTop = listEl.scrollHeight
      }

      if (onCommentAdded) onCommentAdded()
    } catch {
      inputEl.disabled = false
    }
  }

  onClick(sendBtnId, submitComment)
  on('keydown', '#' + inputId, (e) => {
    if (e.key === 'Enter') submitComment()
  })

  return overlay
}
