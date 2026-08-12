import { server } from '../lib/gateway.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { PlayerList } from '../partials/playerList.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { renderEmblem } from '../partials/emblem.js'
import { UIElement } from '../lib/UIElement.js'
import { formatCupRound, formatLeague } from '../util/league.js'
import { showStadiumModal } from '../partials/stadiumModal.js'
import { showHeadToHeadOverlay } from '../partials/headToHeadOverlay.js'
import { euroFormat } from '../lib/currency.js'
import { t } from '../i18n/index.js'
import { toast } from '../partials/toast.js'
import { showGameModal } from '../partials/gameModal.js'
import { showUserProfileOverlay } from '../partials/userProfileOverlay.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { showDialog } from '../partials/dialog.js'
import { Table } from '../partials/table.js'
import { renderPositionBadge } from '../partials/positionBadge.js'
import { renderPageNumbers } from '../partials/pagination.js'
import { formatDate } from '../lib/date.js'
import { calculateMarketValue, calculatePlayerAge, getSalary } from '../util/player.js'
import { AdminTeamCards } from '../partials/adminTeamCards.js'

const TRANSFER_PAGE_SIZE = 10
const TIMELINE_PAGE_SIZE = 12
// Width of one timeline item slot in px: matches the CSS rule
// `.team-timeline__item { min-width: 78px }` + `.team-timeline__track { gap: 0.75rem }`.
// Used to translate the track by N item-widths instead of scrolling.
const TIMELINE_ITEM_WIDTH = 90
// Items shifted per chevron click. Roughly half a typical viewport width.
const TIMELINE_STEP = 3
// Fallback visible-item count used before the viewport has been measured.
const TIMELINE_VISIBLE_FALLBACK = 5

/**
 * Information to render:
 * emblem (/)
 * name (/)
 * strength (/)
 * freshness (/)
 * stadium + size (/)
 * league (level) (/)
 * players (/)
 * username (/)
 * trade_history
 * player value
 */

export class TeamPage extends UIElement {
  /**
   * @returns {Promise<void>}
   */
  async load () {
    // Get teamId from URL query params if not already set
    if (!this.teamId) {
      const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
      const idParam = urlParams.get('id')
      if (idParam) {
        this.teamId = Number(idParam)
      }
    }

    if (!this.teamId) throw new Error('No team id present...')
    const {
      team,
      players,
      user,
      isAdmin
    } = await server.getTeam(this.teamId)
    if (!team || team.is_system_team) {
      toast(t('team.cannotView'), 'error')
      this._notViewable = true
      if (window.history.length > 1) {
        window.history.back()
      } else {
        goTo('dashboard')
      }
      return
    }
    this._notViewable = false
    this.user = user
    this.team = team
    this.players = players
    this._isAdmin = Boolean(isAdmin)
    // Cache the admin panel so a page re-render (e.g. after a friendly match)
    // doesn't tear it down and re-fetch its data.
    if (this._isAdmin && (!this._adminCards || this._adminCards.teamId !== this.team.id)) {
      this._adminCards = new AdminTeamCards({ teamId: this.team.id })
    }

    const [stadium, myTeam, friendlyStatus, transferHistory, seasonHistory, gameday, timeline] = await Promise.all([
      server.getStadiumByTeamId(this.team.id),
      server.getMyTeam(),
      server.canPlayFriendlyToday(),
      server.getTeamTransferHistory(this.team.id),
      server.getTeamSeasonHistory(this.team.id),
      server.getCurrentGameday(),
      server.getTeamTimelineGames(this.team.id, 'initial', null, null, TIMELINE_PAGE_SIZE * 2)
    ])
    this.stadium = stadium
    this._isOwnTeam = myTeam.team.id === this.team.id
    this._canPlayFriendly = friendlyStatus.canPlay && !this._isOwnTeam
    this._transferHistory = transferHistory.transfers || []
    this._seasonHistory = seasonHistory.seasons || []
    this._season = gameday.season
    this._timelineGames = timeline.games || []
    this._timelineHasMorePast = this._timelineGames.length > 0
    this._timelineHasMoreFuture = this._timelineGames.length > 0
    this._timelineLoading = false
    this._timelineOffset = this._computeInitialTimelineOffset(TIMELINE_VISIBLE_FALLBACK)

    // Friend status (only for foreign teams that have a user)
    this._isFriend = false
    this._canBeFriend = !this._isOwnTeam && Boolean(this.user?.id)
    if (this._canBeFriend) {
      const friendStatus = await server.isFriend(this.user.id)
      this._isFriend = Boolean(friendStatus.isFriend)
    }
  }

