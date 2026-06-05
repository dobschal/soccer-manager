import { UIElement } from '../../lib/UIElement.js'
import { server, showServerError } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { el, generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { formatDate } from '../../lib/date.js'
import { toast } from '../../partials/toast.js'
import { showInviteFriendOverlay } from '../../partials/inviteFriendOverlay.js'
import { showFriendPostCommentsOverlay } from '../../partials/friendPostCommentsOverlay.js'

function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

function postImageSrc (filename) {
  return `${window.__NATIVE_SERVER_URL || ''}/uploads/friend-posts/${filename}`
}

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text == null ? '' : String(text)
  return div.innerHTML
}

/**
 * Friends sub-page on the dashboard. Lists all incoming and outgoing
 * friendships in a single table with links to the friend's club, league and
 * last game, plus accept/decline actions for purely incoming requests.
 * Underneath, a "Posts" section lets friends share text + optional image
 * updates with comments and likes.
 */
export class FriendsPage extends UIElement {
  async load () {
    const [{ entries }, postsData] = await Promise.all([
      server.getFriendsOverview(),
      server.getFriendPosts(1)
    ])
    this._entries = entries || []
    this._posts = postsData.posts || []
    this._postsPage = postsData.page
    this._postsTotalPages = postsData.totalPages
  }

  get template () {
    return `
      <div>
        <h3 class="mb-3"><i class="fa fa-users"></i> ${t('friends.title')}</h3>
        ${this._renderTable()}
        ${this._renderPostsSection()}
        <div class="d-flex flex-column flex-md-row u-gap-md mt-4 dashboard-promo-row mb-4">
          ${this._renderInviteCard()}
        </div>
      </div>
    `
  }

  _entries = []
  _posts = []
  _postsPage = 1
  _postsTotalPages = 1
  _pendingPostImage = null

  _renderTable () {
    if (this._entries.length === 0) {
      return `
        <div class="card card-body bg-dark text-white text-center py-4">
          <i class="fa fa-user-friends fa-2x mb-2 opacity-50"></i>
          <p class="mb-0">${t('friends.empty')}</p>
        </div>
      `
    }
    const rows = this._entries.map(entry => this._renderRow(entry)).join('')
    return `
      <div class="horizontal-scrollable-table">
        <table class="table table-hover wide-on-mobile align-middle friends-table">
          <thead>
            <tr>
              <th></th>
              <th>${t('friends.colName')}</th>
              <th>${t('friends.colClub')}</th>
              <th>${t('friends.colLastGame')}</th>
              <th>${t('friends.colLeague')}</th>
              <th class="text-end">${t('friends.colPosition')}</th>
              <th class="text-end"></th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `
  }

  _renderRow (entry) {
    const teamLink = entry.team ? `#team?id=${entry.team.id}` : '#dashboard'
    const leagueLink = entry.team
      ? `#results?level=${entry.team.level}&league=${entry.team.league}`
      : null
    const gameLink = entry.lastGame ? `#results?game_id=${entry.lastGame.id}` : null

    const avatarCell = `
      <a href="${teamLink}" class="d-inline-block">
        <img class="friends-avatar${entry.avatar ? '' : ' friends-avatar--default'}"
             src="${avatarSrc(entry.avatar)}" alt="${entry.username}">
      </a>
    `

    const nameCell = `
      <a href="${teamLink}" class="text-decoration-none">
        ${entry.username}
        ${entry.status === 'incoming' ? `<span class="badge bg-info ms-1">${t('friends.incoming')}</span>` : ''}
      </a>
    `

    const clubCell = entry.team
      ? `<a href="${teamLink}" class="text-decoration-none d-inline-flex align-items-center gap-2">
           <span class="friends-emblem">${renderEmblem(entry.team, 24)}</span>
           <span>${entry.team.name}</span>
         </a>`
      : `<span class="text-muted">${t('friends.noTeam')}</span>`

    const leagueCell = entry.team && leagueLink
      ? `<a href="${leagueLink}" class="text-decoration-none">${formatLeague(entry.team.level, entry.team.league)}</a>`
      : '—'

    const positionCell = entry.position
      ? `<a href="${leagueLink}" class="text-decoration-none">${entry.position}.</a>`
      : '—'

    const lastGameCell = entry.lastGame && entry.team
      ? this._renderLastGameCell(entry.lastGame, entry.team.id, gameLink)
      : `<span class="text-muted">—</span>`

    const actionsCell = this._renderActionsCell(entry)

    return `
      <tr>
        <td class="friends-avatar-cell">${avatarCell}</td>
        <td>${nameCell}</td>
        <td>${clubCell}</td>
        <td>${lastGameCell}</td>
        <td>${leagueCell}</td>
        <td class="text-end">${positionCell}</td>
        <td class="text-end">${actionsCell}</td>
      </tr>
    `
  }

