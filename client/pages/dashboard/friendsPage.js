import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { generateId } from '../../lib/html.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { toast } from '../../partials/toast.js'
import { showInviteFriendOverlay } from '../../partials/inviteFriendOverlay.js'

function avatarSrc (avatar) {
  if (avatar) return `${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatar}`
  return './assets/avatar-placeholder.svg'
}

/**
 * Friends sub-page on the dashboard. Lists all incoming and outgoing
 * friendships in a single table with links to the friend's club, league and
 * last game, plus accept/decline actions for purely incoming requests.
 */
export class FriendsPage extends UIElement {
  async load () {
    const { entries } = await server.getFriendsOverview()
    this._entries = entries || []
  }

  get template () {
    return `
      <div>
        <h3 class="mb-3"><i class="fa fa-users"></i> ${t('friends.title')}</h3>
        ${this._renderTable()}
        <div class="d-flex flex-column flex-md-row u-gap-md mt-4 dashboard-promo-row mb-4">
          ${this._renderInviteCard()}
        </div>
      </div>
    `
  }

  _entries = []

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
              <th>${t('friends.colLeague')}</th>
              <th class="text-end">${t('friends.colPosition')}</th>
              <th>${t('friends.colLastGame')}</th>
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
        <td>${leagueCell}</td>
        <td class="text-end">${positionCell}</td>
        <td>${lastGameCell}</td>
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
      <div class="card card-body invite-card flex-fill mb-0">
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