  /**
   * @returns {string}
   */
  get template () {
    if (this._notViewable) return '<div></div>'
    return `
      <div>
        <h2 class="mb-4 text-center text-lg-start">${this.team.name}</h2>
        <div class="row">
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            ${this._renderTeamInfoCard()}
          </div>
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            <div class="card h-100">
              <div class="card-header text-white gradient-header">
                <h5 class="card-title mb-0">${t('myTeam.emblem')}</h5>
              </div>
              <div class="card-body u-perspective-40">
                <div class="mb-4 emblem-viewer text-center">
                  ${renderEmblem(this.team, 200)}
                </div>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-6 col-xl-4 mb-4">
            ${this._renderCoachCard()}
          </div>
        </div>
        ${this._renderAdminActionCards()}
        ${this._renderFriendlyMatchButton()}
        <div class="mb-4">
            <h4>${t('team.timeline')}</h4>
            ${this._renderTimeline()}
        </div>
        <div class="mb-4">
            <h4>${t('team.seasonHistory')}</h4>
            <div class="horizontal-scrollable-table">
                ${this._renderSeasonHistoryTable()}
            </div>
        </div>
        ${new PlayerList(
    this.players,
    true,
    (player) => setQueryParams({ player_id: player.id + '' }),
    false,
    false,
    null,
    this.team.captain_id || null,
    { sellOfferTeamId: this.team.id }
  )}

        <div class="mt-5">
            <h4>${t('team.transferHistory')}</h4>
            <div class="horizontal-scrollable-table">
                ${this._renderTransferHistoryTable()}
            </div>
        </div>
      </div>
    `
  }

  /**
   * @returns {UIElementEvents}
   */
  get events () {
    return {
      '.stadium-link': {
        click: (event) => {
          event.preventDefault()
          showStadiumModal(this.team.id)
        }
      },
      '(optional) .friendly-match-btn': {
        click: (event) => {
          event.preventDefault()
          this._handleFriendlyMatchClick()
        }
      },
      '(optional) .head-to-head-btn': {
        click: (event) => {
          event.preventDefault()
          this._handleHeadToHeadClick()
        }
      },
      '(optional) .admin-balance-save': {
        click: (event) => {
          event.preventDefault()
          this._handleBalanceSave()
        }
      },
      '(optional) .friend-toggle-btn': {
        click: (event) => {
          event.preventDefault()
          this._handleFriendToggleClick()
        }
      },
      '(optional) .player-link': {
        click: (event) => {
          event.preventDefault()
          const playerId = event.currentTarget.dataset.playerId
          if (playerId) {
            setQueryParams({ player_id: playerId })
          }
        }
      },
      '(optional) .coach-card-link[data-profile-user-id]': {
        click: (event) => {
          event.preventDefault()
          showUserProfileOverlay(Number(event.currentTarget.dataset.profileUserId))
        }
      },
      '(optional) .team-timeline__track': {
        click: (event) => {
          const badge = event.target.closest('.team-timeline__badge[data-game-id]')
          if (!badge) return
          // The badge sits inside the opponent link — stop that navigation.
          event.preventDefault()
          event.stopPropagation()
          void showGameModal(Number(badge.dataset.gameId))
        }
      },
      '(optional) .team-timeline__chevron--left': {
        click: () => this._moveTimeline('left')
      },
      '(optional) .team-timeline__chevron--right': {
        click: () => this._moveTimeline('right')
      },
      '(optional) .transfer-history-pagination': {
        click: (event) => {
          const totalPages = Math.ceil(this._transferHistory.length / TRANSFER_PAGE_SIZE)
          if (event.target.closest('.transfer-prev')) {
            this._setTransferPage(this._transferPage - 1, totalPages)
          } else if (event.target.closest('.transfer-next')) {
            this._setTransferPage(this._transferPage + 1, totalPages)
          } else {
            const pageLink = event.target.closest('[data-page-index]')
            if (pageLink) this._setTransferPage(parseInt(pageLink.dataset.pageIndex, 10), totalPages)
          }
        }
      }
    }
  }

  onMounted () {
    this._onPlayerChanged = () => this.update(true)
    window.addEventListener('player-hired', this._onPlayerChanged)
    window.addEventListener('player-fired', this._onPlayerChanged)
    this._onMyTeamUpdated = () => {
      if (this._isOwnTeam) this.update(true)
    }
    window.addEventListener('my-team-updated', this._onMyTeamUpdated)
    void showTutorialIfNeeded('team', this)
    this._refineTimelineOffsetForViewport()
  }