  _renderLastGameCell (game, friendTeamId, gameLink) {
    const friendIsTeam1 = game.team1Id === friendTeamId
    const friendGoals = friendIsTeam1 ? game.goalsTeam1 : game.goalsTeam2
    const opponentGoals = friendIsTeam1 ? game.goalsTeam2 : game.goalsTeam1
    const opponentName = friendIsTeam1 ? (game.team2ShortName || game.team2Name) : (game.team1ShortName || game.team1Name)
    let resultClass = 'text-muted'
    if (friendGoals > opponentGoals) {
      resultClass = 'text-success'
    } else if (friendGoals < opponentGoals) resultClass = 'text-danger'
    const vs = opponentName ? ` ${t('friends.vsShort')} ${opponentName}` : ''
    return `
      <a href="${gameLink}" class="text-decoration-none ${resultClass}">
        ${friendGoals}:${opponentGoals}${vs}
      </a>
    `
  }

  _renderActionsCell (entry) {
    if (entry.status === 'incoming') {
      const acceptId = generateId()
      const declineId = generateId()
      onClick('#' + acceptId, () => this._acceptFriend(entry.userId))
      onClick('#' + declineId, () => this._declineFriend(entry.userId))
      return `
        <div class="d-inline-flex gap-1">
          <button id="${acceptId}" type="button" class="btn btn-sm btn-success" title="${t('friends.accept')}">
            <i class="fa fa-check"></i>
          </button>
          <button id="${declineId}" type="button" class="btn btn-sm btn-outline-secondary" title="${t('friends.decline')}">
            <i class="fa fa-times"></i>
          </button>
        </div>
      `
    }
    const removeId = generateId()
    onClick('#' + removeId, () => this._removeFriend(entry.userId))
    return `
      <button id="${removeId}" type="button" class="btn btn-sm btn-outline-secondary" title="${t('team.removeFriend')}">
        <i class="fa fa-user-times"></i>
      </button>
    `
  }

  _renderInviteCard () {
    const inviteId = generateId()
    onClick('#' + inviteId, () => showInviteFriendOverlay())
    return `
      <div class="card card-body bg-success-subtle invite-card flex-fill mb-0">
        <img src="assets/dashboard/user-invite.png" alt="" class="dashboard-promo-img">
        <h5 class="mb-2"><i class="fa fa-paper-plane"></i> ${t('referral.dashboardTitle')}</h5>
        <p class="text-muted mb-3">${t('referral.dashboardText')}</p>
        <div class="mt-auto">
          <button id="${inviteId}" type="button" class="btn btn-info btn-xl text-white">
            <i class="fa fa-envelope"></i> ${t('referral.inviteFriendShort')}
          </button>
        </div>
      </div>
    `
  }

  _renderPostsSection () {
    return `
      <div class="friend-posts-section">
        <h4 class="mb-3"><i class="fa fa-comments"></i> ${t('friendPosts.title')}</h4>
        ${this._renderPostList()}
        ${this._renderPostEditor()}
      </div>
    `
  }

