import { UIElement } from '../lib/UIElement.js'
import { server } from '../lib/gateway.js'
import { toast } from './toast.js'
import { t } from '../i18n/index.js'
import { generateId } from '../lib/html.js'
import { flagUrl } from '../util/worldCup.js'
import { ProgressBar } from './progressBar.js'

const PAGE_SIZE = 6
const COLLAPSE_STORAGE_KEY = 'worldCupBettingCollapsed'

/**
 * Dashboard widget: WM 2026 betting card.
 *
 * Shows a chronological page of 6 games (page 1 defaults to the page that
 * contains the next upcoming kickoff), per-game bet buttons, the user's own
 * point total, a top-10 leaderboard, a progress bar toward the next action
 * card reward, and a collapse toggle that persists locally.
 */
export class WorldCupBetting extends UIElement {
  async load () {
    // Pull total + leaderboard so we can pick the starting page and show the
    // header badge even when the card is collapsed.
    const total = await this._fetchTotalAndLeaderboard()
    this._totalGames = total
    if (this._isCollapsed) return
    if (this._page === null) {
      this._page = await this._findInitialPage()
    }
    await this._loadPage()
  }

  get template () {
    const isCollapsed = this._isCollapsed
    const totalPages = Math.max(1, Math.ceil(this._totalGames / PAGE_SIZE))
    return `
      <div class="card card-body mb-2 bg-dark text-white wc-betting ${isCollapsed ? 'wc-betting--collapsed' : ''}">
        <div class="d-flex justify-content-between align-items-center ${isCollapsed ? '' : 'mb-2'}">
          <h5 class="mb-0">
            <i class="fa fa-globe"></i> ${t('worldCup.title')}
            ${this._leaderboard?.myPoints != null ? `<span class="badge bg-warning text-dark ms-2">${t('worldCup.myPoints', { count: this._leaderboard.myPoints })}</span>` : ''}
          </h5>
          <button id="${this._collapseBtnId}" type="button" class="btn btn-sm btn-outline-light">
            <i class="fa ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
            ${isCollapsed ? t('worldCup.expand') : t('worldCup.collapse')}
          </button>
        </div>
        ${isCollapsed ? '' : this._renderBody(totalPages)}
      </div>
    `
  }

  get events () {
    return {
      [`#${this._collapseBtnId}`]: { click: () => this._toggleCollapse() },
      [`(optional)#${this._prevBtnId}`]: { click: () => this._goToPage(this._page - 1) },
      [`(optional)#${this._nextBtnId}`]: { click: () => this._goToPage(this._page + 1) },
      [`(optional)#${this._showAllBtnId}`]: { click: () => this._showAllGroupStage() },
      '(optional).wc-bet-btn': { click: (e) => this._placeBet(e.currentTarget) }
    }
  }

  async _fetchTotalAndLeaderboard () {
    const [first, lb] = await Promise.all([
      server.getWorldCupGames(0, 1),
      server.getWorldCupLeaderboard()
    ])
    this._leaderboard = lb
    return Number(first.total || 0)
  }

  /**
   * Default to the page containing the next upcoming game so users don't have
   * to scroll past finished fixtures every time.
   * @returns {Promise<number>}
   */
  async _findInitialPage () {
    if (this._totalGames === 0) return 0
    // Page through small chunks until we hit an unplayed kickoff in the future.
    // For 72 group games this is at most a few requests; usually one.
    const chunkSize = 12
    let offset = 0
    const now = Date.now()
    while (offset < this._totalGames) {
      const res = await server.getWorldCupGames(offset, chunkSize)
      const idx = res.games.findIndex(g => new Date(g.kickoff).getTime() > now)
      if (idx >= 0) return Math.floor((offset + idx) / PAGE_SIZE)
      offset += chunkSize
    }
    return Math.max(0, Math.ceil(this._totalGames / PAGE_SIZE) - 1)
  }

  async _loadPage () {
    const res = await server.getWorldCupGames(this._page * PAGE_SIZE, PAGE_SIZE)
    this._games = res.games
    this._totalGames = Number(res.total || this._totalGames)
  }