  /**
   * @param {Object} params
   * @param {string} params.player_id
   * @param {string} params.id
   * @returns {Promise<void>}
   */
  async onQueryChanged ({
    player_id: playerId,
    id
  }) {
    if (playerId) await showPlayerModal(Number(playerId))
    if (!id) return
    if (!this.teamId || this.teamId !== Number(id)) {
      this.teamId = Number(id)
      await this.update(true)
    }
  }

  onDestroy () {
    if (this._onPlayerChanged) {
      window.removeEventListener('player-hired', this._onPlayerChanged)
      window.removeEventListener('player-fired', this._onPlayerChanged)
    }
    if (this._onMyTeamUpdated) {
      window.removeEventListener('my-team-updated', this._onMyTeamUpdated)
    }
  }

  static cacheKeyParams = ['id']
  showLoadingIndicator = true

  /** @type {StadiumType} */
  stadium

  /** @type {boolean} */
  _canPlayFriendly = false
  /** @type {boolean} */
  _isOwnTeam = false
  /** @type {boolean} */
  _isPlayingFriendly = false
  /** @type {boolean} */
  _notViewable = false
  /** @type {boolean} */
  _isFriend = false
  /** @type {boolean} */
  _canBeFriend = false
  /** @type {boolean} */
  _isUpdatingFriend = false
  /** @type {boolean} */
  _isAdmin = false
  /** @type {AdminTeamCards|null} */
  _adminCards = null
  /** @type {Array} */
  _transferHistory = []
  /** @type {number} */
  _transferPage = 0
  /** @type {Array} */
  _seasonHistory = []
  /** @type {Array} */
  _timelineGames = []
  /** @type {boolean} */
  _timelineHasMorePast = true
  /** @type {boolean} */
  _timelineHasMoreFuture = true
  /** @type {boolean} */
  _timelineLoading = false
  /** @type {number} index of the leftmost item visible in the chevron-paged view */
  _timelineOffset = 0

  /**
   * @returns {number}
   * @private
   */
  get _teamStrength () {
    return this.players.filter(p => p.in_game_position).reduce((sum, player) => sum + player.level, 0)
  }

  /**
   * @returns {number}
   * @private
   */
  get _teamFreshness () {
    return this.players.filter(p => p.in_game_position).reduce((sum, player, _, { length }) => sum + player.freshness / length, 0)
  }

  /**
   * @returns {number}
   */
  get _stadiumSize () {
    return this.stadium.south_stand_size + this.stadium.north_stand_size + this.stadium.east_stand_size + this.stadium.west_stand_size +
      (this.stadium.corner_ne_stand_size || 0) + (this.stadium.corner_nw_stand_size || 0) +
      (this.stadium.corner_se_stand_size || 0) + (this.stadium.corner_sw_stand_size || 0)
  }

  /**
   * @returns {string}
   */
  get _stadiumName () {
    return this.stadium?.name || t('stadium.yourStadium')
  }

