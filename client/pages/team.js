import { server } from '../lib/gateway.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { PlayerList } from '../partials/playerList.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { renderEmblem } from '../partials/emblem.js'
import { UIElement } from '../lib/UIElement.js'
import { formatCupRound, formatLeague } from '../util/league.js'
import { showStadiumModal } from '../partials/stadiumModal.js'
import { euroFormat } from '../lib/currency.js'
import { t } from '../i18n/index.js'
import { toast } from '../partials/toast.js'
import { showGameModal } from '../partials/gameModal.js'
import { showTutorialIfNeeded } from '../partials/tutorialOverlay.js'
import { showDialog } from '../partials/dialog.js'
import { Table } from '../partials/table.js'
import { renderPositionBadge } from '../partials/positionBadge.js'
import { renderPageNumbers } from '../partials/pagination.js'
import { formatDate } from '../lib/date.js'
import { calculateMarketValue, calculatePlayerAge, getSalary } from '../util/player.js'

const TRANSFER_PAGE_SIZE = 10
const TIMELINE_PAGE_SIZE = 12
const TIMELINE_SCROLL_THRESHOLD_PX = 120

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
      user
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
            <div class="card h-100 border-0">
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
    this.team.captain_id || null
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
      '(optional) .player-link': {
        click: (event) => {
          event.preventDefault()
          const playerId = event.currentTarget.dataset.playerId
          if (playerId) {
            setQueryParams({ player_id: playerId })
          }
        }
      },
      '(optional) .team-timeline': {
        scroll: (event) => this._handleTimelineScroll(event)
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
    void showTutorialIfNeeded('team', this)
    this._centerTimelineOnCurrent()
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
    return this.stadium.south_stand_size + this.stadium.north_stand_size + this.stadium.east_stand_size + this.stadium.west_stand_size
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
      <div class="card h-100 border-0">
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
              <tr><td class="text-muted ps-3">${t('team.stadiumSize')}</td><td class="text-end pe-3"><a href="#" class="stadium-link text-info">${t('team.seats', { seats: this._stadiumSize })}</a></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `
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
    const coachSince = this.team.created_at ? formatDate('DD.MM.YYYY', this.team.created_at) : '-'
    const avatarFilename = this.user?.avatar
    const avatarImg = avatarFilename
      ? `<img class="coach-avatar__img" src="${window.__NATIVE_SERVER_URL || ''}/uploads/avatars/${avatarFilename}" alt="${altText}">`
      : `<img class="coach-avatar__img coach-avatar__img--default" src="./assets/avatar-placeholder.svg" alt="${altText}">`

    return `
      <div class="card h-100 border-0">
        <div class="card-header text-white gradient-header">
          <h5 class="card-title mb-0">${t('myTeam.coach')}</h5>
        </div>
        <div class="card-body">
          <div class="coach-avatar mb-3">
            ${avatarImg}
          </div>
          <table class="table table-sm mb-0 team-info-table">
            <tbody>
              <tr><td class="text-muted ps-3">${t('myTeam.coach')}</td><td class="text-end pe-3">${coachName}</td></tr>
              <tr><td class="text-muted ps-3">${t('myTeam.coachSince')}</td><td class="text-end pe-3">${coachSince}</td></tr>
            </tbody>
          </table>
        </div>
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

    const buttonDisabled = !this._canPlayFriendly || this._isPlayingFriendly
    const buttonText = this._isPlayingFriendly
      ? '<i class="fa fa-spinner fa-spin"></i>'
      : `<i class="fa fa-futbol-o"></i> ${t('team.playFriendly')}`
    const buttonTitle = !this._canPlayFriendly ? t('team.friendlyPlayed') : ''

    return `
      <div class="mb-4 text-center">
        <button class="btn btn-outline-info friendly-match-btn" ${buttonDisabled ? 'disabled' : ''} title="${buttonTitle}">
          ${buttonText}
        </button>
      </div>
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
    return `
      <div class="team-timeline">
        <div class="team-timeline__track">
          ${this._timelineHasMorePast ? `<div class="team-timeline__loader team-timeline__loader--past"><i class="fa fa-spinner fa-spin"></i></div>` : ''}
          ${this._timelineGames.map(game => this._renderTimelineItem(game)).join('')}
          ${this._timelineHasMoreFuture ? `<div class="team-timeline__loader team-timeline__loader--future"><i class="fa fa-spinner fa-spin"></i></div>` : ''}
        </div>
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
      badgeHtml = `<div class="team-timeline__badge ${resultClass}">${resultText}</div>`
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

    const emblemMarkup = `<div class="team-timeline__emblem-wrapper">${renderEmblem(opp, 44)}</div>`
    const inner = `${emblemMarkup}${badgeHtml}`

    const dataAttr = !game.played && !this._timelineCurrentMarked ? 'data-timeline-current="1"' : ''
    if (!game.played) this._timelineCurrentMarked = true
    if (opp.isSystemTeam) {
      return `<span class="${classes.join(' ')}" title="${title}" ${dataAttr}>${inner}</span>`
    }
    return `<a href="#team?id=${opp.id}" class="${classes.join(' ')}" title="${title}" ${dataAttr}>${inner}</a>`
  }

  /**
   * Scroll the timeline so the first upcoming game (or the rightmost past game)
   * is centered on initial render.
   * @private
   */
  _centerTimelineOnCurrent () {
    const scrollEl = document.querySelector(`${this._elementQuery} .team-timeline`)
    if (!scrollEl) return
    const currentEl = scrollEl.querySelector('[data-timeline-current="1"]')
    if (currentEl) {
      const offset = currentEl.offsetLeft - (scrollEl.clientWidth / 2) + (currentEl.offsetWidth / 2)
      scrollEl.scrollLeft = Math.max(0, offset)
    } else {
      // No future games — scroll to end (latest past)
      scrollEl.scrollLeft = scrollEl.scrollWidth
    }
  }

  /**
   * Handle timeline scroll — load older games when scrolled near left, newer when near right.
   * @param {Event} event
   * @returns {Promise<void>}
   * @private
   */
  async _handleTimelineScroll (event) {
    if (this._timelineLoading) return
    const el = event.currentTarget
    if (!el) return
    const nearLeft = el.scrollLeft <= TIMELINE_SCROLL_THRESHOLD_PX
    const nearRight = (el.scrollWidth - el.clientWidth - el.scrollLeft) <= TIMELINE_SCROLL_THRESHOLD_PX
    if (nearLeft && this._timelineHasMorePast) {
      await this._loadMoreTimelineGames('past')
    } else if (nearRight && this._timelineHasMoreFuture) {
      await this._loadMoreTimelineGames('future')
    }
  }

  /**
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
      const scrollEl = document.querySelector(`${this._elementQuery} .team-timeline`)
      const prevScrollWidth = scrollEl?.scrollWidth ?? 0
      const prevScrollLeft = scrollEl?.scrollLeft ?? 0
      const response = await server.getTeamTimelineGames(
        this.team.id,
        direction,
        cursor.season,
        cursor.gameDay,
        TIMELINE_PAGE_SIZE
      )
      const newGames = response.games || []
      if (newGames.length === 0) {
        if (direction === 'past') this._timelineHasMorePast = false
        else this._timelineHasMoreFuture = false
      } else {
        if (newGames.length < TIMELINE_PAGE_SIZE) {
          if (direction === 'past') this._timelineHasMorePast = false
          else this._timelineHasMoreFuture = false
        }
        if (direction === 'past') {
          this._timelineGames = [...newGames, ...this._timelineGames]
        } else {
          this._timelineGames = [...this._timelineGames, ...newGames]
        }
      }
      await this.update()
      const newScrollEl = document.querySelector(`${this._elementQuery} .team-timeline`)
      if (newScrollEl) {
        if (direction === 'past') {
          newScrollEl.scrollLeft = prevScrollLeft + (newScrollEl.scrollWidth - prevScrollWidth)
        } else {
          newScrollEl.scrollLeft = prevScrollLeft
        }
      }
    } catch (e) {
      console.error('Error loading timeline games:', e)
    } finally {
      this._timelineLoading = false
    }
  }
}