  _renderBody (totalPages) {
    if (this._totalGames === 0) {
      return `<p class="mb-0 text-white">${t('worldCup.noGames')}</p>`
    }
    return `
      <p class="text-white small mb-3">${t('worldCup.description')}</p>
      <div class="row g-3">
        <div class="col-lg-8">
          ${this._renderGameList()}
          ${this._renderPagination(totalPages)}
          <div class="text-center mt-2">
            <button id="${this._showAllBtnId}" type="button" class="btn btn-sm btn-outline-light">
              <i class="fa fa-list"></i> ${t('worldCup.showAllGames')}
            </button>
          </div>
        </div>
        <div class="col-lg-4">
          ${this._renderProgress()}
          ${this._renderLeaderboard()}
        </div>
      </div>
    `
  }

  _renderGameList () {
    return this._games.map(g => this._renderGame(g)).join('')
  }

  _renderGame (g) {
    const localKickoff = new Date(g.kickoff).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    const isBettingOpen = !g.hasKickedOff
    const result = g.isPlayed ? `${g.goalsTeam1} : ${g.goalsTeam2}` : ''
    let resultBadge = ''
    if (g.isPlayed && g.myPrediction) {
      resultBadge = g.myBetCorrect
        ? `<span class="badge bg-success ms-2">${t('worldCup.correct')}</span>`
        : `<span class="badge bg-danger ms-2">${t('worldCup.wrong')}</span>`
    } else if (g.myPrediction && !g.isPlayed) {
      resultBadge = `<span class="badge bg-info text-dark ms-2">${t('worldCup.tipped')}</span>`
    }
    return `
      <div class="wc-game card card-body bg-secondary text-white mb-2" data-game-id="${g.id}">
        <div class="d-flex align-items-center mb-2 small">
          <span><i class="fa fa-clock-o"></i> ${localKickoff}</span>
        </div>
        <div class="d-flex align-items-center justify-content-around mb-2">
          <div class="text-center wc-team">
            <img src="${flagUrl(g.team1Code)}" alt="${g.team1Name}" class="wc-flag">
            <div class="small fw-bold">${g.team1Name}</div>
          </div>
          <div class="text-center fw-bold">
            ${g.isPlayed ? `<span class="fs-5">${result}</span>` : `<span class="">vs</span>`}
            ${resultBadge}
          </div>
          <div class="text-center wc-team">
            <img src="${flagUrl(g.team2Code)}" alt="${g.team2Name}" class="wc-flag">
            <div class="small fw-bold">${g.team2Name}</div>
          </div>
        </div>
        ${isBettingOpen ? this._renderBetButtons(g) : this._renderBetSummary(g)}
      </div>
    `
  }

  _renderBetButtons (g) {
    const btn = (prediction, label) => {
      const isActive = g.myPrediction === prediction
      return `
        <button type="button"
                class="btn btn-sm flex-fill wc-bet-btn ${isActive ? 'btn-info' : 'btn-outline-light'}"
                data-game-id="${g.id}"
                data-prediction="${prediction}">
          ${label}
        </button>
      `
    }
    return `
      <div class="d-flex gap-2">
        ${btn('team_1', t('worldCup.betWin1'))}
        ${btn('draw', t('worldCup.betDraw'))}
        ${btn('team_2', t('worldCup.betWin2'))}
      </div>
    `
  }

  _renderBetSummary (g) {
    if (!g.myPrediction) {
      return `<div class="small ">${t('worldCup.noBetPlaced')}</div>`
    }
    const label = {
      team_1: t('worldCup.betWin1Short', { team: g.team1Name }),
      draw: t('worldCup.betDrawShort'),
      team_2: t('worldCup.betWin1Short', { team: g.team2Name })
    }[g.myPrediction]
    return `<div class="small">${t('worldCup.yourBet')}: <strong>${label}</strong></div>`
  }

  _renderPagination (totalPages) {
    if (totalPages <= 1) return ''
    const canPrev = this._page > 0
    const canNext = this._page < totalPages - 1
    return `
      <div class="d-flex justify-content-between align-items-center mt-2">
        <button id="${this._prevBtnId}" type="button" class="btn btn-sm btn-outline-light" ${canPrev ? '' : 'disabled'}>
          <i class="fa fa-chevron-left"></i> ${t('worldCup.prev')}
        </button>
        <span class="small ">${t('worldCup.pageOf', {
    page: this._page + 1,
    total: totalPages
  })}</span>
        <button id="${this._nextBtnId}" type="button" class="btn btn-sm btn-outline-light" ${canNext ? '' : 'disabled'}>
          ${t('worldCup.next')} <i class="fa fa-chevron-right"></i>
        </button>
      </div>
    `
  }

