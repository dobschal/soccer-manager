import { server } from '../lib/gateway.js'
import { goTo, setQueryParams } from '../lib/router.js'
import { PlayerList } from '../partials/playerList.js'
import { showPlayerModal } from '../partials/playerModal.js'
import { renderEmblem } from '../partials/emblem.js'
import { renderPlayerImage } from '../partials/playerImage.js'
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
import { showOverlay } from '../partials/overlay.js'
import { generateId } from '../lib/html.js'
import { renderPositionBadge } from '../partials/positionBadge.js'
import { renderPageNumbers } from '../partials/pagination.js'

const TRANSFER_PAGE_SIZE = 10

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

    const [stadium, teamValue, myTeam, friendlyStatus, transferHistory, seasonHistory, recordResults] = await Promise.all([
      server.getStadiumByTeamId(this.team.id),
      server.getTeamValue(this.team.id),
      server.getMyTeam(),
      server.canPlayFriendlyToday(),
      server.getTeamTransferHistory(this.team.id),
      server.getTeamSeasonHistory(this.team.id),
      server.getTeamRecordResults(this.team.id)
    ])
    this.stadium = stadium
    this._teamValue = teamValue.value
    this._isOwnTeam = myTeam.team.id === this.team.id
    this._canPlayFriendly = friendlyStatus.canPlay && !this._isOwnTeam
    this._transferHistory = transferHistory.transfers || []
    this._seasonHistory = seasonHistory.seasons || []
    this._highestWin = recordResults.highestWin
    this._highestLoss = recordResults.highestLoss

    // Render best player image
    const bestPlayer = this._bestPlayer
    if (bestPlayer) {
      const isCaptain = bestPlayer.id === this.team.captain_id
      this._bestPlayerImage = await renderPlayerImage(bestPlayer, this.team, 150, { isCaptain })
    }
  }
  /**
   * @returns {string}
   */
  get template () {
    if (this._notViewable) return '<div></div>'
    const bestPlayer = this._bestPlayer
    return `
      <div>        
        <div class="row mb-4 align-items-center">
          <div class="col-12 col-md-4 text-center mb-3 mb-md-0">
            ${renderEmblem(this.team, 200)}
          </div>
          <div class="col-12 col-md-4 text-center mb-3 mb-md-0">
            <h2>${this.team.name}</h2>
            <p class="mb-0">
              <b>${t('team.leagueLabel')}</b>: <a href="#results?level=${this.team.level}&league=${this.team.league}" class="text-info">${formatLeague(this.team.level, this.team.league)}</a><br>
              <b>${t('team.teamValue')}</b>: ${euroFormat.format(this._teamValue)}<br>
              <b>${t('team.lineupStrength')}</b>: ${this._teamStrength}<br>
              <b>${t('team.avgFreshness')}</b>: ${Math.floor(this._teamFreshness * 100)}%<br>
              <b>${t('team.trainer')}</b>: ${this._username}<br>
              <b>${t('team.stadiumSize')}</b>: <a href="#" class="stadium-link text-info">${t('team.seats', { seats: this._stadiumSize })}</a>
            </p>
            ${this._renderFriendlyMatchButton()}
          </div>
          <div class="col-12 col-md-4 text-center">
            ${bestPlayer ? `
              <div class="best-player-link u-cursor-pointer" data-player-id="${bestPlayer.id}">
                <div class="mb-2 d-inline-block">${this._bestPlayerImage}</div>
                <div class="clearfix">
                  <div class="text-muted small">${t('team.bestPlayer')}</div>
                  <div><strong>${bestPlayer.name}</strong></div>
                  <div class="text-info">${t('team.levelLabel', { level: bestPlayer.level })}</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
        ${this._renderDescription()}
        ${this._renderRecordResults()}
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
      '.best-player-link': {
        click: (event) => {
          const playerId = event.currentTarget.dataset.playerId
          if (playerId) {
            setQueryParams({ player_id: playerId })
          }
        }
      },
      '(optional) .friendly-match-btn': {
        click: (event) => {
          event.preventDefault()
          this._handleFriendlyMatchClick()
        }
      },
      '(optional) .edit-description-btn': {
        click: (event) => {
          event.preventDefault()
          this._showDescriptionEditor()
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
  showLoadingIndicator = true

  /** @type {StadiumType} */
  stadium

  /** @type {string} */
  _bestPlayerImage = ''

  /** @type {number} */
  _teamValue = 0
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
  /** @type {Object|null} */
  _highestWin = null
  /** @type {Object|null} */
  _highestLoss = null

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
   * @returns {string}
   */
  get _username () {
    return this.user?.username ?? 'N/A <i class="fa fa-user-secret" aria-hidden="true"></i>'
  }

  /**
   * @returns {number}
   */
  get _stadiumSize () {
    return this.stadium.south_stand_size + this.stadium.north_stand_size + this.stadium.east_stand_size + this.stadium.west_stand_size
  }

  /**
   * @returns {PlayerType|null}
   * @private
   */
  get _bestPlayer () {
    if (!this.players || this.players.length === 0) return null
    return this.players.reduce((best, player) => {
      if (!best || player.level > best.level) return player
      return best
    }, null)
  }

  /**
   * Render the team description section
   * @returns {string}
   * @private
   */
  _renderDescription () {
    const defaultText = t('team.defaultDescription', { teamName: this.team.name })
    const displayHtml = this.team.description || defaultText

    const editBtn = this._isOwnTeam
      ? ` <button class="btn btn-sm btn-outline-secondary edit-description-btn"><i class="fa fa-pencil"></i> ${t('team.editDescription')}</button>`
      : ''

    return `
      <div class="mb-4">
        <span class="team-description-content">${displayHtml}</span>${editBtn}
      </div>
    `
  }

  /**
   * Show the rich text description editor overlay
   * @private
   */
  _showDescriptionEditor () {
    const editorId = generateId()
    const saveBtnId = generateId()

    const defaultText = t('team.defaultDescription', { teamName: this.team.name })
    const currentContent = this.team.description || defaultText

    const content = `
      <div class="d-flex gap-1 flex-wrap mb-2">
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="bold"><i class="fa fa-bold"></i></button>
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="italic"><i class="fa fa-italic"></i></button>
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="underline"><i class="fa fa-underline"></i></button>
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="strikeThrough"><i class="fa fa-strikethrough"></i></button>
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="insertUnorderedList"><i class="fa fa-list-ul"></i></button>
        <button class="btn btn-sm btn-outline-secondary desc-fmt-btn" data-cmd="insertOrderedList"><i class="fa fa-list-ol"></i></button>
      </div>
      <div id="${editorId}" class="description-editor" contenteditable="true">${currentContent}</div>
      <button id="${saveBtnId}" class="btn btn-primary w-100 mt-3 mb-3">${t('common.save')}</button>
    `

    const overlay = showOverlay(t('team.editDescription'), '', content)

    setTimeout(() => {
      document.querySelectorAll('.desc-fmt-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          document.execCommand(btn.dataset.cmd, false, null)
        })
      })

      const saveBtn = document.getElementById(saveBtnId)
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const editorEl = document.getElementById(editorId)
          if (!editorEl) return
          const html = editorEl.innerHTML
          try {
            await server.updateTeamDescription(html)
            this.team.description = html
            toast(t('team.descriptionSaved'), 'success')
            overlay.remove()
            await this.update()
          } catch (e) {
            toast(e.message ?? t('toast.somethingWentWrong'), 'error')
          }
        })
      }
    })
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
      <div class="mb-4 mt-4">
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
   * Render the record results (highest win and highest loss)
   * @returns {string}
   * @private
   */
  _renderRecordResults () {
    if (!this._highestWin && !this._highestLoss) return ''

    const renderCard = (record, label, emoji, bgClass) => {
      if (!record) return ''
      const emblem = this._renderSmallEmblem(record.opponent)
      return `
        <div class="col-12 col-md-6 mb-3">
          <div class="card text-dark ${bgClass}">
            <div class="card-body d-flex align-items-center">
              <span style="font-size: 2.5rem" class="me-3">${emoji}</span>
              <div>
                <h5 class="card-title mb-1">${label} - ${record.ownGoals}:${record.oppGoals}</h5>
                <div>
                    ${t('team.recordVs')} <a href="#team?id=${record.opponentId}" class="text-dark text-decoration-underline">${emblem} ${record.opponentName}</a>
                    </div>
                <small>S${record.season + 1} ${t('team.recordGameDay')} ${record.gameDay + 1}</small>
              </div>
            </div>
          </div>
        </div>`
    }

    return `
      <div class="row mb-4">
        ${renderCard(this._highestWin, t('team.highestWin'), '🚀', 'bg-info-subtle')}
        ${renderCard(this._highestLoss, t('team.highestLoss'), '👎', 'bg-warning-subtle')}
      </div>
    `
  }
}
