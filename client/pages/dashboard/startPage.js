import { GameSlider } from '../../partials/gameSlider.js'
import { Table } from '../../partials/table.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { generateId } from '../../lib/html.js'
import { goTo } from '../../lib/router.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { t } from '../../i18n/index.js'
import { server } from '../../lib/gateway.js'
import { getPromoVideoId, renderPromoVideoEmbed } from '../../lib/promoVideo.js'
import { toast } from '../../partials/toast.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showInviteFriendOverlay } from '../../partials/inviteFriendOverlay.js'
import { showFeatureRequestOverlay } from '../../partials/featureRequestOverlay.js'
import { wikiInfoIcon } from '../../partials/wikiInfoIcon.js'
import { DailyLoginBar } from '../../partials/dailyLoginBar.js'

export class StartPage {
  /**
   * @param {object} options
   * @param {Array} options.sliderGames
   * @param {number} options.initialSlideIndex
   * @param {object} options.team
   * @param {Array} options.cupGames
   * @param {Array} options.friendlyGames
   * @param {boolean} options.canPlayFriendly
   * @param {Array} options.standing
   * @param {number} options.teamPosition
   * @param {Array} options.urgencies
   * @param {number} [options.newMessageCount]
   */
  constructor ({
    sliderGames,
    initialSlideIndex,
    team,
    cupGames,
    friendlyGames,
    canPlayFriendly,
    standing,
    teamPosition,
    urgencies,
    newMessageCount
  }) {
    this._sliderGames = sliderGames
    this._initialSlideIndex = initialSlideIndex
    this.team = team
    this._cupGames = cupGames
    this._friendlyGames = friendlyGames
    this._canPlayFriendly = canPlayFriendly
    this.standing = standing
    this.teamPosition = teamPosition
    this._urgencies = urgencies
    this._newMessageCount = newMessageCount || 0
  }

  /**
   * @returns {string}
   */
  toString () {
    const coffeeId = generateId()
    const leagueCardId = generateId()
    const cupCardId = generateId()
    const friendlyCardId = generateId()
    const gameSliderArgs = {
      games: this._sliderGames,
      teamId: this.team.id,
      initialIndex: this._initialSlideIndex,
      cardId: leagueCardId
    }
    onClick('#' + coffeeId, (e) => {
      e.preventDefault()
      window.open('https://buymeacoffee.com/dobschal', '_blank')
    })
    return `
      <div class="d-flex flex-column flex-lg-row align-items-start u-gap-md">
        <div class="order-2 order-lg-1 u-w-lg-63 u-w-100 flex-shrink-0">
            <div id="${leagueCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-diamond"></i> ${formatLeague(this.team.level, this.team.league)}</h5>
            ${new GameSlider(gameSliderArgs)}
          </div>
          <div id="${cupCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-trophy"></i> ${t('cup.title')}</h5>
            ${this._renderCupGames(cupCardId)}
          </div>
          <div id="${friendlyCardId}" class="card card-body mb-2 bg-dark">
            <h5 class="mb-2 text-center text-white"><i class="fa fa-handshake-o"></i> ${t('friendly.title')}</h5>
            ${this._renderFriendlyGames(friendlyCardId)}
          </div>
        </div>
        <div class="u-w-lg-33 u-w-100 flex-shrink-0 text-center order-1 order-lg-2">
          ${this._getDailyLoginBar()}
          <a href="#team?id=${this.team.id}" class="text-decoration-none">
            ${renderEmblem(this.team, 160)}
            <h2 class="mb-4">${this.team.name}</h2>
          </a>
          ${this._renderMiniStanding()}
          <div class="d-none d-lg-block">
            ${this._renderUrgencySection()}
          </div>
        </div>
        <div class="d-lg-none order-3 w-100 text-center">
          ${this._renderUrgencySection()}
        </div>
      </div>
      <div class="d-flex flex-column flex-md-row u-gap-md mt-3 dashboard-promo-row">
        ${this._renderCommunityCard()}
        ${this._renderInviteCard()}
        ${this._renderVideoCard()}
      </div>
      <p class="text-center text-muted mt-3 mb-0 pb-4">
        <i class="fa fa-coffee"></i> Support me and buy me a coffee:
        <a id="${coffeeId}" href="https://buymeacoffee.com/dobschal" target="_blank" rel="noopener" class="buy-me-a-coffee-link">buymeacoffee.com/dobschal</a>
      </p>
    `
  }