  /**
   * Render the team info card (left card) with stats table
   * @returns {string}
   * @private
   */
  _renderTeamInfoCard () {
    const realPlayers = this.players.filter(p => !p.fake)
    const totalSalary = realPlayers.reduce((sum, p) => sum + getSalary(p.level), 0)
    const totalStrength = realPlayers.reduce((sum, p) => sum + p.level, 0)
    const avgLevel = realPlayers.length > 0 ? (totalStrength / realPlayers.length).toFixed(1) : 0
    const avgAge = realPlayers.length > 0
      ? (realPlayers.reduce((sum, p) => sum + calculatePlayerAge(p, this._season), 0) / realPlayers.length).toFixed(1)
      : 0
    const teamValue = realPlayers.reduce(
      (sum, p) => sum + calculateMarketValue(p.level, calculatePlayerAge(p, this._season)),
      0
    )

    return `
      <div class="card h-100">
        <div class="card-header text-white gradient-header">
          <h5 class="card-title mb-0">${t('myTeam.teamInfo')}</h5>
        </div>
        <div class="card-body pt-0">
          <table class="table table-sm mb-0 team-info-table">
            <tbody>
              <tr><td class="text-muted ps-3">${t('myTeam.league')}</td><td class="text-end pe-3"><a href="#results?level=${this.team.level}&league=${this.team.league}" class="text-info">${formatLeague(this.team.level, this.team.league)}</a></td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.salaryTotal')}</td><td class="text-end pe-3">${euroFormat.format(totalSalary)}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.teamValue')}</td><td class="text-end pe-3">${euroFormat.format(teamValue)}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.avgAge')}</td><td class="text-end pe-3">${avgAge} ${t('myTeam.years')}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.avgLevel')}</td><td class="text-end pe-3">${avgLevel}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.totalStrength')}</td><td class="text-end pe-3">${totalStrength}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.lineupStrength')}</td><td class="text-end pe-3">${this._teamStrength}</td></tr>
              <tr><td class="text-muted ps-3">${t('team.avgFreshness')}</td><td class="text-end pe-3">${Math.floor(this._teamFreshness * 100)}%</td></tr>
              <tr><td class="text-muted ps-3">${t('stadium.stadiumLabel')}</td><td class="text-end pe-3"><a href="#" class="stadium-link text-info">${this._stadiumName}</a></td></tr>
              <tr><td class="text-muted ps-3">${t('team.stadiumSize')}</td><td class="text-end pe-3">${t('team.seats', { seats: this._stadiumSize })}</td></tr>
              ${this._renderBalanceRow()}
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  /**
   * Admin-only row in the team info card: the team's balance with an inline
   * editor. Non-admins never receive the balance from the server.
   * @returns {string}
   * @private
   */
  _renderBalanceRow () {
    if (!this._isAdmin) return ''
    return `
      <tr>
        <td class="text-muted ps-3">${t('team.adminBalance')}</td>
        <td class="text-end pe-3">
          <div class="input-group input-group-sm admin-balance-group">
            <input type="number" step="1" class="form-control text-end admin-balance-input" value="${this.team.balance ?? 0}">
            <button class="btn btn-outline-info admin-balance-save" title="${t('team.adminBalanceSave')}">
              <i class="fa fa-check" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `
  }

  /**
   * Admin-only action card panel (add / remove single cards of this team).
   * @returns {string}
   * @private
   */
  _renderAdminActionCards () {
    if (!this._isAdmin || !this._adminCards) return ''
    return `${this._adminCards}`
  }

  /**
   * Write the edited balance back to the server (admin only).
   * @returns {Promise<void>}
   * @private
   */
  async _handleBalanceSave () {
    const input = document.querySelector(`${this._elementQuery} .admin-balance-input`)
    const button = document.querySelector(`${this._elementQuery} .admin-balance-save`)
    if (!input) return
    const newBalance = Number(input.value)
    if (!Number.isFinite(newBalance)) {
      toast(t('team.adminBalanceInvalid'), 'error')
      return
    }
    try {
      if (button) button.disabled = true
      const { balance } = await server.adminSetTeamBalance(this.team.id, newBalance)
      this.team.balance = balance
      input.value = balance
      toast(t('team.adminBalanceUpdated'), 'success')
    } catch (e) {
      console.error('Error updating team balance:', e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    } finally {
      if (button) button.disabled = false
    }
  }

  /**
   * Render the coach (trainer) card with avatar and info
   * @returns {string}
   * @private
   */
  _renderCoachCard () {
    const username = this.user?.username
    const coachName = username ?? `N/A <i class="fa fa-user-secret" aria-hidden="true"></i>`
    const altText = username ?? 'N/A'
    const coachSinceDate = this.team.coach_since ?? this.user?.created_at
    const coachSince = coachSinceDate ? formatDate('DD.MM.YYYY', coachSinceDate) : '-'
    const avatarFilename = this.user?.avatar
    const avatarImg = avatarFilename
      ? `<img class="coach-avatar__img" src="${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatarFilename}" alt="${altText}">`
      : `<img class="coach-avatar__img coach-avatar__img--default" src="./assets/avatar-placeholder.svg" alt="${altText}">`

    const userId = this.user?.id
    const body = `
      <div class="coach-avatar mb-3">
        ${avatarImg}
      </div>
      <div class="coach-info text-center">
        <div class="coach-info__name fw-semibold">${coachName}</div>
        <div class="coach-info__since text-muted small">${t('myTeam.coachSince')}: ${coachSince}</div>
      </div>
    `
    // The whole card opens the manager's profile as an overlay, so the reader
    // keeps their place on the team page (#532). The href stays so the card is
    // still a real link (middle-click, "open in new tab", screen readers).
    const cardBody = userId
      ? `<a href="#user?id=${userId}" data-profile-user-id="${userId}" class="card-body coach-card-link text-decoration-none">${body}</a>`
      : `<div class="card-body">${body}</div>`

    return `
      <div class="card h-100">
        <div class="card-header text-white gradient-header">
          <h5 class="card-title mb-0">${t('myTeam.coach')}</h5>
        </div>
        ${cardBody}
      </div>
    `
  }

  /**
   * Render the friendly match button if applicable
   * @returns {string}
   * @private
   */
  _renderFriendlyMatchButton () {
    // Don't show for own team
    if (this._isOwnTeam) return ''

    const friendlyDisabled = !this._canPlayFriendly || this._isPlayingFriendly
    const friendlyText = this._isPlayingFriendly
      ? '<i class="fa fa-spinner fa-spin"></i>'
      : `<i class="fa fa-futbol-o"></i> ${t('team.playFriendly')}`
    const friendlyTitle = !this._canPlayFriendly ? t('team.friendlyPlayed') : ''

    return `
      <div class="mb-4 text-center d-flex flex-wrap justify-content-center u-gap-sm">
        <button class="btn btn-outline-info friendly-match-btn" ${friendlyDisabled ? 'disabled' : ''} title="${friendlyTitle}">
          ${friendlyText}
        </button>
        <button class="btn btn-outline-info head-to-head-btn">
          <i class="fa fa-balance-scale"></i> ${t('headToHead.cta')}
        </button>
        ${this._renderFriendToggleButton()}
      </div>
    `
  }

  /**
   * Render the "add/remove friend" button if applicable
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
      <button class="btn ${cls} friend-toggle-btn" ${disabled ? 'disabled' : ''}>
        ${inner}
      </button>
    `
  }