  _renderPostEditor () {
    const textareaId = generateId()
    const fileInputId = generateId()
    const sendBtnId = generateId()
    const previewId = generateId()

    onClick('#' + sendBtnId, () => this._submitPost(textareaId, previewId))

    // File input change must be wired up after mount; onClick only handles
    // click. Use a setTimeout to attach a change listener once the input is
    // in the DOM.
    setTimeout(() => {
      const input = el('#' + fileInputId)
      if (input && !input._friendPostBound) {
        input.addEventListener('change', (e) => this._onPostImageSelected(e, previewId))
        input._friendPostBound = true
      }
    }, 0)

    return `
      <div class="friend-post-editor card card-body mb-3 mt-2 bg-info-subtle">
        <textarea id="${textareaId}" class="form-control"
          placeholder="${t('friendPosts.postPlaceholder')}"
          maxlength="5000" rows="3"></textarea>
        <div id="${previewId}" class="friend-post-editor-preview"></div>
        <div class="friend-post-editor-actions">
          <label class="btn btn-outline-secondary btn-sm friend-post-image-btn" title="${t('friendPosts.addImage')}">
            <i class="fa fa-image"></i>
            <input id="${fileInputId}" type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden>
          </label>
          <button id="${sendBtnId}" type="button" class="btn btn-info text-white btn-sm">
            <i class="fa fa-paper-plane me-1"></i> ${t('friendPosts.send')}
          </button>
        </div>
      </div>
    `
  }

  _renderPostList () {
    if (this._posts.length === 0) {
      return `
        <div class="card card-body bg-dark text-white text-center py-4">
          <i class="fa fa-comment-o fa-2x mb-2 opacity-50"></i>
          <p class="mb-0">${t('friendPosts.empty')}</p>
        </div>
      `
    }
    const posts = this._posts.map(post => this._renderPost(post)).join('')
    const pagination = this._renderPagination()
    return `
      <div class="friend-post-list">${posts}</div>
      ${pagination}
    `
  }

  _renderPost (post) {
    const date = formatDate('DD.MM.YYYY hh:mm', post.createdAt)
    const teamLink = post.teamId ? `#team?id=${post.teamId}` : null
    const authorLine = teamLink
      ? `<a href="${teamLink}" class="friend-post-author-link">
          <strong>${escapeHtml(post.username)}</strong>
          ${post.teamName ? `<span class="text-muted ms-1">- ${escapeHtml(post.teamName)}</span>` : ''}
        </a>`
      : `<strong>${escapeHtml(post.username)}</strong>`

    const imageMarkup = post.imageFilename
      ? `<div class="friend-post-image-wrap">
           <img class="friend-post-image" src="${postImageSrc(post.imageFilename)}" alt="">
         </div>`
      : ''

    const likeBtnId = generateId()
    const commentBtnId = generateId()
    onClick('#' + likeBtnId, () => this._toggleLike(post.id))
    onClick('#' + commentBtnId, () => this._openComments(post.id))

    return `
      <article class="friend-post card card-body${post.imageFilename ? '' : ' friend-post--no-image'}">
        ${imageMarkup}
        <div class="friend-post-content">
          <header class="friend-post-header">
            ${authorLine}
            <small class="text-muted ms-2">${date}</small>
          </header>
          <div class="friend-post-text">${escapeHtml(post.text).replace(/\n/g, '<br>')}</div>
          <div class="friend-post-actions">
            <button id="${likeBtnId}" type="button"
              class="btn btn-sm ${post.likedByMe ? 'btn-danger' : 'btn-outline-danger'}"
              title="${t('friendPosts.like')}">
              <i class="fa fa-heart${post.likedByMe ? '' : '-o'}"></i>
              <span class="ms-1">${post.likeCount}</span>
            </button>
            <button id="${commentBtnId}" type="button" class="btn btn-sm btn-outline-info"
              title="${t('friendPosts.comments')}">
              <i class="fa fa-comment-o"></i>
              <span class="ms-1">${post.commentCount}</span>
            </button>
          </div>
        </div>
      </article>
    `
  }