  /**
   * Lazy-init and cache the daily-login bar so a dashboard re-render reuses
   * the same instance instead of re-fetching and flickering (#501).
   * @returns {DailyLoginBar}
   */
  _getDailyLoginBar () {
    if (!this._dailyLoginBar) this._dailyLoginBar = new DailyLoginBar()
    return this._dailyLoginBar
  }

  _renderUrgencySection () {
    return `
      <h5 class="mb-2 mt-2 text-center text-lg-start"><i class="fa fa-clipboard"></i> ${t('dashboard.urgencyTitle')} ${wikiInfoIcon('urgency-list')}</h5>
      ${this._renderUrgencyChecklist()}
      ${this._renderMessagesLink()}
    `
  }

  _renderMessagesLink () {
    const badge = this._newMessageCount > 0
      ? ` <span class="badge rounded-pill bg-danger">${this._newMessageCount}</span>`
      : ''
    return `
      <div class="mt-2 text-center text-lg-start">
        <a href="#dashboard?sub_page=messages" class="text-decoration-none small">
          <i class="fa fa-envelope me-1"></i>${t('dashboard.viewMessages')}${badge}
        </a>
      </div>
    `
  }

  _renderCommunityCard () {
    const requestBtnId = generateId()
    onClick('#' + requestBtnId, () => showFeatureRequestOverlay())
    return `
      <div class="card card-body community-card border-warning bg-warning-subtle flex-fill mb-0">
        <img src="assets/dashboard/feature-request.png" alt="" class="dashboard-promo-img">
        <h5 class="mb-2"><i class="fa fa-users"></i> ${t('dashboard.communityTitle')}</h5>
        <p class="text-muted mb-3">${t('dashboard.communityText')}</p>
        <div class="mt-auto d-flex flex-column gap-2">
          <button id="${requestBtnId}" type="button" class="btn btn-info btn-xl text-white">
            <i class="fa fa-lightbulb-o"></i> ${t('dashboard.communityRequestCta')}
          </button>
          <a href="#dashboard?sub_page=forum&category=3" class="btn btn-outline-secondary btn-xl">
            <i class="fa fa-list"></i> ${t('dashboard.communityCta')}
          </a>
        </div>
      </div>
    `
  }

  _renderInviteCard () {
    const inviteId = generateId()
    onClick('#' + inviteId, () => showInviteFriendOverlay())
    return `
      <div class="card card-body invite-card border-success bg-success-subtle flex-fill mb-0">
        <img src="assets/dashboard/user-invite.png" alt="" class="dashboard-promo-img">
        <h5 class="mb-2"><i class="fa fa-paper-plane"></i> ${t('referral.dashboardTitle')}</h5>
        <p class="text-muted mb-3">${t('referral.dashboardText')}</p>
        <div class="mt-auto">
          <button id="${inviteId}" type="button" class="btn btn-info btn-xl w-100 text-white">
            <i class="fa fa-envelope"></i> ${t('referral.inviteFriendShort')}
          </button>
        </div>
      </div>
    `
  }

  _renderVideoCard () {
    const isNativeApp = Boolean(window.__nativePlatform)
    const videoId = getPromoVideoId({ isNativeApp })
    const videoContent = isNativeApp
      ? `<a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener" class="d-block ratio ratio-16x9 video-thumbnail-link">
          <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="${t('dashboard.videoTitle')}" class="video-thumbnail-img">
          <span class="video-play-btn"><i class="fa fa-play-circle fa-4x"></i></span>
        </a>`
      : renderPromoVideoEmbed(videoId, t('dashboard.videoTitle'))
    return `
      <div class="card card-body video-card border-info bg-info-subtle flex-fill mb-0">
        <img src="assets/dashboard/tutorial.png" alt="" class="dashboard-promo-img">
        <h5 class="mb-2"><i class="fa fa-youtube-play"></i> ${t('dashboard.videoTitle')}</h5>
        <p class="text-muted mb-3">${t('dashboard.videoText')}</p>
        <div class="mt-auto">
          ${videoContent}
        </div>
      </div>
    `
  }

