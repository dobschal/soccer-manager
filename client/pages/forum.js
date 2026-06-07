import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { formatDate } from '../lib/date.js'
import { t } from '../i18n/index.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'
import { showConfirmDialog } from '../partials/overlay.js'
import { FORUM_BADGE_COLORS } from '../util/forumBadgeColors.js'
import { attachMentionAutocomplete } from '../partials/mentionAutocomplete.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const MENTION_PATTERN = /(^|[^\w@])@([A-Za-z0-9_.-]{2,30})/g

/**
 * Render the body of a forum post or comment, escaping HTML and turning
 * @-mentions into highlighted spans.
 * @param {string} text
 * @returns {string}
 */
function renderForumBody (text) {
  const escaped = escapeHtml(text || '')
  const withMentions = escaped.replace(MENTION_PATTERN, (_match, prefix, username) =>
    `${prefix}<span class="forum-mention-tag">@${username}</span>`
  )
  return withMentions.replace(/\n/g, '<br>')
}

const EDIT_WINDOW_MS = 4 * 60 * 60 * 1000 // 4 hours

function isWithinEditWindow (createdAt) {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created <= EDIT_WINDOW_MS
}

export class ForumPage extends UIElement {

  async load () {
    const teamResponse = await server.getMyTeam()
    this._isAdmin = !!teamResponse.isAdmin
    this._currentUserId = teamResponse.user?.id ?? null
    this._params = getQueryParams()
    await this._loadView()
  }

  get template () {
    return `
      <div class="forum-page">
        <div class="forum-notice alert alert-info">
          <i class="fa fa-info-circle"></i>
          The forum language is <strong>English</strong>. Please be respectful and friendly.
          Aggressive or discriminatory behavior will result in a ban.
        </div>
        ${this._renderBreadcrumb()}
        ${this._view === 'post' ? this._renderPostDetail() : ''}
        ${this._view === 'posts' ? this._renderPostList() : ''}
        ${this._view === 'categories' ? this._renderCategoryList() : ''}
        <div id="forum-image-overlay" class="forum-image-overlay" hidden>
          <img id="forum-overlay-img" src="" alt="">
        </div>
      </div>
    `
  }

