import { server, showServerError } from '../lib/gateway.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { Table } from '../partials/table.js'
import { renderEmblem } from '../partials/emblem.js'
import { formatCupRound, formatLeague } from '../util/league.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { toast } from '../partials/toast.js'
import { formatDate, formatLastActive } from '../lib/date.js'
import { showReportUserOverlay } from '../partials/reportUserOverlay.js'

function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

export class UserProfilePage extends UIElement {
  async load () {
    if (!this.userId) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
      const idParam = urlParams.get('id')
      if (idParam) this.userId = Number(idParam)
    }
    if (!this.userId) {
      const myTeam = await server.getMyTeam()
      this.userId = myTeam.user?.id
    }
    if (!this.userId) {
      toast(t('userProfile.notFound'), 'error')
      goTo('dashboard')
      return
    }

    try {
      const data = await server.getUserProfile(this.userId)
      this.profile = data
      // Friend status (only for other users' profiles)
      this._isFriend = false
      this._canBeFriend = !data.isOwnProfile && Boolean(this.userId)
      if (this._canBeFriend) {
        const friendStatus = await server.isFriend(this.userId)
        this._isFriend = Boolean(friendStatus.isFriend)
      }
    } catch (e) {
      showServerError(e)
      goTo('dashboard')
    }
  }

  get template () {
    if (!this.profile) {
      return `<div class="text-center text-muted">${t('common.loading')}</div>`
    }
    const { user, currentTeam, friends, history, isOwnProfile } = this.profile

    return `
      <div class="user-profile-page">
        ${this._renderHeader(user, currentTeam, isOwnProfile)}
        ${this._renderFriends(friends)}
        ${this._renderHistory(history)}
      </div>
    `
  }
  /**
   * @returns {import('../lib/UIElement.js').UIElementEvents}
   */
  get events () {
    return {
      '.friend-toggle-btn': {
        click: (event) => {
          event.preventDefault()
          this._handleFriendToggleClick()
        }
      },
      '(optional) .report-user-btn': {
        click: (event) => {
          event.preventDefault()
          showReportUserOverlay(this.userId, this.profile?.user?.username || '')
        }
      },
      '(optional) .chat-user-btn': {
        click: (event) => {
          event.preventDefault()
          setQueryParams({ chat_user: this.userId })
        }
      }
    }
  }

  /**
   * Called by the router when the cached page instance is reused with new
   * query params. Reload the profile when the requested user id changes so we
   * never show a stale (previously-viewed) user.
   * @param {{id?: string|number}} params
   * @returns {Promise<void>}
   */
  async onQueryChanged ({ id }) {
    const newId = id ? Number(id) : null
    if (newId && newId !== this.userId) {
      this.userId = newId
      this.profile = null
      await this.update(true)
    }
  }
  /**
   * Render the add/remove friend button for other users' profiles.
   * @returns {string}
   * @private
   */
  _renderFriendToggleButton () {
    if (!this._canBeFriend) return ''
    const disabled = this._isUpdatingFriend
    const inner = this._isUpdatingFriend
      ? '<i class="fa fa-spinner fa-spin"></i>'
      : this._isFriend
        ? `<i class="fa fa-user-times"></i> ${t('team.removeFriend')}`
        : `<i class="fa fa-user-plus"></i> ${t('team.addFriend')}`
    const cls = this._isFriend ? 'btn-outline-secondary' : 'btn-outline-info'
    return `
      <button class="btn btn-sm ${cls} friend-toggle-btn" ${disabled ? 'disabled' : ''}>
        ${inner}
      </button>
    `
  }

  /**
   * Handle add/remove friend button clicks.
   * @returns {Promise<void>}
   * @private
   */
  async _handleFriendToggleClick () {
    if (this._isUpdatingFriend || !this._canBeFriend || !this.userId) return
    try {
      this._isUpdatingFriend = true
      await this.update()
      if (this._isFriend) {
        await server.removeFriend(this.userId)
        this._isFriend = false
        toast(t('team.friendRemoved'), 'success')
      } else {
        await server.addFriend(this.userId)
        this._isFriend = true
        toast(t('team.friendAdded'), 'success')
      }
    } catch (e) {
      console.error('Error updating friend status:', e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    } finally {
      this._isUpdatingFriend = false
      await this.update()
    }
  }

  static cacheKeyParams = ['id']

  _renderHeader (user, currentTeam, isOwnProfile) {
    const teamLink = currentTeam ? `#team?id=${currentTeam.id}` : null
    const teamLabel = currentTeam
      ? `<a href="${teamLink}" class="text-decoration-none d-inline-flex align-items-center gap-2 mt-2">
           <span class="user-profile-emblem">${renderEmblem(currentTeam, 24)}</span>
           <span>${currentTeam.name}</span>
           <span class="text-muted small">${formatLeague(currentTeam.level, currentTeam.league)}</span>
         </a>`
      : `<div class="text-muted mt-2">${t('userProfile.noTeam')}</div>`

    return `
      <div class="d-flex align-items-center gap-3 mb-4">
        <img class="user-profile-avatar${user.avatar ? '' : ' user-profile-avatar--default'}"
             src="${avatarSrc(user.avatar)}" alt="${user.username}">
        <div>
          <h3 class="mb-0">${user.username}</h3>
          ${teamLabel}
          <div class="text-muted small mt-2 d-flex flex-wrap gap-3">
            ${user.joinedAt ? `<span><i class="fa fa-calendar-plus"></i> ${t('userProfile.joinedAt')}: ${formatDate('DD.MM.YYYY', user.joinedAt)}</span>` : ''}
            <span><i class="fa fa-clock"></i> ${t('userProfile.lastLogin')}: ${formatLastActive(user.lastLogin)}</span>
          </div>
          ${isOwnProfile ? `<span class="badge bg-info mt-2">${t('userProfile.you')}</span>` : ''}
          <div class="d-flex flex-wrap gap-2 mt-2">
            ${this._renderFriendToggleButton()}
            ${isOwnProfile ? '' : `<button class="btn btn-sm btn-outline-info chat-user-btn"><i class="fa fa-comment"></i> ${t('chat.openChat')}</button>`}
            ${isOwnProfile ? '' : `<button class="btn btn-sm btn-outline-danger report-user-btn"><i class="fa fa-flag"></i> ${t('report.button')}</button>`}
          </div>
        </div>
      </div>
    `
  }

  _renderFriends (friends) {
    if (!friends || friends.length === 0) {
      return `
        <section class="mb-4">
          <h5><i class="fa fa-users"></i> ${t('userProfile.friends')}</h5>
          <p class="text-muted">${t('userProfile.noFriends')}</p>
        </section>
      `
    }
    const items = friends.map(f => {
      const link = f.teamId ? `#team?id=${f.teamId}` : `#user?id=${f.id}`
      return `
        <a href="${link}" class="user-profile-friend">
          <img class="user-profile-friend-avatar${f.avatar ? '' : ' user-profile-friend-avatar--default'}"
               src="${avatarSrc(f.avatar)}" alt="${f.username}">
          <div class="user-profile-friend-meta">
            <div>${f.username}</div>
            ${f.teamName ? `<div class="text-muted small">${f.teamName}</div>` : ''}
          </div>
        </a>
      `
    }).join('')
    return `
      <section class="mb-4">
        <h5><i class="fa fa-users"></i> ${t('userProfile.friends')} (${friends.length})</h5>
        <div class="user-profile-friends-grid">${items}</div>
      </section>
    `
  }

  _renderHistory (history) {
    if (!history || history.length === 0) {
      return `
        <section class="mb-4">
          <h5><i class="fa fa-history"></i> ${t('userProfile.history')}</h5>
          <p class="text-muted">${t('userProfile.noHistory')}</p>
        </section>
      `
    }
    const table = new Table({
      cols: [
        { name: t('userProfile.season') },
        { name: t('userProfile.team') },
        { name: t('userProfile.league') },
        { name: t('userProfile.position') },
        { name: t('userProfile.points') },
        { name: t('userProfile.cup') }
      ],
      data: history,
      classes: 'table-striped',
      renderRow: (row) => {
        const teamLink = `#team?id=${row.teamId}`
        const team = `<a href="${teamLink}" class="text-decoration-none">${row.teamName}</a>`
        const cup = row.cupResult
          ? (row.cupResult.isWinner
            ? `<span class="badge bg-success"><i class="fa fa-trophy"></i> ${t('userProfile.cupWinner')}</span>`
            : `<span class="text-muted">${formatCupRound(row.cupResult.roundReached, row.cupResult.totalRounds)}</span>`)
          : `<span class="text-muted">—</span>`
        return [
          `${row.season}`,
          team,
          formatLeague(row.level, row.league),
          `${row.position}.`,
          `${row.points}`,
          cup
        ]
      }
    })
    return `
      <section class="mb-4">
        <h5><i class="fa fa-history"></i> ${t('userProfile.history')}</h5>
        ${table}
      </section>
    `
  }
}