  _renderUrgencyChecklist () {
    const urgencyTypes = this._urgencies.map(u => u.type)

    const checks = [
      {
        type: 'INCOMPLETE_LINEUP',
        text: 'dashboard.urgencyLineup',
        okText: 'dashboard.urgencyOk.lineup',
        link: '#my-team'
      },
      {
        type: 'INCOMPLETE_BENCH',
        text: 'dashboard.urgencyBench',
        okText: 'dashboard.urgencyOk.bench',
        link: '#my-team'
      },
      {
        type: 'NO_CAPTAIN',
        text: 'dashboard.urgencyCaptain',
        okText: 'dashboard.urgencyOk.captain',
        link: '#my-team'
      },
      {
        type: 'SQUAD_AGE',
        text: (urgency) => t(urgency?.tooYoung ? 'dashboard.urgencySquadTooYoung' : 'dashboard.urgencySquadTooOld'),
        okText: 'dashboard.urgencyOk.squadAge',
        link: '#my-team',
        hideOk: true
      },
      {
        type: 'LOW_FRESHNESS',
        text: 'dashboard.urgencyFreshness',
        okText: 'dashboard.urgencyOk.freshness',
        link: '#my-team'
      },
      {
        type: 'YOUTH_LOW_STATS',
        text: 'dashboard.urgencyYouth',
        okText: 'dashboard.urgencyOk.youth',
        link: '#my-team?sub_page=youth'
      },
      {
        type: 'INCOMING_OFFERS',
        text: 'dashboard.urgencyOffers',
        okText: 'dashboard.urgencyOk.offers',
        link: '#trades?sub_page=incoming'
      },
      {
        type: 'NO_SPONSOR',
        text: 'dashboard.urgencySponsor',
        okText: 'dashboard.urgencyOk.sponsor',
        link: '#club?sub_page=finances'
      },
      {
        type: 'FORUM_MENTIONS',
        text: 'dashboard.urgencyMentions',
        okText: 'dashboard.urgencyOk.mentions',
        link: '#dashboard?sub_page=forum',
        hideOk: true
      },
      {
        // Only worth surfacing when a stack is actually full — an "all good"
        // row for something the user never thinks about would just be noise.
        type: 'ACTION_CARDS_FULL',
        text: 'dashboard.urgencyActionCardsFull',
        okText: 'dashboard.urgencyOk.actionCardsFull',
        link: '#my-team?sub_page=cards',
        hideOk: true
      }
    ]

    const items = checks.map(check => {
      const urgency = this._urgencies.find(u => u.type === check.type)
      const isOk = !urgencyTypes.includes(check.type)

      if (isOk) {
        if (check.hideOk) return ''
        return `
          <li class="list-group-item d-flex align-items-center py-2 px-3 border-0">
            <i class="fa fa-check-circle text-success me-2"></i>
            <span class="text-muted small">${t(check.okText)}</span>
          </li>
        `
      }

      const message = typeof check.text === 'function'
        ? check.text(urgency)
        : t(check.text, { count: urgency?.count || 0 })
      return `
        <li class="list-group-item d-flex align-items-center py-2 px-3 border-0 ">
          <a href="${check.link}" class="text-decoration-none text-start">
            <i class="fa fa-exclamation-circle text-warning me-2"></i>
            <span class="text-warning small">${message}</span>
          </a>
        </li>
      `
    }).join('')

    return `<ul class="list-group list-group-flush">${items}</ul>`
  }

  /**
   * Render cup games section
   * @param {string} cardId - ID of the wrapper card element
   * @returns {GameSlider|string}
   */
  _renderCupGames (cardId) {
    if (this._cupGames.length === 0) {
      return `
        <div class="card bg-light border-0">
          <div class="card-body text-center text-white text-muted py-4">
            <i class="fa fa-trophy fa-2x mb-2 opacity-50"></i>
            <p class="mb-0">${t('cup.noGames')}</p>
          </div>
        </div>
      `
    }

    const cupSliderArgs = {
      games: this._cupGames,
      teamId: this.team.id,
      initialIndex: this._findCupInitialSlideIndex(),
      cardId
    }

    return new GameSlider(cupSliderArgs)
  }