  get events () {
    return {
      '(optional) #forum-cat-submit': {
        click: async () => {
          const name = el(`${this._elementQuery} #forum-cat-name`)?.value
          const desc = el(`${this._elementQuery} #forum-cat-desc`)?.value
          if (!name?.trim()) return
          if (this._editingCategory) {
            await server.updateForumCategory(this._editingCategory.id, name, desc)
            toast(t('forum.categoryUpdated'), 'success')
            this._editingCategory = null
          } else {
            await server.createForumCategory(name, desc)
            toast(t('forum.categoryCreated'), 'success')
          }
          this._params = getQueryParams()
          await this._loadView()
          this.update()
        }
      },
      '(optional) #forum-cat-cancel': {
        click: () => {
          this._editingCategory = null
          this.update()
        }
      },
      '(optional) #forum-post-create': {
        click: async () => {
          const title = el(`${this._elementQuery} #forum-post-title`)?.value
          const text = el(`${this._elementQuery} #forum-post-text`)?.value
          if (!title?.trim() || !text?.trim()) return
          const images = (this._pendingPostImages || []).map(img => ({
            data: img.data,
            type: img.type
          }))
          const { postId } = await server.createForumPost(Number(this._params.category), title, text, images.length > 0 ? images : null)
          this._pendingPostImages = []
          setQueryParams({ post: postId })
        }
      },
      '(optional) #forum-post-image-input': {
        change: (e) => this._onPostImagesSelected(e)
      },
      '(optional) #forum-like-btn': {
        click: async () => {
          const {
            liked,
            likeCount
          } = await server.toggleForumPostLike(Number(this._params.post))
          this._post.liked = liked
          this._post.like_count = likeCount
          const btn = el(`${this._elementQuery} #forum-like-btn`)
          if (btn) {
            btn.className = `btn btn-sm ${liked ? 'btn-danger' : 'btn-outline-danger'}`
            btn.innerHTML = `<i class="fa fa-heart${liked ? '' : '-o'}"></i> ${likeCount}`
          }
        }
      },
      '(optional) #forum-comment-send': {
        click: () => this._submitComment()
      },
      '(optional) #forum-comment-input': {
        keydown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            this._submitComment()
          }
        }
      },
      '(optional) #forum-image-input': {
        change: (e) => this._onImagesSelected(e)
      },
      '(optional) #forum-image-overlay': {
        click: () => {
          const overlay = el(`${this._elementQuery} #forum-image-overlay`)
          if (overlay) overlay.hidden = true
        }
      },
      '(optional) #forum-prev-page': {
        click: () => setQueryParams({ page: this._page - 1 })
      },
      '(optional) #forum-next-page': {
        click: () => setQueryParams({ page: this._page + 1 })
      },
      '(optional) #forum-badge-filter-select': {
        change: (e) => {
          const value = e.target.value
          setQueryParams({
            badge: value ? encodeURIComponent(value) : undefined,
            page: undefined
          })
        }
      },
      '(optional) #forum-toggle-archived': {
        click: () => setQueryParams({
          archived: this._includeArchived ? undefined : '1',
          page: undefined
        })
      },
      '(optional) #forum-latest-posts-prev': {
        click: () => {
          this._latestPostsPage = Math.max(1, (this._latestPostsPage || 1) - 1)
          this.update()
        }
      },
      '(optional) #forum-latest-posts-next': {
        click: () => {
          this._latestPostsPage = (this._latestPostsPage || 1) + 1
          this.update()
        }
      },
      '(optional) #forum-latest-comments-prev': {
        click: () => {
          this._latestCommentsPage = Math.max(1, (this._latestCommentsPage || 1) - 1)
          this.update()
        }
      },
      '(optional) #forum-latest-comments-next': {
        click: () => {
          this._latestCommentsPage = (this._latestCommentsPage || 1) + 1
          this.update()
        }
      }
    }
  }

  onMounted () {
    this._attachDelegatedEvents()
  }

  onUpdate () {
    this._attachDelegatedEvents()
  }

  onQueryChanged (params) {
    this._params = params
    this._loadView().then(() => this.update())
  }

  showLoadingIndicator = true

  async _loadView () {
    if (this._params.post) {
      const data = await server.getForumPost(Number(this._params.post))
      this._post = data.post
      this._comments = data.comments
      this._view = 'post'
    } else if (this._params.category) {
      const page = Number(this._params.page) || 1
      const badgeFilter = this._params.badge ? decodeURIComponent(this._params.badge) : null
      const includeArchived = this._params.archived === '1'
      const data = await server.getForumPosts(Number(this._params.category), page, badgeFilter, includeArchived)
      this._category = data.category
      this._posts = data.posts
      this._totalPages = data.totalPages
      this._page = data.page
      this._availableBadges = data.availableBadges || []
      this._badgeFilter = data.badgeFilter
      this._archivedCount = data.archivedCount || 0
      this._includeArchived = data.includeArchived
      this._view = 'posts'
    } else {
      const data = await server.getForumCategories()
      this._categories = data.categories
      this._latestComments = data.latestComments || []
      this._latestPosts = data.latestPosts || []
      this._mentions = data.mentions || []
      this._view = 'categories'
    }
  }

  _renderMentions () {
    if (!this._mentions || this._mentions.length === 0) return ''
    let html = `<h3 class="forum-latest-comments-title mt-4 mb-2"><i class="fa fa-at"></i> ${t('forum.mentionsTitle')}</h3>`
    html += '<div class="list-group">'
    for (const m of this._mentions) {
      const date = formatDate('DD.MM.YYYY hh:mm', m.created_at)
      const preview = (m.snippet || '').length > 120 ? m.snippet.slice(0, 120) + '…' : (m.snippet || '')
      html += `
        <a href="#dashboard?sub_page=forum&category=${m.category_id}&post=${m.post_id}" class="list-group-item list-group-item-action forum-latest-comment-item forum-mention-item">
          <div class="forum-latest-comment-title">${escapeHtml(m.post_title || '')}</div>
          <p class="mb-1 text-muted forum-post-preview">${escapeHtml(preview)}</p>
          <small class="text-muted">${escapeHtml(m.author_username || '')} - ${date}</small>
        </a>
      `
    }
    html += '</div>'
    return html
  }

  _renderBreadcrumb () {
    let crumbs = `<a href="#dashboard?sub_page=forum">${t('forum.title')}</a>`
    if (this._view === 'posts' || this._view === 'post') {
      crumbs += ` <i class="fa fa-chevron-right forum-breadcrumb-sep"></i> <a href="#dashboard?sub_page=forum&category=${this._params.category}">${escapeHtml(this._view === 'post' ? (this._post?.category_name || '') : this._category?.name || '')}</a>`
    }
    if (this._view === 'post') {
      crumbs += ` <i class="fa fa-chevron-right forum-breadcrumb-sep"></i> <span>${escapeHtml(this._post?.title || '')}</span>`
    }
    return `<div class="forum-breadcrumb mb-3">${crumbs}</div>`
  }

  _renderCategoryList () {
    let html = ''
    if (!this._categories || this._categories.length === 0) {
      html += `<p class="text-muted">${t('forum.noCategories')}</p>`
    } else {
      html += `<h3 class="forum-latest-comments-title mb-2">${t('forum.categories')}</h3>`
      html += '<div class="list-group">'
      for (const cat of this._categories) {
        const lastActivity = cat.last_activity ? formatDate('DD.MM.YYYY hh:mm', cat.last_activity) : '-'
        html += `
          <a href="#dashboard?sub_page=forum&category=${cat.id}" class="list-group-item list-group-item-action forum-category-item">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-1">${escapeHtml(cat.name)}</h6>
                ${cat.description ? `<small class="text-muted">${escapeHtml(cat.description)}</small>` : ''}
              </div>
              <div class="d-flex align-items-start gap-2">
                <div class="text-end forum-category-meta">
                  <span class="badge bg-secondary">${cat.post_count} ${t('forum.posts')}</span>
                  <br><small class="text-muted">${t('forum.lastActivity')}: ${lastActivity}</small>
                </div>
                ${this._isAdmin ? `
                  <div class="forum-author-actions">
                    <button class="btn btn-link btn-sm forum-icon-btn forum-edit-category" data-id="${cat.id}" data-name="${escapeHtml(cat.name)}" data-desc="${escapeHtml(cat.description || '')}" title="${t('forum.edit')}" aria-label="${t('forum.edit')}"><i class="fa fa-pencil"></i></button>
                    <button class="btn btn-link btn-sm forum-icon-btn forum-icon-btn-danger forum-delete-category" data-id="${cat.id}" title="${t('forum.delete')}" aria-label="${t('forum.delete')}"><i class="fa fa-trash"></i></button>
                  </div>
                ` : ''}
              </div>
            </div>
          </a>
        `
      }
      html += '</div>'
    }
    html += this._renderMentions()
    html += this._renderLatestPosts()
    html += this._renderLatestComments()
    if (this._isAdmin) {
      const editing = this._editingCategory
      html += `
        <div class="card mt-4 mb-3" id="forum-cat-form">
          <div class="card-body">
            <h6>${editing ? t('forum.editCategory') : t('forum.newCategory')}</h6>
            <input type="text" id="forum-cat-name" class="form-control mb-2" placeholder="${t('forum.categoryName')}" maxlength="255" value="${editing ? escapeHtml(editing.name) : ''}">
            <input type="text" id="forum-cat-desc" class="form-control mb-2" placeholder="${t('forum.categoryDescription')}" maxlength="500" value="${editing ? escapeHtml(editing.description || '') : ''}">
            <button id="forum-cat-submit" class="btn btn-primary btn-sm">${editing ? t('forum.save') : t('forum.createCategory')}</button>
            ${editing ? `<button id="forum-cat-cancel" class="btn btn-secondary btn-sm ms-1">${t('forum.cancel')}</button>` : ''}
          </div>
        </div>
      `
    }
    return html
  }

  _renderLatestPosts () {
    if (!this._latestPosts || this._latestPosts.length === 0) return ''
    const perPage = 3
    const totalPages = Math.max(1, Math.ceil(this._latestPosts.length / perPage))
    const page = Math.min(Math.max(1, this._latestPostsPage || 1), totalPages)
    this._latestPostsPage = page
    const start = (page - 1) * perPage
    const slice = this._latestPosts.slice(start, start + perPage)
    let html = `<h3 class="forum-latest-comments-title mt-4 mb-2">${t('forum.latestPosts')}</h3>`
    html += '<div class="list-group">'
    for (const p of slice) {
      const date = formatDate('DD.MM.YYYY hh:mm', p.created_at)
      const preview = p.text.length > 120 ? p.text.slice(0, 120) + '…' : p.text
      html += `
        <a href="#dashboard?sub_page=forum&category=${p.category_id}&post=${p.id}" class="list-group-item list-group-item-action forum-latest-comment-item">
          <div class="forum-latest-comment-title">${escapeHtml(p.title)}</div>
          <p class="mb-1 text-muted forum-post-preview">${escapeHtml(preview)}</p>
          <small class="text-muted">${escapeHtml(p.username)} - ${date}</small>
        </a>
      `
    }
    html += '</div>'
    if (totalPages > 1) {
      html += '<div class="d-flex justify-content-between align-items-center mt-2">'
      html += page > 1
        ? `<button id="forum-latest-posts-prev" class="btn btn-outline-secondary btn-sm">${t('common.prev')}</button>`
        : '<span></span>'
      html += `<span class="text-muted small">${t('common.page')} ${page} ${t('common.of')} ${totalPages}</span>`
      html += page < totalPages
        ? `<button id="forum-latest-posts-next" class="btn btn-outline-secondary btn-sm">${t('common.next')}</button>`
        : '<span></span>'
      html += '</div>'
    }
    return html
  }

  _renderLatestComments () {
    if (!this._latestComments || this._latestComments.length === 0) return ''
    const perPage = 3
    const totalPages = Math.max(1, Math.ceil(this._latestComments.length / perPage))
    const page = Math.min(Math.max(1, this._latestCommentsPage || 1), totalPages)
    this._latestCommentsPage = page
    const start = (page - 1) * perPage
    const slice = this._latestComments.slice(start, start + perPage)
    let html = `<h3 class="forum-latest-comments-title mt-4 mb-2">${t('forum.latestComments')}</h3>`
    html += '<div class="list-group">'
    for (const c of slice) {
      const date = formatDate('DD.MM.YYYY hh:mm', c.created_at)
      const preview = c.text.length > 120 ? c.text.slice(0, 120) + '…' : c.text
      html += `
        <a href="#dashboard?sub_page=forum&category=${c.category_id}&post=${c.post_id}" class="list-group-item list-group-item-action forum-latest-comment-item">
          <div class="forum-latest-comment-title">${escapeHtml(c.post_title)}</div>
          <p class="mb-1 text-muted forum-post-preview">${escapeHtml(preview)}</p>
          <small class="text-muted">${escapeHtml(c.username)} - ${date}</small>
        </a>
      `
    }
    html += '</div>'
    if (totalPages > 1) {
      html += '<div class="d-flex justify-content-between align-items-center mt-2">'
      html += page > 1
        ? `<button id="forum-latest-comments-prev" class="btn btn-outline-secondary btn-sm">${t('common.prev')}</button>`
        : '<span></span>'
      html += `<span class="text-muted small">${t('common.page')} ${page} ${t('common.of')} ${totalPages}</span>`
      html += page < totalPages
        ? `<button id="forum-latest-comments-next" class="btn btn-outline-secondary btn-sm">${t('common.next')}</button>`
        : '<span></span>'
      html += '</div>'
    }
    return html
  }

  _renderPostList () {
    let html = `<h5 class="mb-3">${escapeHtml(this._category?.name || '')}</h5>`
    const isNewsCategory = this._category?.name === 'News'
    const canPost = !isNewsCategory || this._isAdmin

    if (canPost) {
      html += `
        <div class="card mb-3">
          <div class="card-body">
            <h6>${t('forum.newPost')}</h6>
            <input type="text" id="forum-post-title" class="form-control mb-2" placeholder="${t('forum.postTitle')}" maxlength="255">
            <textarea id="forum-post-text" class="form-control mb-2" placeholder="${t('forum.postText')}" rows="3" maxlength="5000"></textarea>
            <div class="d-flex align-items-center gap-2">
              <button id="forum-post-create" class="btn btn-primary btn-sm">${t('forum.createPost')}</button>
              <label id="forum-post-image-btn" class="btn btn-outline-secondary btn-sm" title="${t('forum.addImages')}">
                <i class="fa fa-image"></i>
                <input id="forum-post-image-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden>
              </label>
            </div>
            <div id="forum-post-image-preview" class="forum-image-preview"></div>
          </div>
        </div>
      `
    }

    if (this._availableBadges && this._availableBadges.length > 0) {
      html += `
        <div class="forum-badge-filter mb-2 d-flex align-items-center gap-2">
          <label for="forum-badge-filter-select" class="text-muted small mb-0">${t('forum.filterByBadge')}:</label>
          <select id="forum-badge-filter-select" class="form-select form-select-sm forum-badge-filter-select">
            <option value="">${t('forum.allPosts')}</option>
            ${this._availableBadges.map(b => `
              <option value="${escapeHtml(b.badge_text)}"${this._badgeFilter === b.badge_text ? ' selected' : ''}>${escapeHtml(b.badge_text)}</option>
            `).join('')}
          </select>
        </div>
      `
    }

    if (!this._posts || this._posts.length === 0) {
      html += `<p class="text-muted">${t('forum.noPosts')}</p>`
    } else {
      html += '<div class="list-group">'
      for (const post of this._posts) {
        const date = formatDate('DD.MM.YYYY hh:mm', post.last_activity || post.created_at)
        const teamName = post.team_id ? `${escapeHtml(post.team_name || '')}` : ''
        const archivedBadge = post.is_archived ? ` <span class="forum-archived-indicator"><i class="fa fa-archive"></i> ${t('forum.archived')}</span>` : ''
        html += `
          <a href="#dashboard?sub_page=forum&category=${this._params.category}&post=${post.id}" class="list-group-item list-group-item-action forum-post-item${post.is_archived ? ' forum-post-item--archived' : ''}">
            <h6 class="mb-1">${escapeHtml(post.title)}${post.badge_text ? ` <span class="forum-badge" data-color="${escapeHtml(post.badge_color)}">${escapeHtml(post.badge_text)}</span>` : ''}${archivedBadge}</h6>
            <p class="mb-1 text-muted forum-post-preview">${escapeHtml(post.text)}</p>
            <p class="forum-meta">
              <small class="text-muted">${escapeHtml(post.username)} ${teamName ? '- ' + teamName : ''} - ${date}</small>
              <span class="ms-2"><i class="fa fa-heart${post.liked ? '' : '-o'}"></i> ${post.like_count}</span>
              <span class="ms-2"><i class="fa fa-comment-o"></i> ${post.comment_count}</span>
            </p>
          </a>
        `
      }
      html += '</div>'

      if (this._totalPages > 1) {
        html += '<div class="d-flex justify-content-between mt-3">'
        html += this._page > 1
          ? `<button id="forum-prev-page" class="btn btn-outline-secondary btn-sm">${t('common.prev')}</button>`
          : '<span></span>'
        html += `<span class="text-muted">${t('common.page')} ${this._page} ${t('common.of')} ${this._totalPages}</span>`
        html += this._page < this._totalPages
          ? `<button id="forum-next-page" class="btn btn-outline-secondary btn-sm">${t('common.next')}</button>`
          : '<span></span>'
        html += '</div>'
      }
    }

    if (this._archivedCount > 0) {
      if (this._includeArchived) {
        html += `
          <div class="text-center mt-3">
            <button id="forum-toggle-archived" class="btn btn-outline-secondary btn-sm">
              <i class="fa fa-eye-slash"></i> ${t('forum.hideArchived')}
            </button>
          </div>`
      } else {
        html += `
          <div class="text-center mt-3">
            <button id="forum-toggle-archived" class="btn btn-outline-secondary btn-sm">
              <i class="fa fa-archive"></i> ${t('forum.showArchived', { count: this._archivedCount })}
            </button>
          </div>`
      }
    }
    return html
  }

  _renderPostDetail () {
    const post = this._post
    if (!post) return `<p class="text-muted">${t('forum.noPosts')}</p>`

    const date = formatDate('DD.MM.YYYY hh:mm', post.created_at)
    const teamLink = post.team_id ? `<a href="#team?id=${post.team_id}" class="forum-team-link">${escapeHtml(post.team_name || '')}</a>` : ''
    const isPostOwner = this._currentUserId && post.user_id === this._currentUserId
    const canEditPost = isPostOwner && isWithinEditWindow(post.created_at)
    const canDeletePost = isPostOwner || this._isAdmin
    const canArchivePost = this._isAdmin
    const isEditingPost = this._editingPostId === post.id

    const postBody = isEditingPost
      ? `
        <div class="forum-edit-form mb-3">
          <input type="text" id="forum-post-edit-title" class="form-control mb-2" maxlength="255" value="${escapeHtml(post.title)}">
          <textarea id="forum-post-edit-text" class="form-control mb-2" rows="4" maxlength="5000">${escapeHtml(post.text)}</textarea>
          <button id="forum-post-edit-save" class="btn btn-primary btn-sm">${t('forum.save')}</button>
          <button id="forum-post-edit-cancel" class="btn btn-secondary btn-sm ms-1">${t('forum.cancel')}</button>
        </div>
      `
      : `<div class="forum-post-text mb-3">${renderForumBody(post.text)}</div>`

    let html = `
      <div class="card mb-3${post.is_archived ? ' forum-post-card--archived' : ''}">
        <div class="card-body">
          ${post.is_archived ? `<div class="alert alert-secondary py-2 mb-2"><i class="fa fa-archive me-1"></i> ${t('forum.archivedNotice')}</div>` : ''}
          <h5>${escapeHtml(post.title)}${post.badge_text ? ` <span class="forum-badge" data-color="${escapeHtml(post.badge_color)}">${escapeHtml(post.badge_text)}</span>` : ''}</h5>
          <div class="forum-meta mb-2">
            <small class="text-muted">${escapeHtml(post.username)} ${teamLink ? '- ' + teamLink : ''} - ${date}</small>
          </div>
          ${this._isAdmin ? `
            <div class="forum-badge-admin mb-2">
              ${post.badge_text
    ? `<button class="btn btn-outline-secondary btn-sm forum-remove-badge" data-id="${post.id}"><i class="fa fa-times"></i> ${t('forum.removeBadge')}</button>`
    : `<button class="btn btn-outline-secondary btn-sm" id="forum-badge-toggle"><i class="fa fa-tag"></i> ${t('forum.addBadge')}</button>`
}
              ${(() => {
    const allowedHexes = FORUM_BADGE_COLORS.map(c => c.hex.toLowerCase())
    const currentColor = (post.badge_color || '').toLowerCase()
    const selectedColor = allowedHexes.includes(currentColor) ? currentColor : FORUM_BADGE_COLORS[0].hex
    return `
              <div id="forum-badge-form" class="forum-badge-form" ${post.badge_text ? '' : 'hidden'}>
                <input type="text" id="forum-badge-text" class="form-control form-control-sm" placeholder="${t('forum.badgeText')}" maxlength="50" value="${post.badge_text ? escapeHtml(post.badge_text) : ''}">
                <div class="forum-badge-color-swatches" role="radiogroup" aria-label="${t('forum.badgeColor')}">
                  ${FORUM_BADGE_COLORS.map(c => {
      const selected = selectedColor === c.hex.toLowerCase()
      return `<button type="button" class="forum-badge-color-swatch${selected ? ' is-selected' : ''}" data-color="${c.hex}" style="background-color: ${c.hex}" title="${t(c.key)}" aria-label="${t(c.key)}" aria-pressed="${selected}"></button>`
    }).join('')}
                </div>
                <input type="hidden" id="forum-badge-color" value="${selectedColor}">
                <button id="forum-badge-save" class="btn btn-primary btn-sm">${t('forum.save')}</button>
              </div>`
  })()}
            </div>
          ` : ''}
          ${postBody}
          ${(!isEditingPost && post.images && post.images.length > 0) ? `<div class="forum-comment-images mb-3">${post.images.map(img =>
    `<img src="${window.__NATIVE_SERVER_URL || ''}/uploads/forum/${escapeHtml(img.filename)}" class="forum-comment-thumb" data-full="${window.__NATIVE_SERVER_URL || ''}/uploads/forum/${escapeHtml(img.filename)}">`
  ).join('')}</div>` : ''}
          <div class="forum-post-footer">
            <button id="forum-like-btn" class="btn btn-sm ${post.liked ? 'btn-danger' : 'btn-outline-danger'}">
              <i class="fa fa-heart${post.liked ? '' : '-o'}"></i> ${post.like_count}
            </button>
            ${!isEditingPost && (canEditPost || canDeletePost || canArchivePost) ? `
              <div class="forum-post-actions">
                ${canEditPost ? `<button class="btn btn-sm btn-outline-secondary forum-edit-post" data-id="${post.id}" title="${t('forum.editPost')}" aria-label="${t('forum.editPost')}"><i class="fa fa-pencil"></i></button>` : ''}
                ${canArchivePost ? `<button class="btn btn-sm btn-outline-secondary forum-archive-post" data-id="${post.id}" data-archived="${post.is_archived ? '1' : '0'}" title="${post.is_archived ? t('forum.unarchivePost') : t('forum.archivePost')}" aria-label="${post.is_archived ? t('forum.unarchivePost') : t('forum.archivePost')}"><i class="fa fa-archive"></i></button>` : ''}
                ${canDeletePost ? `<button class="btn btn-sm btn-outline-danger forum-delete-post" data-id="${post.id}" title="${t('forum.deletePost')}" aria-label="${t('forum.deletePost')}"><i class="fa fa-trash"></i></button>` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `

    // Comments
    html += `<h6 class="mb-2">${t('forum.comments')} (${this._comments.length})</h6>`

    if (this._comments.length === 0) {
      html += `<p class="text-muted">${t('forum.noComments')}</p>`
    } else {
      for (const comment of this._comments) {
        const cDate = formatDate('DD.MM.YYYY hh:mm', comment.created_at)
        const cTeamLink = comment.team_id ? `<a href="#team?id=${comment.team_id}" class="forum-team-link">${escapeHtml(comment.team_name || '')}</a>` : ''
        const commentImages = (comment.images || []).map(img =>
          `<img src="${window.__NATIVE_SERVER_URL || ''}/uploads/forum/${escapeHtml(img.filename)}" class="forum-comment-thumb" data-full="${window.__NATIVE_SERVER_URL || ''}/uploads/forum/${escapeHtml(img.filename)}">`
        ).join('')
        const isCommentOwner = this._currentUserId && comment.user_id === this._currentUserId
        const canEditComment = isCommentOwner && isWithinEditWindow(comment.created_at)
        const canDeleteComment = isCommentOwner || this._isAdmin
        const isEditingComment = this._editingCommentId === comment.id

        const commentBody = isEditingComment
          ? `
            <div class="forum-edit-form mt-1">
              <textarea id="forum-comment-edit-text-${comment.id}" class="form-control mb-2 forum-comment-edit-text" data-id="${comment.id}" rows="3" maxlength="1000">${escapeHtml(comment.text)}</textarea>
              <button class="btn btn-primary btn-sm forum-comment-edit-save" data-id="${comment.id}">${t('forum.save')}</button>
              <button class="btn btn-secondary btn-sm ms-1 forum-comment-edit-cancel">${t('forum.cancel')}</button>
            </div>
          `
          : `<div>${renderForumBody(comment.text)}</div>`

        html += `
          <div class="forum-comment mb-2 pb-2 border-bottom">
            <div class="forum-meta mb-1">
              <strong>${escapeHtml(comment.username)}</strong>
              ${cTeamLink ? '- ' + cTeamLink : ''}
              <small class="text-muted ms-2">${cDate}</small>
            </div>
            ${commentBody}
            ${(!isEditingComment && commentImages) ? `<div class="forum-comment-images">${commentImages}</div>` : ''}
            ${!isEditingComment && (canEditComment || canDeleteComment) ? `
              <div class="forum-post-footer forum-post-footer--end">
                <div class="forum-post-actions">
                  ${canEditComment ? `<button class="btn btn-sm btn-outline-secondary forum-edit-comment" data-id="${comment.id}" title="${t('forum.editComment')}" aria-label="${t('forum.editComment')}"><i class="fa fa-pencil"></i></button>` : ''}
                  ${canDeleteComment ? `<button class="btn btn-sm btn-outline-danger forum-delete-comment" data-id="${comment.id}" title="${t('forum.deleteComment')}" aria-label="${t('forum.deleteComment')}"><i class="fa fa-trash"></i></button>` : ''}
                </div>
              </div>
            ` : ''}
          </div>
        `
      }
    }

    html += `
      <div class="mt-3">
        <textarea id="forum-comment-input" class="form-control" placeholder="${t('forum.commentPlaceholder')}" maxlength="1000" rows="3"></textarea>
        <div class="forum-comment-actions">
          <label id="forum-image-btn" class="btn btn-outline-secondary btn-sm" title="${t('forum.addImages')}">
            <i class="fa fa-image"></i>
            <input id="forum-image-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden>
          </label>
          <button id="forum-comment-send" class="btn btn-primary btn-sm" type="button">
            <i class="fa fa-paper-plane me-1"></i>${t('forum.send')}
          </button>
        </div>
        <div id="forum-image-preview" class="forum-image-preview"></div>
      </div>
    `

    return html
  }

  _onPostImagesSelected (e) {
    const files = Array.from(e.target.files || [])
    if (!this._pendingPostImages) this._pendingPostImages = []
    for (const file of files) {
      if (this._pendingPostImages.length >= 5) break
      if (!file.type.startsWith('image/')) continue
      if (file.size > 2 * 1024 * 1024) continue
      const reader = new FileReader()
      reader.onload = () => {
        this._pendingPostImages.push({
          data: reader.result,
          type: file.type,
          name: file.name
        })
        this._renderPostImagePreview()
      }
      reader.readAsDataURL(file)
    }
  }

  _renderPostImagePreview () {
    const container = el(`${this._elementQuery} #forum-post-image-preview`)
    if (!container) return
    container.innerHTML = (this._pendingPostImages || []).map((img, i) =>
      `<div class="forum-preview-item">
        <img src="${img.data}" class="forum-comment-thumb">
        <button class="forum-preview-remove" data-index="${i}"><i class="fa fa-times"></i></button>
      </div>`
    ).join('')
    container.querySelectorAll('.forum-preview-remove').forEach(btn => {
      btn.onclick = () => {
        this._pendingPostImages.splice(Number(btn.dataset.index), 1)
        this._renderPostImagePreview()
      }
    })
  }

  _onImagesSelected (e) {
    const files = Array.from(e.target.files || [])
    if (!this._pendingImages) this._pendingImages = []
    for (const file of files) {
      if (this._pendingImages.length >= 5) break
      if (!file.type.startsWith('image/')) continue
      if (file.size > 2 * 1024 * 1024) continue
      const reader = new FileReader()
      reader.onload = () => {
        this._pendingImages.push({
          data: reader.result,
          type: file.type,
          name: file.name
        })
        this._renderImagePreview()
      }
      reader.readAsDataURL(file)
    }
  }

  _renderImagePreview () {
    const container = el(`${this._elementQuery} #forum-image-preview`)
    if (!container) return
    container.innerHTML = (this._pendingImages || []).map((img, i) =>
      `<div class="forum-preview-item">
        <img src="${img.data}" class="forum-comment-thumb">
        <button class="forum-preview-remove" data-index="${i}"><i class="fa fa-times"></i></button>
      </div>`
    ).join('')
    container.querySelectorAll('.forum-preview-remove').forEach(btn => {
      btn.onclick = () => {
        this._pendingImages.splice(Number(btn.dataset.index), 1)
        this._renderImagePreview()
      }
    })
  }

  async _submitComment () {
    const input = el(`${this._elementQuery} #forum-comment-input`)
    if (!input || !input.value.trim()) return
    input.disabled = true
    try {
      const images = (this._pendingImages || []).map(img => ({
        data: img.data,
        type: img.type
      }))
      await server.addForumComment(Number(this._params.post), input.value, images.length > 0 ? images : null)
      this._pendingImages = []
      this._params = getQueryParams()
      await this._loadView()
      this.update()
    } finally {
      if (input) input.disabled = false
    }
  }

  _attachDelegatedEvents () {
    const root = el(this._elementQuery)
    if (!root) return

    // (Re)attach @-mention autocomplete on every render to whichever post / comment
    // textareas are currently in the DOM.
    if (this._mentionHandles) {
      this._mentionHandles.forEach(h => h.destroy())
    }
    this._mentionHandles = []
    root.querySelectorAll('#forum-post-text, #forum-comment-input, #forum-post-edit-text, .forum-comment-edit-text').forEach(input => {
      this._mentionHandles.push(attachMentionAutocomplete(input))
    })

    root.querySelectorAll('.forum-edit-category').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        this._editingCategory = {
          id: Number(btn.dataset.id),
          name: btn.dataset.name,
          description: btn.dataset.desc
        }
        await this.update()
        el(`${this._elementQuery} #forum-cat-form`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    })

    root.querySelectorAll('.forum-delete-category').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!(await showConfirmDialog(t('forum.confirmDelete'), t('forum.delete'), t('forum.cancel')))) return
        await server.deleteForumCategory(Number(btn.dataset.id))
        this._params = getQueryParams()
        await this._loadView()
        this.update()
      }
    })

    root.querySelectorAll('.forum-delete-post').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!(await showConfirmDialog(t('forum.confirmDeletePost'), t('forum.delete'), t('forum.cancel')))) return
        await server.deleteForumPost(Number(btn.dataset.id))
        const categoryId = this._post?.category_id || this._params.category
        if (categoryId) {
          setQueryParams({ category: categoryId })
        } else {
          this._params = getQueryParams()
          await this._loadView()
          this.update()
        }
      }
    })

    root.querySelectorAll('.forum-edit-post').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        this._editingPostId = Number(btn.dataset.id)
        this.update()
      }
    })

    root.querySelectorAll('.forum-archive-post').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        const isArchived = btn.dataset.archived === '1'
        const confirmMessage = isArchived ? t('forum.confirmUnarchivePost') : t('forum.confirmArchivePost')
        if (!(await showConfirmDialog(confirmMessage, t('forum.ok'), t('forum.cancel')))) return
        await server.setForumPostArchived(Number(btn.dataset.id), !isArchived)
        toast(t(isArchived ? 'forum.postUnarchived' : 'forum.postArchived'), 'success')
        await this._loadView()
        this.update()
      }
    })

    const postEditSave = root.querySelector('#forum-post-edit-save')
    if (postEditSave) {
      postEditSave.onclick = async () => {
        const title = el(`${this._elementQuery} #forum-post-edit-title`)?.value
        const text = el(`${this._elementQuery} #forum-post-edit-text`)?.value
        if (!title?.trim() || !text?.trim()) return
        await server.updateForumPost(this._editingPostId, title, text)
        toast(t('forum.postUpdated'), 'success')
        this._editingPostId = null
        await this._loadView()
        this.update()
      }
    }

    const postEditCancel = root.querySelector('#forum-post-edit-cancel')
    if (postEditCancel) {
      postEditCancel.onclick = () => {
        this._editingPostId = null
        this.update()
      }
    }

    root.querySelectorAll('.forum-edit-comment').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        this._editingCommentId = Number(btn.dataset.id)
        this.update()
      }
    })

    root.querySelectorAll('.forum-comment-edit-save').forEach(btn => {
      btn.onclick = async () => {
        const commentId = Number(btn.dataset.id)
        const textarea = el(`${this._elementQuery} #forum-comment-edit-text-${commentId}`)
        const text = textarea?.value
        if (!text?.trim()) return
        await server.updateForumComment(commentId, text)
        toast(t('forum.commentUpdated'), 'success')
        this._editingCommentId = null
        await this._loadView()
        this.update()
      }
    })

    root.querySelectorAll('.forum-comment-edit-cancel').forEach(btn => {
      btn.onclick = () => {
        this._editingCommentId = null
        this.update()
      }
    })

    root.querySelectorAll('.forum-comment-thumb').forEach(img => {
      img.onclick = () => {
        const overlay = el(`${this._elementQuery} #forum-image-overlay`)
        const overlayImg = el(`${this._elementQuery} #forum-overlay-img`)
        if (overlay && overlayImg) {
          overlayImg.src = img.dataset.full || img.src
          overlay.hidden = false
        }
      }
    })

    const badgeToggle = root.querySelector('#forum-badge-toggle')
    if (badgeToggle) {
      badgeToggle.onclick = () => {
        const form = el(`${this._elementQuery} #forum-badge-form`)
        if (form) form.hidden = !form.hidden
      }
    }

    root.querySelectorAll('.forum-badge-color-swatch').forEach(swatch => {
      swatch.onclick = (e) => {
        e.preventDefault()
        const hiddenInput = el(`${this._elementQuery} #forum-badge-color`)
        if (hiddenInput) hiddenInput.value = swatch.dataset.color
        root.querySelectorAll('.forum-badge-color-swatch').forEach(s => {
          const isSelected = s === swatch
          s.classList.toggle('is-selected', isSelected)
          s.setAttribute('aria-pressed', String(isSelected))
        })
      }
    })

    const badgeSave = root.querySelector('#forum-badge-save')
    if (badgeSave) {
      badgeSave.onclick = async () => {
        const text = el(`${this._elementQuery} #forum-badge-text`)?.value
        const color = el(`${this._elementQuery} #forum-badge-color`)?.value
        if (!text?.trim()) return
        await server.setForumPostBadge(Number(this._params.post), text, color)
        toast(t('forum.badgeSaved'), 'success')
        await this._loadView()
        this.update()
      }
    }

    root.querySelectorAll('.forum-remove-badge').forEach(btn => {
      btn.onclick = async () => {
        await server.removeForumPostBadge(Number(btn.dataset.id))
        toast(t('forum.badgeRemoved'), 'success')
        await this._loadView()
        this.update()
      }
    })

    root.querySelectorAll('.forum-badge').forEach(badge => {
      badge.style.backgroundColor = badge.dataset.color
    })

    root.querySelectorAll('.forum-delete-comment').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!(await showConfirmDialog(t('forum.confirmDeleteComment'), t('forum.delete'), t('forum.cancel')))) return
        await server.deleteForumComment(Number(btn.dataset.id))
        this._params = getQueryParams()
        await this._loadView()
        this.update()
      }
    })
  }
}
