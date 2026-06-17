import { server, showServerError } from '../lib/gateway.js'
import { UIElement } from '../lib/UIElement.js'
import { t } from '../i18n/index.js'
import { Table } from '../partials/table.js'
import { renderEmblem } from '../partials/emblem.js'
import { formatCupRound, formatLeague } from '../util/league.js'
import { goTo } from '../lib/router.js'
import { toast } from '../partials/toast.js'

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
  async applyQueryParams (params) {
    const newId = params.id ? Number(params.id) : null
    if (newId && newId !== this.userId) {
      this.userId = newId
    }
  }

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
          ${isOwnProfile ? `<span class="badge bg-info mt-2">${t('userProfile.you')}</span>` : ''}
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