  /**
   * Render friendly games section
   * @param {string} cardId - ID of the wrapper card element
   * @returns {GameSlider|string}
   */
  _renderFriendlyGames (cardId) {
    const playButton = this._canPlayFriendly ? this._renderPlayRandomFriendlyButton() : ''

    if (this._friendlyGames.length === 0) {
      return `
        <div class="card bg-transparent border-0">
          <div class="card-body text-center text-muted py-4">
            <i class="fa text-white fa-handshake-o fa-2x mb-2 opacity-50"></i>
            <p class="mb-0 text-white">${t('friendly.noGames')}</p>
            ${playButton}
          </div>
        </div>
      `
    }

    const friendlySliderArgs = {
      games: this._friendlyGames,
      teamId: this.team.id,
      initialIndex: this._friendlyGames.length - 1,
      cardId
    }

    return `${new GameSlider(friendlySliderArgs)}${playButton}`
  }

  /**
   * Render the "Play Random Friendly" button
   * @returns {string}
   */
  _renderPlayRandomFriendlyButton () {
    const btnId = generateId()
    onClick('#' + btnId, async () => {
      const btn = document.getElementById(btnId)
      if (!btn || btn.disabled) return
      btn.disabled = true
      btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> ' + t('friendly.playRandomFriendly')
      try {
        const result = await server.playRandomFriendly()
        const game = result.game
        toast(t('friendly.result', {
          goals1: game.goalsTeam1,
          goals2: game.goalsTeam2
        }), 'success')
        await showGameModal(game.id)
        window.location.reload()
      } catch (e) {
        toast(e.message ?? t('toast.somethingWentWrong'), 'error')
        btn.disabled = false
        btn.innerHTML = '<i class="fa fa-random"></i> ' + t('friendly.playRandomFriendly')
      }
    })
    return `<div class="text-center mt-4">
      <button id="${btnId}" class="btn btn-info btn-sm"><i class="fa fa-random"></i> ${t('friendly.playRandomFriendly')}</button>
    </div>`
  }

  /**
   * @returns {UIElement|string}
   */
  _renderMiniStanding () {
    if (!this.standing || this.standing.length === 0) {
      return ''
    }

    const pos = this.teamPosition - 1
    let startIndex = Math.max(0, pos - 2)
    const endIndex = Math.min(this.standing.length, startIndex + 5)
    if (endIndex - startIndex < 5) {
      startIndex = Math.max(0, endIndex - 5)
    }

    const teamsToShow = this.standing.slice(startIndex, endIndex)

    return new Table({
      cols: [
        { name: '#' },
        { name: t('results.team') },
        { name: t('results.points') }
      ],
      data: teamsToShow,
      classes: 'table-sm',
      rowClass: (item, rowIndex) => {
        const actualIndex = startIndex + rowIndex
        const isMyTeam = this.team.id === item.team.id
        if (isMyTeam) return 'table-info'
        if (actualIndex < 2) return 'table-success'
        if (actualIndex > 13) return 'table-warning'
        return ''
      },
      rowAttrs: () => {
        const id = generateId()
        onClick('#' + id, () => goTo(`results?level=${this.team.level}&league=${this.team.league}`))
        return `id="${id}"`
      },
      renderRow: (item, rowIndex) => {
        const actualIndex = startIndex + rowIndex
        const hasUser = Boolean(item.team.user_id)
        return [
          `${actualIndex + 1}.`,
          `<span class="emblem-thumb--sm">${renderEmblem(item.team, 20)}</span>${item.team.name} ${hasUser ? '<i class="fa fa-user"></i>' : ''}`,
          `${item.points}`
        ]
      }
    })
  }

  /**
   * Find the initial slide index for the cup game slider.
   *
   * First visit after a cup round was played: show that result. On subsequent
   * visits (tracked by a per-game seen flag in localStorage) default to the
   * next upcoming cup game so the user sees what's coming up — not an old
   * result they already know about.
   *
   * @returns {number}
   */
  _findCupInitialSlideIndex () {
    const lastPlayedIndex = this._cupGames.reduce((acc, g, i) => g.isPlayed ? i : acc, -1)
    const nextUpcomingIndex = this._cupGames.findIndex(g => !g.isPlayed && g.gameDate)

    if (lastPlayedIndex === -1) return Math.max(0, nextUpcomingIndex)

    const lastPlayed = this._cupGames[lastPlayedIndex]
    const seenKey = `cupSliderSeen_${lastPlayed.id}`
    if (localStorage.getItem(seenKey) && nextUpcomingIndex !== -1) {
      return nextUpcomingIndex
    }
    localStorage.setItem(seenKey, '1')
    return lastPlayedIndex
  }
}
