import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { setQueryParams } from '../../lib/router.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { formatDate, isToday } from '../../lib/date.js'
import { toast } from '../../partials/toast.js'
import { showInviteFriendOverlay } from '../../partials/inviteFriendOverlay.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { showUserProfileOverlay } from '../../partials/userProfileOverlay.js'
import { CHAT_MESSAGES_READ_EVENT } from '../../partials/chatOverlay.js'

/** Conversations shown per page in the chat list. */
const CHATS_PER_PAGE = 5

/** Friends shown per page in the friends table. */
const FRIENDS_PER_PAGE = 7

function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

function escapeHtml (text) {
  const div = document.createElement('div')
  div.textContent = text == null ? '' : String(text)
  return div.innerHTML
}

/**
 * One-line preview of a conversation's most recent message, WhatsApp style:
 * the message text, or a placeholder for image / voice messages, prefixed with
 * "You:" when the current user sent it.
 * @param {{lastMessage: {text: string|null, hasImage: boolean, hasAudio: boolean, fromMe: boolean}|null}} conversation
 * @returns {string} escaped HTML
 */
function chatPreview (conversation) {
  const last = conversation.lastMessage
  if (!last) return escapeHtml(t('chat.noMessages'))
  let body
  if (last.text) body = last.text
  else if (last.hasAudio) body = t('chat.voiceMessage')
  else if (last.hasImage) body = t('chat.imageMessage')
  else body = t('chat.noMessages')
  const prefix = last.fromMe ? t('chat.previewYou') : ''
  return escapeHtml(prefix + body)
}

/**
 * Timestamp of the last message: time of day while it is from today,
 * "Yesterday" for the day before, and the plain date beyond that.
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
function formatChatTime (value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (isToday(date)) return formatDate('hh:mm', date)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const sameDay = date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (sameDay) return t('chat.yesterday')
  return formatDate('DD.MM.YYYY', date)
}

/**
 * Friends sub-page on the dashboard. The active conversations come first as a
 * messenger-style list (avatar, name, last-message preview, timestamp), and
 * below that the friendships themselves — incoming and outgoing — with links
 * to the friend's club, league and last game plus accept/decline actions for
 * purely incoming requests. Both lists are paginated.
 */
export class FriendsPage extends UIElement {
  async load () {
    const [{ entries }, conversationsResponse] = await Promise.all([
      server.getFriendsOverview(),
      server.getConversations().catch(() => ({ conversations: [] }))
    ])
    this._entries = entries || []
    this._conversations = conversationsResponse.conversations || []
    this._clampPages()
  }

  get template () {
    return `
      <div>
        ${this._renderChatsSection()}
        ${this._renderFriendsSection()}
        <div class="d-flex flex-column flex-md-row u-gap-md mt-4 dashboard-promo-row mb-4">
          ${this._renderInviteCard()}
        </div>
      </div>
    `
  }

  /**
   * @returns {import('../../lib/UIElement.js').UIElementEvents}
   */
  get events () {
    return {
      // Delegated: every avatar / name link in the list carries the user id
      // and opens the profile as an overlay instead of navigating (#532).
      '(optional) [data-profile-user-id]': {
        click: (event) => {
          event.preventDefault()
          showUserProfileOverlay(Number(event.currentTarget.dataset.profileUserId))
        }
      }
    }
  }

  /**
   * A message arriving for any conversation changes the chat list (new
   * preview, new order, unread highlight), so refetch it.
   * @returns {Record<string, (data: any) => void>}
   */
  get serverEvents () {
    return {
      NEW_CHAT_MESSAGE: () => { void this._reloadConversations() }
    }
  }

  onMounted () {
    // Opening a conversation marks it read — drop the unread highlight again.
    window.addEventListener(CHAT_MESSAGES_READ_EVENT, this._onChatMessagesRead)
  }

  onDestroy () {
    window.removeEventListener(CHAT_MESSAGES_READ_EVENT, this._onChatMessagesRead)
  }

  _entries = []
  _conversations = []
  _chatsPage = 1
  _friendsPage = 1

  _onChatMessagesRead = () => { void this._reloadConversations() }

  /**
   * Keep both page numbers inside their list's bounds, e.g. after removing a
   * friend emptied the last page.
   * @returns {void}
   */
  _clampPages () {
    this._chatsPage = Math.min(Math.max(1, this._chatsPage), this._chatsTotalPages)
    this._friendsPage = Math.min(Math.max(1, this._friendsPage), this._friendsTotalPages)
  }

  get _chatsTotalPages () {
    return Math.max(1, Math.ceil(this._conversations.length / CHATS_PER_PAGE))
  }

  get _friendsTotalPages () {
    return Math.max(1, Math.ceil(this._entries.length / FRIENDS_PER_PAGE))
  }

  // ─── Chats ───────────────────────────────────────────────────────────────

  _renderChatsSection () {
    return `
      <section class="chat-list-section mb-4">
        <h4 class="mb-2"><i class="fa fa-comments"></i> ${t('chat.conversations')}</h4>
        ${this._renderChatList()}
      </section>
    `
  }

  _renderChatList () {
    if (this._conversations.length === 0) {
      return `
        <div class="card card-body bg-dark text-white text-center py-4">
          <i class="fa fa-comment-o fa-2x mb-2 opacity-50"></i>
          <p class="mb-0">${t('chat.empty')}</p>
        </div>
      `
    }
    const start = (this._chatsPage - 1) * CHATS_PER_PAGE
    const items = this._conversations
      .slice(start, start + CHATS_PER_PAGE)
      .map(conversation => this._renderChatItem(conversation))
      .join('')
    return `
      <div class="chat-list">${items}</div>
      ${this._renderPagination(this._chatsPage, this._chatsTotalPages, page => this._goToChatsPage(page))}
    `
  }