  _renderProgress () {
    if (!this._leaderboard) return ''
    const {
      myPoints,
      pointsPerReward,
      nextRewardAt
    } = this._leaderboard
    const fraction = (myPoints % pointsPerReward) / pointsPerReward
    const safeFraction = Math.max(0, Math.min(1, fraction))
    return `
      <div class="card card-body bg-secondary mb-2">
        <h6 class="mb-2"><i class="fa fa-gift"></i> ${t('worldCup.nextReward')}</h6>
        <p class="small mb-2">${t('worldCup.rewardExplain', { perReward: pointsPerReward })}</p>
        ${new ProgressBar(safeFraction)}
        <p class="small  mb-0 mt-1">${t('worldCup.progressTo', {
    points: myPoints,
    nextRewardAt
  })}</p>
      </div>
    `
  }

  _renderLeaderboard () {
    if (!this._leaderboard) return ''
    const {
      top,
      me
    } = this._leaderboard
    if (top.length === 0) {
      return `
        <div class="card card-body bg-secondary">
          <h6 class="mb-2"><i class="fa fa-trophy"></i> ${t('worldCup.leaderboardTitle')}</h6>
          <p class=" small mb-0">${t('worldCup.leaderboardEmpty')}</p>
        </div>
      `
    }
    const rows = top.map(row => `
      <tr class="${row.isMe ? 'wc-leaderboard-row--me' : ''}">
        <td class="small">${row.rank}.</td>
        <td class="small">${row.username}</td>
        <td class="small text-end">${row.points}</td>
      </tr>
    `).join('')
    const isMeInTop = top.some(r => r.isMe)
    const meRow = me && !isMeInTop
      ? `
        <tr class="wc-leaderboard-row--me">
          <td class="small">${me.rank}.</td>
          <td class="small">${t('worldCup.you')}</td>
          <td class="small text-end">${me.points}</td>
        </tr>`
      : ''
    return `
      <div class="card card-body bg-secondary">
        <h6 class="mb-2"><i class="fa fa-trophy"></i> ${t('worldCup.leaderboardTitle')}</h6>
        <table class="table table-sm table-dark wc-leaderboard mb-0">
          <tbody>
            ${rows}
            ${meRow}
          </tbody>
        </table>
      </div>
    `
  }

  _collapseBtnId = generateId()
  _prevBtnId = generateId()
  _nextBtnId = generateId()
  _showAllBtnId = generateId()
  _page = null
  _games = []
  _totalGames = 0
  /** @type {{top: Array, me: any, myPoints: number, pointsToNextReward: number, nextRewardAt: number, pointsPerReward: number}|null} */
  _leaderboard = null

  get _isCollapsed () {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) !== '0'
  }

  async _toggleCollapse () {
    const next = !this._isCollapsed
    localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0')
    // First expand: lazy-load the first page that we skipped on load().
    if (!next && this._games.length === 0 && this._totalGames > 0) {
      if (this._page === null) this._page = await this._findInitialPage()
      await this._loadPage()
    }
    await this.update(false)
  }

  async _goToPage (page) {
    const totalPages = Math.max(1, Math.ceil(this._totalGames / PAGE_SIZE))
    if (page < 0 || page >= totalPages) return
    this._page = page
    await this._loadPage()
    await this.update(false)
  }

  async _placeBet (btn) {
    const gameId = Number(btn.dataset.gameId)
    const prediction = btn.dataset.prediction
    if (!gameId || !prediction) return
    btn.disabled = true
    try {
      await server.placeWorldCupBet(gameId, prediction)
      toast(t('worldCup.betSaved'), 'success')
      await this.update(true)
    } catch (e) {
      toast(e.message || t('toast.somethingWentWrong'), 'error')
      btn.disabled = false
    }
  }

  async _showAllGroupStage () {
    const { showWorldCupGroupStageOverlay } = await import('./worldCupGroupStageOverlay.js')
    await showWorldCupGroupStageOverlay()
    // Refresh in case the user placed a bet from the overlay.
    await this.update(true)
  }
}