  _renderPagination () {
    if (this._postsTotalPages <= 1) return ''
    const prevId = generateId()
    const nextId = generateId()
    const prevDisabled = this._postsPage <= 1
    const nextDisabled = this._postsPage >= this._postsTotalPages
    if (!prevDisabled) onClick('#' + prevId, () => this._goToPage(this._postsPage - 1))
    if (!nextDisabled) onClick('#' + nextId, () => this._goToPage(this._postsPage + 1))
    return `
      <div class="friend-post-pagination">
        <button id="${prevId}" type="button" class="btn btn-sm btn-outline-secondary"
          ${prevDisabled ? 'disabled' : ''}>
          <i class="fa fa-chevron-left"></i>
        </button>
        <span class="friend-post-pagination-label">
          ${t('friendPosts.page')} ${this._postsPage} / ${this._postsTotalPages}
        </span>
        <button id="${nextId}" type="button" class="btn btn-sm btn-outline-secondary"
          ${nextDisabled ? 'disabled' : ''}>
          <i class="fa fa-chevron-right"></i>
        </button>
      </div>
    `
  }

  _onPostImageSelected (e, previewId) {
    const file = e.target.files && e.target.files[0]
    if (!file) {
      this._pendingPostImage = null
      this._updatePreview(previewId)
      return
    }
    if (!file.type.startsWith('image/')) {
      toast(t('friendPosts.invalidImage'), 'error')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast(t('friendPosts.imageTooLarge'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      this._pendingPostImage = {
        data: reader.result,
        type: file.type
      }
      this._updatePreview(previewId)
    }
    reader.readAsDataURL(file)
  }

  _updatePreview (previewId) {
    const preview = el('#' + previewId)
    if (!preview) return
    if (!this._pendingPostImage) {
      preview.innerHTML = ''
      return
    }
    const removeId = generateId()
    onClick('#' + removeId, () => {
      this._pendingPostImage = null
      this._updatePreview(previewId)
    })
    preview.innerHTML = `
      <div class="friend-post-preview-item">
        <img src="${this._pendingPostImage.data}" alt="">
        <button id="${removeId}" type="button" class="friend-post-preview-remove">
          <i class="fa fa-times"></i>
        </button>
      </div>
    `
  }

  async _submitPost (textareaId, previewId) {
    const textarea = el('#' + textareaId)
    if (!textarea) return
    const text = textarea.value.trim()
    if (!text) {
      toast(t('friendPosts.emptyText'), 'error')
      return
    }
    try {
      await server.createFriendPost(text, this._pendingPostImage)
      textarea.value = ''
      this._pendingPostImage = null
      this._updatePreview(previewId)
      await this._reloadPosts(1)
    } catch (err) {
      showServerError(err)
    }
  }

  async _toggleLike (postId) {
    try {
      const {
        liked,
        likeCount
      } = await server.toggleFriendPostLike(postId)
      const post = this._posts.find(p => p.id === postId)
      if (post) {
        post.likedByMe = liked
        post.likeCount = likeCount
      }
      await this._rerender()
    } catch (err) {
      showServerError(err)
    }
  }

  _openComments (postId) {
    showFriendPostCommentsOverlay(postId, () => this._reloadPosts(this._postsPage))
  }

  async _goToPage (page) {
    await this._reloadPosts(page)
  }

  async _reloadPosts (page) {
    try {
      const data = await server.getFriendPosts(page)
      this._posts = data.posts || []
      this._postsPage = data.page
      this._postsTotalPages = data.totalPages
      await this._rerender()
    } catch (err) {
      showServerError(err)
    }
  }

  async _rerender () {
    if (typeof this.update === 'function') {
      await this.update()
    }
  }

  async _acceptFriend (userId) {
    try {
      await server.addFriend(userId)
      toast(t('team.friendAdded'), 'success')
      await this._reload()
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  async _declineFriend (userId) {
    try {
      await server.removeFriend(userId)
      toast(t('team.friendRemoved'), 'success')
      await this._reload()
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  async _removeFriend (userId) {
    try {
      await server.removeFriend(userId)
      toast(t('team.friendRemoved'), 'success')
      await this._reload()
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  async _reload () {
    if (typeof this.update === 'function') {
      await this.update(true)
    }
  }
}
