import { GameSlider } from '../../partials/gameSlider.js'
import { Table } from '../../partials/table.js'
import { renderEmblem } from '../../partials/emblem.js'
import { formatLeague } from '../../util/league.js'
import { generateId } from '../../lib/html.js'
import { goTo } from '../../lib/router.js'
import { onClick } from '../../lib/htmlEventHandlers.js'
import { getLocale, t } from '../../i18n/index.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showInviteFriendOverlay } from '../../partials/inviteFriendOverlay.js'

export class StartPage {
  /**
   * @param {object} options
   * @param {Array} options.sliderGames
   * @param {number} options.initialSlideIndex
   * @param {object} options.team
   * @param {Array} options.cupGames
   * @param {Array} options.friendlyGames
   * @param {Array} [options.friendsGames]
   * @param {boolean} options.canPlayFriendly
   * @param {Array} options.standing
   * @param {number} options.teamPosition
   * @param {Array} options.urgencies
   */
  constructor ({
    sliderGames,
    initialSlideIndex,
    team,
    cupGames,
    friendlyGames,
    friendsGames,
    canPlayFriendly,
    standing,
    teamPosition,
    urgencies
  }) {
    this._sliderGames = sliderGames
    this._initialSlideIndex = initialSlideIndex
    this.team = team
    this._cupGames = cupGames
    this._friendlyGames = friendlyGames
    this._friendsGames = friendsGames || []
    this._canPlayFriendly = canPlayFriendly
    this.standing = standing
    this.teamPosition = teamPosition
    this._urgencies = urgencies
  }

  /**
   * @returns {string}
   */
  toString () {
    const coffeeId = generateId()
    const leagueCardId = generateId()
    const cupCardId = generateId()
    const friendlyCardId = generateId()
    const friendsCardId = generateId()
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
        <div class="flex-grow-1 order-2 order-lg-1 w-100">
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
          ${this._renderFriendsGamesCard(friendsCardId)}
        </div>
        <div class="u-w-lg-33 u-w-100 flex-shrink-0 text-center order-1 order-lg-2 mb-3 mb-lg-0">
          <a href="#team?id=${this.team.id}" class="text-decoration-none">
            ${renderEmblem(this.team, 160)}
            <h2 class="mb-4">${this.team.name}</h2>
          </a>
          ${this._renderMiniStanding()}
          <h5 class="mb-2 mt-2 text-center text-lg-start"><i class="fa fa-clipboard"></i> ${t('dashboard.urgencyTitle')}</h5>
          ${this._renderUrgencyChecklist()}
        </div>
      </div>
      ${this._renderCommunityCard()}
      ${this._renderInviteCard()}
      ${this._renderVideoCard()}
      <p class="text-center text-muted mt-3 mb-0 pb-4">
        <i class="fa fa-coffee"></i> Support me and buy me a coffee:
        <a id="${coffeeId}" href="https://buymeacoffee.com/dobschal" target="_blank" rel="noopener" class="buy-me-a-coffee-link">buymeacoffee.com/dobschal</a>
      </p>
    `
  }

  _renderCommunityCard () {
    return `
      <div class="card card-body mb-2 bg-dark mt-3 community-card">
        <h5 class="mb-2 text-center text-white"><i class="fa fa-users"></i> ${t('dashboard.communityTitle')}</h5>
        <p class="text-center text-white-50 mb-3">${t('dashboard.communityText')}</p>
        <div class="text-center">
          <a href="#dashboard?sub_page=forum&category=3" class="btn btn-info btn-sm">
            <i class="fa fa-lightbulb-o"></i> ${t('dashboard.communityCta')}
          </a>
        </div>
      </div>
    `
  }

  _renderInviteCard () {
    const inviteId = generateId()
    onClick('#' + inviteId, () => showInviteFriendOverlay())
    return `
      <div class="card card-body mb-2 bg-dark mt-3 invite-card">
        <h5 class="mb-2 text-center text-white"><i class="fa fa-paper-plane"></i> ${t('referral.dashboardTitle')}</h5>
        <p class="text-center text-white-50 mb-3">${t('referral.dashboardText')}</p>
        <div class="text-center">
          <button id="${inviteId}" type="button" class="btn btn-info btn-sm">
            <i class="fa fa-envelope"></i> ${t('referral.inviteFriendShort')}
          </button>
        </div>
      </div>
    `
  }

  _renderVideoCard () {
    if (localStorage.getItem('hideVideoCard') === '1') return ''
    const closeId = generateId()
    onClick(closeId, () => {
      localStorage.setItem('hideVideoCard', '1')
      document.getElementById(closeId)?.closest('.card')?.remove()
    })
    const videoId = getLocale() === 'en' ? '5Szjg4fdVl0' : 'mqiA34LB3ko'
    const isNativeApp = Boolean(window.__nativePlatform)
    const videoContent = isNativeApp
      ? `<a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener" class="d-block ratio ratio-16x9 video-thumbnail-link">
          <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="${t('dashboard.videoTitle')}" class="video-thumbnail-img">
          <span class="video-play-btn"><i class="fa fa-play-circle fa-4x"></i></span>
        </a>`
      : `<div class="ratio ratio-16x9">
          <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1" title="${t('dashboard.videoTitle')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen webkit-playsinline></iframe>
        </div>`
    return `
      <div class="card card-body mb-2 bg-dark mt-3 position-relative">
        <button id="${closeId}" class="btn-close btn-close-white position-absolute top-0 end-0 m-2" type="button" aria-label="Close"></button>
        <h5 class="mb-2 text-center text-white"><i class="fa fa-youtube-play"></i> ${t('dashboard.videoTitle')}</h5>
        ${videoContent}
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
      }
    ]

    const items = checks.map(check => {
      const urgency = this._urgencies.find(u => u.type === check.type)
      const isOk = !urgencyTypes.includes(check.type)

      if (isOk) {
        return `
          <li class="list-group-item d-flex align-items-center py-2 px-3 border-0">
            <i class="fa fa-check-circle text-success me-2"></i>
            <span class="text-muted small">${t(check.okText)}</span>
          </li>
        `
      }

      const message = t(check.text, { count: urgency?.count || 0 })
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
   * Render the "Friends' last gameday matches" card. Hidden entirely when the
   * user has no friends with played games.
   * @param {string} cardId
   * @returns {string}
   */
  _renderFriendsGamesCard (cardId) {
    if (!this._friendsGames || this._friendsGames.length === 0) return ''

    const friendsSliderArgs = {
      games: this._friendsGames,
      teamId: this.team.id,
      initialIndex: this._friendsGames.length - 1,
      cardId
    }

    return `
      <div id="${cardId}" class="card card-body mb-2 bg-dark">
        <h5 class="mb-2 text-center text-white"><i class="fa fa-users"></i> ${t('dashboard.friendsTitle')}</h5>
        ${new GameSlider(friendsSliderArgs)}
      </div>
    `
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
      classes: 'table-sm mb-4',
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