  /**
   * Handle click on friendly match button
   * @returns {Promise<void>}
   * @private
   */
  async _handleFriendlyMatchClick () {
    if (this._isPlayingFriendly || !this._canPlayFriendly) return

    // Show confirmation dialog
    const { ok } = await showDialog({
      title: t('friendly.confirmTitle'),
      text: t('friendly.confirmText', { teamName: this.team.name }),
      buttonText: t('friendly.confirmBtn'),
      buttonType: 'info'
    })

    if (!ok) return

    try {
      this._isPlayingFriendly = true
      await this.update()

      const result = await server.playFriendlyMatch(this.team.id)
      const game = result.game

      toast(t('friendly.result', {
        goals1: game.goalsTeam1,
        goals2: game.goalsTeam2
      }), 'success')

      // Update state and show game details
      this._canPlayFriendly = false
      this._isPlayingFriendly = false
      await this.update()

      // Show the game modal
      await showGameModal(game.id)
    } catch (e) {
      console.error('Error playing friendly match:', e)
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
      this._isPlayingFriendly = false
      await this.update()
    }
  }

  /**
   * Open the head-to-head overlay comparing my team against this one.
   * @returns {Promise<void>}
   * @private
   */
  async _handleHeadToHeadClick () {
    try {
      const my = await server.getMyTeam()
      if (!my?.team?.id || my.team.id === this.team.id) return
      await showHeadToHeadOverlay(my.team.id, this.team.id)
    } catch (e) {
      toast(e.message ?? t('toast.somethingWentWrong'), 'error')
    }
  }