  _renderChatItem (conversation) {
    const itemId = generateId()
    onClick('#' + itemId, () => setQueryParams({ chat_user: conversation.userId }))
    const unread = Number(conversation.unread) > 0
    return `
      <button id="${itemId}" type="button"
        class="chat-list-item${unread ? ' chat-list-item--unread bg-info-subtle' : ''}">
        <img class="chat-list-item__avatar${conversation.avatar ? '' : ' chat-list-item__avatar--default'}"
             src="${avatarSrc(conversation.avatar)}" alt="">
        <span class="chat-list-item__body">
          <span class="chat-list-item__name">${escapeHtml(conversation.username)}</span>
          <span class="chat-list-item__preview">${chatPreview(conversation)}</span>
        </span>
        <span class="chat-list-item__meta">
          <span class="chat-list-item__time">${formatChatTime(conversation.lastMessageAt)}</span>
          ${unread ? `<span class="badge rounded-pill bg-danger">${conversation.unread}</span>` : ''}
        </span>
      </button>
    `
  }

  // ─── Friends ─────────────────────────────────────────────────────────────

  _renderFriendsSection () {
    return `
      <section class="mb-4">
        <h4 class="mb-2"><i class="fa fa-users"></i> ${t('friends.title')} ${wikiInfoIcon('friends')}</h4>
        ${this._renderFriendsList()}
      </section>
    `
  }

  _renderFriendsList () {
    if (this._entries.length === 0) {
      return `
        <div class="card card-body bg-dark text-white text-center py-4">
          <i class="fa fa-user-friends fa-2x mb-2 opacity-50"></i>
          <p class="mb-0">${t('friends.empty')}</p>
        </div>
      `
    }
    const start = (this._friendsPage - 1) * FRIENDS_PER_PAGE
    const rows = this._entries
      .slice(start, start + FRIENDS_PER_PAGE)
      .map(entry => this._renderRow(entry))
      .join('')
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
      ${this._renderPagination(this._friendsPage, this._friendsTotalPages, page => this._goToFriendsPage(page))}
    `
  }

  _renderRow (entry) {
    const teamLink = entry.team ? `#team?id=${entry.team.id}` : '#dashboard'
    const userLink = `#user?user_id=${entry.userId}`
    // Opens the profile as an overlay so the friends list stays put (#532).
    const profileAttr = ` data-profile-user-id="${entry.userId}"`
    const leagueLink = entry.team
      ? `#results?level=${entry.team.level}&league=${entry.team.league}`
      : null
    const gameLink = entry.lastGame ? `#results?game_id=${entry.lastGame.id}` : null

    const avatarCell = `
      <a href="${userLink}"${profileAttr} class="d-inline-block">
        <img class="friends-avatar${entry.avatar ? '' : ' friends-avatar--default'}"
             src="${avatarSrc(entry.avatar)}" alt="${entry.username}">
      </a>
    `

    const nameCell = `
      <a href="${userLink}"${profileAttr} class="text-decoration-none">
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
    const chatId = generateId()
    onClick('#' + removeId, () => this._removeFriend(entry.userId))
    onClick('#' + chatId, () => setQueryParams({ chat_user: entry.userId }))
    return `
      <div class="d-inline-flex gap-1">
        <button id="${chatId}" type="button" class="btn btn-sm btn-outline-info" title="${t('chat.openChat')}">
          <i class="fa fa-comment"></i>
        </button>
        <button id="${removeId}" type="button" class="btn btn-sm btn-outline-secondary" title="${t('team.removeFriend')}">
          <i class="fa fa-user-times"></i>
        </button>
      </div>
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

  // ─── Pagination ──────────────────────────────────────────────────────────

  /**
   * Prev / next controls shared by both lists. Renders nothing while
   * everything fits on a single page.
   * @param {number} page - current 1-based page
   * @param {number} totalPages
   * @param {(page: number) => void} onGo
   * @returns {string}
   */
  _renderPagination (page, totalPages, onGo) {
    if (totalPages <= 1) return ''
    const prevId = generateId()
    const nextId = generateId()
    const prevDisabled = page <= 1
    const nextDisabled = page >= totalPages
    if (!prevDisabled) onClick('#' + prevId, () => onGo(page - 1))
    if (!nextDisabled) onClick('#' + nextId, () => onGo(page + 1))
    return `
      <div class="list-pagination">
        <button id="${prevId}" type="button" class="btn btn-sm btn-outline-secondary"
          ${prevDisabled ? 'disabled' : ''}>
          <i class="fa fa-chevron-left"></i>
        </button>
        <span class="list-pagination-label">${t('friends.page')} ${page} / ${totalPages}</span>
        <button id="${nextId}" type="button" class="btn btn-sm btn-outline-secondary"
          ${nextDisabled ? 'disabled' : ''}>
          <i class="fa fa-chevron-right"></i>
        </button>
      </div>
    `
  }

  async _goToChatsPage (page) {
    this._chatsPage = page
    this._clampPages()
    await this._rerender()
  }

  async _goToFriendsPage (page) {
    this._friendsPage = page
    this._clampPages()
    await this._rerender()
  }

  // ─── Data ────────────────────────────────────────────────────────────────

  /**
   * Refetch just the conversations (chat list) and redraw. Failures are
   * swallowed: the chat list is secondary to the friendships below it.
   * @returns {Promise<void>}
   */
  async _reloadConversations () {
    try {
      const { conversations } = await server.getConversations()
      this._conversations = conversations || []
      this._clampPages()
      await this._rerender()
    } catch (e) {
      console.warn('[friends] could not refresh conversations', e)
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
