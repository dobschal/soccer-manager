import { el, generateId } from '../lib/html.js'
import { server, showServerError } from '../lib/gateway.js'
import { showOverlay } from './overlay.js'
import { t } from '../i18n/index.js'
import { formatDate } from '../lib/date.js'
import { linkifyHtml } from '../lib/linkify.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text == null ? '' : String(text)
  return div.innerHTML
}

function renderCommentBody (text) {
  return linkifyHtml(text == null ? '' : String(text), (escaped) => escaped.replace(/\n/g, '<br>'))
}

function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

function renderComment (comment) {
  const date = formatDate('DD.MM.YYYY hh:mm', comment.createdAt)
  const teamLink = comment.teamId
    ? `<a href="#team?id=${comment.teamId}" class="friend-post-comment-team">${escapeHtml(comment.teamName || '')}</a>`
    : ''
  return `
    <div class="friend-post-comment">
      <img class="friend-post-comment-avatar${comment.avatar ? '' : ' friend-post-comment-avatar--default'}"
           src="${avatarSrc(comment.avatar)}" alt="${escapeHtml(comment.username)}">
      <div class="friend-post-comment-body">
        <div class="friend-post-comment-meta">
          <strong>${escapeHtml(comment.username)}</strong>
          ${teamLink ? '- ' + teamLink : ''}
          <small class="text-muted ms-2">${date}</small>
        </div>
        <div class="friend-post-comment-text">${renderCommentBody(comment.text)}</div>
      </div>
    </div>
  `
}

/**
 * Show comments for a friend post in a modal overlay. Lets the viewer write
 * a new comment which is appended to the list on success.
 * @param {number} postId
 * @param {() => void} [onCommentAdded] - called after each successful comment
 */
export function showFriendPostCommentsOverlay (postId, onCommentAdded) {
  const listId = generateId()
  const inputId = generateId()
  const sendBtnId = generateId()

  const content = `
    <div class="friend-post-comments-overlay">
      <div id="${listId}" class="friend-post-comments-list">
        <div class="text-muted text-center py-3">${t('friendPosts.loadingComments')}</div>
      </div>
      <div class="friend-post-comment-form">
        <textarea id="${inputId}" class="form-control"
          placeholder="${t('friendPosts.commentPlaceholder')}"
          maxlength="1000" rows="2"></textarea>
        <button id="${sendBtnId}" type="button" class="btn btn-info text-white mt-2">
          <i class="fa fa-paper-plane me-1"></i> ${t('friendPosts.send')}
        </button>
      </div>
    </div>
  `

  const overlay = showOverlay(t('friendPosts.commentsTitle'), '', content)

  const renderList = (comments) => {
    const list = el('#' + listId)
    if (!list) return
    if (!comments || comments.length === 0) {
      list.innerHTML = `<div class="text-muted text-center py-3">${t('friendPosts.noComments')}</div>`
      return
    }
    list.innerHTML = comments.map(renderComment).join('')
    list.scrollTop = list.scrollHeight
  }

  const load = async () => {
    try {
      const { comments } = await server.getFriendPostComments(postId)
      renderList(comments)
    } catch (err) {
      const list = el('#' + listId)
      if (list) list.innerHTML = `<div class="text-danger text-center py-3">${escapeHtml(err.message || t('toast.somethingWentWrong'))}</div>`
    }
  }

  load()

  setTimeout(() => {
    const input = el('#' + inputId)
    const sendBtn = el('#' + sendBtnId)
    if (!input || !sendBtn) return

    const submit = async () => {
      const text = input.value.trim()
      if (!text) return
      sendBtn.disabled = true
      try {
        await server.addFriendPostComment(postId, text)
        input.value = ''
        await load()
        if (typeof onCommentAdded === 'function') onCommentAdded()
      } catch (err) {
        showServerError(err)
      } finally {
        sendBtn.disabled = false
      }
    }

    sendBtn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    })
    input.focus()
  }, 0)

  return overlay
}