  /**
   * Handle click on the friend toggle button (add/remove friend)
   * @returns {Promise<void>}
   * @private
   */
  async _handleFriendToggleClick () {
    if (this._isUpdatingFriend || !this._canBeFriend || !this.user?.id) return
    try {
      this._isUpdatingFriend = true
      await this.update()
      if (this._isFriend) {
        await server.removeFriend(this.user.id)
        this._isFriend = false
        toast(t('team.friendRemoved'), 'success')
      } else {
        await server.addFriend(this.user.id)
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

  /**
   * Render the transfer history table with pagination
   * @returns {string}
   * @private
   */
  _renderTransferHistoryTable () {
    if (this._transferHistory.length === 0) {
      return `<p class="text-muted">${t('team.noTransferHistory')}</p>`
    }

    const start = this._transferPage * TRANSFER_PAGE_SIZE
    const pageData = this._transferHistory.slice(start, start + TRANSFER_PAGE_SIZE)

    const table = new Table({
      cols: [
        {
          name: t('team.historyPlayer'),
          align: 'left'
        },
        {
          name: t('team.historyPosition'),
          align: 'center'
        },
        {
          name: t('team.historyFrom'),
          align: 'left'
        },
        {
          name: t('team.historyTo'),
          align: 'left'
        },
        {
          name: t('team.historyPrice'),
          align: 'right'
        },
        {
          name: t('team.historySeason'),
          align: 'center'
        }
      ],
      data: pageData,
      renderRow: (transfer) => {
        let fromTeamHtml
        let toTeamHtml
        if (transfer.type === 'hired') {
          fromTeamHtml = `<span class="text-muted">${t('player.freePlayer')}</span>`
          toTeamHtml = transfer.toTeam
            ? `<a href="#team?id=${transfer.toTeamId}" class="text-info">${this._renderSmallEmblem(transfer.toTeam)} ${transfer.toTeamName}</a>`
            : '-'
        } else if (transfer.type === 'fired') {
          fromTeamHtml = transfer.fromTeam
            ? `<a href="#team?id=${transfer.fromTeamId}" class="text-info">${this._renderSmallEmblem(transfer.fromTeam)} ${transfer.fromTeamName}</a>`
            : '-'
          toTeamHtml = `<span class="text-muted">${t('team.historyFired')}</span>`
        } else {
          fromTeamHtml = transfer.fromTeam
            ? `<a href="#team?id=${transfer.fromTeamId}" class="text-info">${this._renderSmallEmblem(transfer.fromTeam)} ${transfer.fromTeamName}</a>`
            : '-'
          toTeamHtml = transfer.toTeam
            ? `<a href="#team?id=${transfer.toTeamId}" class="text-info">${this._renderSmallEmblem(transfer.toTeam)} ${transfer.toTeamName}</a>`
            : '-'
        }

        return [
          `<a href="#team?id=${this.team.id}&player_id=${transfer.playerId}" class="text-info">${transfer.playerName}</a>`,
          renderPositionBadge(transfer.playerPosition),
          fromTeamHtml,
          toTeamHtml,
          transfer.price ? euroFormat.format(transfer.price) : '-',
          `${t('finances.season', { season: transfer.season + 1 })}, ${t('results.gameDay', { day: transfer.gameDay + 1 })}`
        ]
      }
    })

    return table.toString() + this._renderTransferPagination()
  }

  /**
   * @returns {string}
   * @private
   */
  _renderTransferPagination () {
    const totalPages = Math.ceil(this._transferHistory.length / TRANSFER_PAGE_SIZE)
    if (totalPages <= 1) return ''

    const hasPrev = this._transferPage > 0
    const hasNext = this._transferPage < totalPages - 1

    return `
      <div class="transfer-history-pagination">
        <nav class="mt-3">
          <ul class="pagination pagination-sm justify-content-center flex-wrap">
            <li class="page-item ${hasPrev ? '' : 'disabled'}">
              <span class="page-link transfer-prev u-cursor-pointer">${t('common.prev')}</span>
            </li>
            ${renderPageNumbers(totalPages, this._transferPage)}
            <li class="page-item ${hasNext ? '' : 'disabled'}">
              <span class="page-link transfer-next u-cursor-pointer">${t('common.next')}</span>
            </li>
          </ul>
        </nav>
      </div>
    `
  }

  /**
   * @param {number} page
   * @param {number} totalPages
   * @private
   */
  _setTransferPage (page, totalPages) {
    if (page < 0 || page >= totalPages) return
    this._transferPage = page
    this.update()
  }

  /**
   * Render the season history table
   * @returns {string}
   * @private
   */
  _renderSeasonHistoryTable () {
    if (this._seasonHistory.length === 0) {
      return `<p class="text-muted">${t('team.noSeasonHistory')}</p>`
    }

    const table = new Table({
      cols: [
        {
          name: t('team.historySeason'),
          align: 'center'
        },
        {
          name: t('team.historyLeague'),
          align: 'left'
        },
        {
          name: t('team.historyPosition'),
          align: 'center'
        },
        {
          name: t('team.historyPoints'),
          align: 'center'
        },
        {
          name: t('team.historyCup'),
          align: 'center'
        }
      ],
      data: this._seasonHistory,
      renderRow: (season) => {
        const positionClass = season.position === 1 ? 'text-warning fw-bold' : (season.position <= 2 ? 'text-success' : '')
        const cupHtml = this._formatCupResult(season.cupResult)

        return [
          `S${season.season + 1}`,
          `<a href="#results?level=${season.level}&league=${season.league}&season=${season.season}&game_day=33" class="text-info">${formatLeague(season.level, season.league)}</a>`,
          `<span class="${positionClass}">${season.position === 1 ? '<i class="fa fa-diamond"></i> ' : ''}${season.position}.</span>`,
          `${season.points}`,
          cupHtml
        ]
      }
    })

    return table.toString()
  }

  /**
   * Format cup result for display
   * @param {Object|null} cupResult
   * @returns {string}
   * @private
   */
  _formatCupResult (cupResult) {
    if (!cupResult) {
      return '-'
    }

    if (cupResult.isWinner) {
      return `<span class="text-warning"><i class="fa fa-trophy"></i> ${t('cup.winner')}</span>`
    }

    return formatCupRound(cupResult.roundReached, cupResult.totalRounds)
  }

  /**
   * Render a small emblem for inline display
   * @param {Object} team
   * @returns {string}
   * @private
   */
  _renderSmallEmblem (team) {
    return renderEmblem(team, 20)
  }

  /**
   * @returns {string}
   * @private
   */
  _renderTimeline () {
    if (!this._timelineGames || this._timelineGames.length === 0) {
      return `<div class="team-timeline"><div class="team-timeline__empty">${t('team.timelineNoGames')}</div></div>`
    }
    this._timelineCurrentMarked = false
    const visibleCount = this._getTimelineVisibleCount()
    const maxOffset = Math.max(0, this._timelineGames.length - visibleCount)
    const canLeft = this._timelineOffset > 0 || this._timelineHasMorePast
    const canRight = this._timelineOffset < maxOffset || this._timelineHasMoreFuture
    const shiftPx = this._timelineOffset * TIMELINE_ITEM_WIDTH
    return `
      <div class="team-timeline">
        <button type="button" class="team-timeline__chevron team-timeline__chevron--left" aria-label="${t('common.prev')}" ${canLeft ? '' : 'disabled'}>
          <i class="fa fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="team-timeline__viewport">
          <div class="team-timeline__track" style="transform: translateX(-${shiftPx}px)">
            ${this._timelineGames.map(game => this._renderTimelineItem(game)).join('')}
          </div>
        </div>
        <button type="button" class="team-timeline__chevron team-timeline__chevron--right" aria-label="${t('common.next')}" ${canRight ? '' : 'disabled'}>
          <i class="fa fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `
  }

  /**
   * @param {Object} game
   * @returns {string}
   * @private
   */
  _renderTimelineItem (game) {
    const opp = game.opponent
    const classes = ['team-timeline__item']
    if (!game.played) classes.push('team-timeline__item--future')
    if (game.gameType === 'cup') classes.push('team-timeline__item--cup')

    let badgeHtml
    if (game.played) {
      const resultClass = `team-timeline__badge--${game.result === 'win' ? 'win' : game.result === 'loss' ? 'loss' : 'draw'}`
      const resultText = game.result === 'win' ? t('team.resultWin') : game.result === 'loss' ? t('team.resultLoss') : t('team.resultDraw')
      // The badge opens the match itself rather than the opponent's page
      // (#477); the emblem around it still links to the opponent.
      badgeHtml = `<div class="team-timeline__badge ${resultClass} team-timeline__badge--clickable"
                        data-game-id="${game.id}" role="button" tabindex="0"
                        title="${t('team.timelineOpenGame')}">${resultText}</div>`
    } else {
      badgeHtml = `<div class="team-timeline__badge team-timeline__badge--upcoming">·</div>`
    }

    const titleParts = []
    titleParts.push(opp.name)
    titleParts.push(game.isHome ? t('team.timelineHome') : t('team.timelineAway'))
    titleParts.push(`${t('finances.season', { season: game.season + 1 })}, ${t('results.gameDay', { day: game.gameDay + 1 })}`)
    if (game.played) {
      const own = game.isHome ? game.goalsTeam1 : game.goalsTeam2
      const opps = game.isHome ? game.goalsTeam2 : game.goalsTeam1
      titleParts.push(`${own}:${opps}`)
    }
    const title = titleParts.join(' • ')

    const emblemMarkup = `<div class="team-timeline__emblem-wrapper">${renderEmblem(opp, 66)}</div>`
    const inner = `${emblemMarkup}${badgeHtml}`

    const dataAttr = !game.played && !this._timelineCurrentMarked ? 'data-timeline-current="1"' : ''
    if (!game.played) this._timelineCurrentMarked = true
    if (opp.isSystemTeam) {
      return `<span class="${classes.join(' ')}" title="${title}" ${dataAttr}>${inner}</span>`
    }
    return `<a href="#team?id=${opp.id}" class="${classes.join(' ')}" title="${title}" ${dataAttr}>${inner}</a>`
  }

  /**
   * Pick the initial offset so that the first upcoming game (or the latest
   * past game when nothing is scheduled) sits inside the visible window.
   * Called from `load()` with the fallback visible count, and re-run from
   * `onMounted()` once the real viewport width is known.
   * @param {number} visibleCount
   * @returns {number}
   * @private
   */
  _computeInitialTimelineOffset (visibleCount) {
    if (this._timelineGames.length === 0) return 0
    const currentIdx = this._timelineGames.findIndex(g => !g.played)
    const target = currentIdx >= 0 ? currentIdx : this._timelineGames.length - 1
    const desired = target - Math.floor(visibleCount / 2)
    const maxOffset = Math.max(0, this._timelineGames.length - visibleCount)
    return Math.max(0, Math.min(maxOffset, desired))
  }

  /**
   * Number of timeline items that fit inside the viewport. Reads from the DOM
   * so it returns the rendered layout; falls back to a sensible default before
   * the first paint.
   * @returns {number}
   * @private
   */
  _getTimelineVisibleCount () {
    const viewport = document.querySelector(`${this._elementQuery} .team-timeline__viewport`)
    if (!viewport || !viewport.clientWidth) return TIMELINE_VISIBLE_FALLBACK
    return Math.max(1, Math.floor(viewport.clientWidth / TIMELINE_ITEM_WIDTH))
  }

  /**
   * After the first mount we know the real viewport width — recompute the
   * offset so the current game ends up centered instead of stuck at the
   * fallback position from `load()`.
   * @private
   */
  _refineTimelineOffsetForViewport () {
    if (this._timelineGames.length === 0) return
    const offset = this._computeInitialTimelineOffset(this._getTimelineVisibleCount())
    if (offset === this._timelineOffset) return
    this._timelineOffset = offset
    this.update()
  }

  /**
   * Shift the visible window by one chevron step. Loads more games on demand
   * when running off either end, then animates via the inline `translateX`
   * applied in `_renderTimeline`.
   * @param {'left'|'right'} direction
   * @returns {Promise<void>}
   * @private
   */
  async _moveTimeline (direction) {
    if (this._timelineLoading) return
    const visibleCount = this._getTimelineVisibleCount()

    if (direction === 'right') {
      const maxOffset = Math.max(0, this._timelineGames.length - visibleCount)
      if (this._timelineOffset >= maxOffset) {
        if (!this._timelineHasMoreFuture) return
        await this._loadMoreTimelineGames('future')
      }
      const newMaxOffset = Math.max(0, this._timelineGames.length - visibleCount)
      this._timelineOffset = Math.min(newMaxOffset, this._timelineOffset + TIMELINE_STEP)
    } else {
      if (this._timelineOffset <= 0) {
        if (!this._timelineHasMorePast) return
        const before = this._timelineGames.length
        await this._loadMoreTimelineGames('past')
        // Newly prepended games push our current view to the right — adjust
        // the offset so the items currently on screen stay put.
        this._timelineOffset += this._timelineGames.length - before
      }
      this._timelineOffset = Math.max(0, this._timelineOffset - TIMELINE_STEP)
    }

    await this.update()
  }

  /**
   * Fetch one page of games at the given end of the timeline and append/prepend
   * them to `_timelineGames`. Pure state mutation — the caller re-renders.
   * @param {'past'|'future'} direction
   * @returns {Promise<void>}
   * @private
   */
  async _loadMoreTimelineGames (direction) {
    if (this._timelineLoading) return
    if (this._timelineGames.length === 0) return
    this._timelineLoading = true
    try {
      const cursor = direction === 'past' ? this._timelineGames[0] : this._timelineGames[this._timelineGames.length - 1]
      const response = await server.getTeamTimelineGames(
        this.team.id,
        direction,
        cursor.season,
        cursor.gameDay,
        TIMELINE_PAGE_SIZE
      )
      const newGames = response.games || []
      if (newGames.length === 0) {
        if (direction === 'past') {
          this._timelineHasMorePast = false
        } else {
          this._timelineHasMoreFuture = false
        }
        return
      }
      if (newGames.length < TIMELINE_PAGE_SIZE) {
        if (direction === 'past') {
          this._timelineHasMorePast = false
        } else {
          this._timelineHasMoreFuture = false
        }
      }
      if (direction === 'past') {
        this._timelineGames = [...newGames, ...this._timelineGames]
      } else {
        this._timelineGames = [...this._timelineGames, ...newGames]
      }
    } catch (e) {
      console.error('Error loading timeline games:', e)
    } finally {
      this._timelineLoading = false
    }
  }
}
