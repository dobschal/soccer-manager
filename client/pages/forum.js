import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { getQueryParams, setQueryParams } from '../lib/router.js'
import { formatDate } from '../lib/date.js'
import { t } from '../i18n/index.js'
import { el } from '../lib/html.js'
import { toast } from '../partials/toast.js'

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export class ForumPage extends UIElement {
  async load () {
    const teamResponse = await server.getMyTeam()
    this._isAdmin = teamResponse.user?.username === 'Emmo'
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
      </div>
    `
  }
  get events () {
    return {
      '(optional) #forum-cat-create': {
        click: async () => {
          const name = el(`${this._elementQuery} #forum-cat-name`)?.value
          const desc = el(`${this._elementQuery} #forum-cat-desc`)?.value
          if (!name?.trim()) return
          await server.createForumCategory(name, desc)
          toast(t('forum.categoryCreated'), 'success')
          this._params = getQueryParams()
          await this._loadView()
          this.update()
        }
      },
      '(optional) #forum-post-create': {
        click: async () => {
          const title = el(`${this._elementQuery} #forum-post-title`)?.value
          const text = el(`${this._elementQuery} #forum-post-text`)?.value
          if (!title?.trim() || !text?.trim()) return
          const { postId } = await server.createForumPost(Number(this._params.category), title, text)
          setQueryParams({ post: postId })
        }
      },
      '(optional) #forum-like-btn': {
        click: async () => {
          const { liked, likeCount } = await server.toggleForumPostLike(Number(this._params.post))
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
        keydown: (e) => { if (e.key === 'Enter') this._submitComment() }
      },
      '(optional) #forum-prev-page': {
        click: () => setQueryParams({ page: this._page - 1 })
      },
      '(optional) #forum-next-page': {
        click: () => setQueryParams({ page: this._page + 1 })
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
  async _loadView () {
    if (this._params.post) {
      const data = await server.getForumPost(Number(this._params.post))
      this._post = data.post
      this._comments = data.comments
      this._view = 'post'
    } else if (this._params.category) {
      const page = Number(this._params.page) || 1
      const data = await server.getForumPosts(Number(this._params.category), page)
      this._category = data.category
      this._posts = data.posts
      this._totalPages = data.totalPages
      this._page = data.page
      this._view = 'posts'
    } else {
      const data = await server.getForumCategories()
      this._categories = data.categories
      this._view = 'categories'
    }
  }
  
  _renderBreadcrumb () {
    let crumbs = `<a href="#forum">${t('forum.title')}</a>`
    if (this._view === 'posts' || this._view === 'post') {
      crumbs += ` <i class="fa fa-chevron-right forum-breadcrumb-sep"></i> <a href="#forum?category=${this._params.category}">${escapeHtml(this._view === 'post' ? (this._post?.category_name || '') : this._category?.name || '')}</a>`
    }
    if (this._view === 'post') {
      crumbs += ` <i class="fa fa-chevron-right forum-breadcrumb-sep"></i> <span>${escapeHtml(this._post?.title || '')}</span>`
    }
    return `<div class="forum-breadcrumb mb-3">${crumbs}</div>`
  }
  
  _renderCategoryList () {
    let html = ''
    if (this._isAdmin) {
      html += `
        <div class="card mb-3">
          <div class="card-body">
            <h6>${t('forum.newCategory')}</h6>
            <input type="text" id="forum-cat-name" class="form-control mb-2" placeholder="${t('forum.categoryName')}" maxlength="255">
            <input type="text" id="forum-cat-desc" class="form-control mb-2" placeholder="${t('forum.categoryDescription')}" maxlength="500">
            <button id="forum-cat-create" class="btn btn-primary btn-sm">${t('forum.createCategory')}</button>
          </div>
        </div>
      `
    }

    if (!this._categories || this._categories.length === 0) {
      html += `<p class="text-muted">${t('forum.noCategories')}</p>`
    } else {
      html += '<div class="list-group">'
      for (const cat of this._categories) {
        const lastActivity = cat.last_activity ? formatDate('DD.MM.YYYY hh:mm', cat.last_activity) : '-'
        html += `
          <a href="#forum?category=${cat.id}" class="list-group-item list-group-item-action forum-category-item">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-1">${escapeHtml(cat.name)}</h6>
                ${cat.description ? `<small class="text-muted">${escapeHtml(cat.description)}</small>` : ''}
              </div>
              <div class="text-end forum-category-meta">
                <span class="badge bg-secondary">${cat.post_count} ${t('forum.posts')}</span>
                <br><small class="text-muted">${t('forum.lastActivity')}: ${lastActivity}</small>
              </div>
            </div>
            ${this._isAdmin ? `<button class="btn btn-danger btn-sm mt-1 forum-delete-category" data-id="${cat.id}">${t('forum.delete')}</button>` : ''}
          </a>
        `
      }
      html += '</div>'
    }
    return html
  }
  
  _renderPostList () {
    let html = `<h5 class="mb-3">${escapeHtml(this._category?.name || '')}</h5>`

    html += `
      <div class="card mb-3">
        <div class="card-body">
          <h6>${t('forum.newPost')}</h6>
          <input type="text" id="forum-post-title" class="form-control mb-2" placeholder="${t('forum.postTitle')}" maxlength="255">
          <textarea id="forum-post-text" class="form-control mb-2" placeholder="${t('forum.postText')}" rows="3" maxlength="5000"></textarea>
          <button id="forum-post-create" class="btn btn-primary btn-sm">${t('forum.createPost')}</button>
        </div>
      </div>
    `

    if (!this._posts || this._posts.length === 0) {
      html += `<p class="text-muted">${t('forum.noPosts')}</p>`
    } else {
      html += '<div class="list-group">'
      for (const post of this._posts) {
        const date = formatDate('DD.MM.YYYY hh:mm', post.created_at)
        const teamLink = post.team_id ? `<a href="#team?id=${post.team_id}" class="forum-team-link">${escapeHtml(post.team_name || '')}</a>` : ''
        html += `
          <div class="list-group-item forum-post-item">
            <a href="#forum?category=${this._params.category}&post=${post.id}" class="forum-post-link">
              <h6 class="mb-1">${escapeHtml(post.title)}</h6>
            </a>
            <div class="forum-meta">
              <small class="text-muted">${escapeHtml(post.username)} ${teamLink ? '- ' + teamLink : ''} - ${date}</small>
              <span class="ms-2"><i class="fa fa-heart${post.liked ? '' : '-o'}"></i> ${post.like_count}</span>
              <span class="ms-2"><i class="fa fa-comment-o"></i> ${post.comment_count}</span>
            </div>
            ${this._isAdmin ? `<button class="btn btn-danger btn-sm mt-1 forum-delete-post" data-id="${post.id}">${t('forum.delete')}</button>` : ''}
          </div>
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
    return html
  }

  _renderPostDetail () {
    const post = this._post
    if (!post) return `<p class="text-muted">${t('forum.noPosts')}</p>`

    const date = formatDate('DD.MM.YYYY hh:mm', post.created_at)
    const teamLink = post.team_id ? `<a href="#team?id=${post.team_id}" class="forum-team-link">${escapeHtml(post.team_name || '')}</a>` : ''

    let html = `
      <div class="card mb-3">
        <div class="card-body">
          <h5>${escapeHtml(post.title)}</h5>
          <div class="forum-meta mb-2">
            <small class="text-muted">${escapeHtml(post.username)} ${teamLink ? '- ' + teamLink : ''} - ${date}</small>
          </div>
          <div class="forum-post-text mb-3">${escapeHtml(post.text).replace(/\n/g, '<br>')}</div>
          <button id="forum-like-btn" class="btn btn-sm ${post.liked ? 'btn-danger' : 'btn-outline-danger'}">
            <i class="fa fa-heart${post.liked ? '' : '-o'}"></i> ${post.like_count}
          </button>
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
        html += `
          <div class="forum-comment mb-2 pb-2 border-bottom">
            <div class="forum-meta mb-1">
              <strong>${escapeHtml(comment.username)}</strong>
              ${cTeamLink ? '- ' + cTeamLink : ''}
              <small class="text-muted ms-2">${cDate}</small>
              ${this._isAdmin ? `<button class="btn btn-danger btn-sm ms-2 forum-delete-comment" data-id="${comment.id}">${t('forum.delete')}</button>` : ''}
            </div>
            <div>${escapeHtml(comment.text).replace(/\n/g, '<br>')}</div>
          </div>
        `
      }
    }

    html += `
      <div class="input-group mt-3">
        <input id="forum-comment-input" type="text" class="form-control" placeholder="${t('forum.commentPlaceholder')}" maxlength="1000">
        <button id="forum-comment-send" class="btn btn-primary" type="button">
          <i class="fa fa-paper-plane"></i>
        </button>
      </div>
    `

    return html
  }
  
  async _submitComment () {
    const input = el(`${this._elementQuery} #forum-comment-input`)
    if (!input || !input.value.trim()) return
    input.disabled = true
    try {
      await server.addForumComment(Number(this._params.post), input.value)
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

    root.querySelectorAll('.forum-delete-category').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm(t('forum.confirmDelete'))) return
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
        if (!confirm(t('forum.confirmDelete'))) return
        await server.deleteForumPost(Number(btn.dataset.id))
        this._params = getQueryParams()
        await this._loadView()
        this.update()
      }
    })

    root.querySelectorAll('.forum-delete-comment').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm(t('forum.confirmDelete'))) return
        await server.deleteForumComment(Number(btn.dataset.id))
        this._params = getQueryParams()
        await this._loadView()
        this.update()
      }
    })
  }
}
