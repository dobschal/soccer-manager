import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { t } from '../i18n/index.js'
import { renderGameResult } from './gameResult.js'
import { showGameModal } from './gameModal.js'
import { shortenTeamName } from '../util/team.js'

/**
 * Game slider component for displaying past and upcoming games
 */
export class GameSlider extends UIElement {
  /**
   * @param {Object} options
   * @param {Array} options.games - Array of game objects with isPlayed, team1Data, team2Data, gameDate, etc.
   * @param {number} options.teamId - Current user's team ID
   * @param {number} options.initialIndex - Index of the initially active slide
   * @param {string} [options.cardId] - ID of wrapper card element to apply team color gradient to
   */
  constructor ({
    games = [],
    teamId,
    initialIndex = 0,
    cardId
  }) {
    super()
    this._games = games
    this._teamId = teamId
    this._sliderIndex = initialIndex
    this._initialIndex = initialIndex
    this._cardId = cardId
  }
  get template () {
    if (this._games.length === 0) {
      return ''
    }

    const prevBtnId = generateId()
    const nextBtnId = generateId()

    onClick('#' + prevBtnId, () => this._navigate(-1))
    onClick('#' + nextBtnId, () => this._navigate(1))

    // Reset countdown element IDs for this render
    this._countdownElementIds = []

    const slides = this._games.map((game, index) => {
      const isHomeGame = game.team1Id === this._teamId
      const isActive = index === this._initialIndex

      const centerContent = this._generateCenterContent(game)

      // Determine href based on game type
      let href
      const slideId = generateId()
      if (game.isPlayed) {
        if (game.game_type === 'friendly' || game.isFriendly) {
          // Friendly games: show modal on click (href set to '#' to make it clickable)
          href = '#'
          onClick('#' + slideId + ' a', (e) => {
            e.preventDefault()
            void showGameModal(game.id)
          })
        } else if (game.isCup || game.game_type === 'cup') {
          // Cup games: navigate to cup results
          href = `#results?game_id=${game.id}&sub_page=cup`
        } else {
          // League games: navigate to league results
          href = `#results?game_id=${game.id}`
        }
      }

      const isBye = !game.team2Data?.name && !game.team2Id
      const hasResult = game.isPlayed && typeof game.goalsTeam1 === 'number' && typeof game.goalsTeam2 === 'number'
      const slideContent = renderGameResult({
        team1: game.team1Data,
        team2: isBye ? null : game.team2Data,
        team1Name: shortenTeamName(game.team1 ?? '', game.team1Short),
        team2Name: isBye ? t('cup.bye') : shortenTeamName(game.team2 ?? '', game.team2Short),
        isTeam1Highlighted: isHomeGame,
        centerContent,
        href,
        team1HasUser: Boolean(game.team1UserId),
        team2HasUser: Boolean(game.team2UserId),
        team1Won: hasResult && game.goalsTeam1 > game.goalsTeam2,
        team2Won: hasResult && game.goalsTeam2 > game.goalsTeam1
      })

      return `
        <div id="${slideId}" class="game-slider-slide${isActive ? ' active' : ''}" data-index="${index}">
          ${slideContent}
        </div>
      `
    }).join('')

    const indicators = this._games.map((game, index) => {
      const isActive = index === this._initialIndex
      const isPast = game.isPlayed
      const indicatorId = generateId()
      onClick('#' + indicatorId, () => this._goToSlide(index))
      return `<span id="${indicatorId}" class="game-slider-indicator ${isActive ? 'active' : ''} ${isPast ? 'past' : 'upcoming'}" data-index="${index}"></span>`
    }).join('')

    return `
      <div id="${this._sliderId}" class="game-slider">
        <button id="${prevBtnId}" class="game-slider-nav game-slider-prev d-none d-lg-block" aria-label="Previous">
          <i class="fa fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="game-slider-track">
          ${slides}
        </div>
        <button id="${nextBtnId}" class="game-slider-nav game-slider-next d-none d-lg-block" aria-label="Next">
          <i class="fa fa-chevron-right" aria-hidden="true"></i>
        </button>
        <div class="game-slider-indicators">
          ${indicators}
        </div>
      </div>
    `
  }
  onMounted () {
    this._setupScrollSnap()
    this._startCountdownTimer()
    this._updateCardGradient()
  }
  onDestroy () {
    this._stopCountdownTimer()
    this._teardownScrollSnap()
  }
  _sliderId = generateId()
  
  _sliderIndex = 0
  
  _countdownElementIds = []
  _timerInterval = null

  /**
   * Generate the center content for a game slide based on its state
   * @param {Object} game
   * @returns {string}
   */
  _generateCenterContent (game) {
    const label = this._getGameLabel(game)

    if (game.isPlayed) {
      // Played game: show game day, result, and date/time
      const playedAtHtml = game.playedAt
        ? `<small class="d-block mt-1">${new Date(game.playedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</small>`
        : ''
      return `
        <small class="d-block mb-1">${label}</small>
        <h3 class="mb-0"><span class="badge bg-info">${game.goalsTeam1 ?? '-'}:${game.goalsTeam2 ?? '-'}</span></h3>
        ${playedAtHtml}
      `
    }

    // Upcoming game: check how far away it is
    const gameDate = game.gameDate ? new Date(game.gameDate) : null
    if (!gameDate) {
      // No date available, show simple countdown placeholder
      const countdownId = generateId()
      this._countdownElementIds.push({
        id: countdownId,
        gameDate: null
      })
      return `
        <small class="d-block mb-1">${label}</small>
        <div class="badge p-2 countdown-badge">
          <i class="fa fa-clock-o" aria-hidden="true"></i><br>
          <span id="${countdownId}">--:--:--</span>
        </div>
      `
    }

    const diff = gameDate.getTime() - Date.now()
    const hoursAway = diff / (1000 * 60 * 60)

    if (hoursAway > 24) {
      // More than 24 hours away: show "in X days"
      const daysAway = Math.ceil(hoursAway / 24)
      const daysText = daysAway === 1
        ? t('dashboard.inOneDay')
        : t('dashboard.inDays', { days: daysAway })

      return `
        <small class="d-block mb-1">${label}</small>
        <div class="badge p-2 countdown-badge">
          <i class="fa fa-calendar" aria-hidden="true"></i><br>
          <span>${daysText}</span>
        </div>
      `
    }

    // Less than 24 hours: show countdown timer
    const countdownId = generateId()
    this._countdownElementIds.push({
      id: countdownId,
      gameDate
    })
    return `
      <small class="d-block mb-1">${label}</small>
      <div class="badge p-2 countdown-badge">
        <i class="fa fa-clock-o" aria-hidden="true"></i><br>
        <span id="${countdownId}">--:--:--</span>
      </div>
    `
  }

  /**
   * @param {Object} game
   * @returns {string}
   */
  _getGameLabel (game) {
    if (game.isCup && game.cupRound != null) {
      if (game.cupRound === 1) return t('cup.final')
      if (game.cupRound === 2) return t('cup.semiFinal')
      if (game.cupRound === 4) return t('cup.quarterFinal')
      if (game.cupRound === 8) return t('cup.roundOf16')
      const sequentialNumber = (game.totalRounds || 0) - Math.log2(game.cupRound)
      return t('cup.roundNumber', { number: sequentialNumber })
    }
    return t('dashboard.gameDay', { gameDay: game.matchDay ?? game.gameDay + 1 })
  }

  /**
   * Start the countdown timer for all upcoming games with countdowns
   */
  _startCountdownTimer () {
    if (this._timerInterval) clearInterval(this._timerInterval)
    if (this._countdownElementIds.length === 0) return

    const tick = () => {
      let anyUpdated = false

      for (const {
        id,
        gameDate
      } of this._countdownElementIds) {
        const timerEl = el('#' + id)
        if (!timerEl) continue

        if (!gameDate) {
          timerEl.innerHTML = '--:--:--'
          continue
        }

        const diff = new Date(gameDate).getTime() - Date.now()

        if (diff < 0) {
          timerEl.innerHTML = t('dashboard.startingSoon')
          anyUpdated = true
          continue
        }

        const seconds = Math.floor(diff / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        const twoDigits = (v) => v < 10 ? '0' + v : v

        timerEl.innerHTML = `${twoDigits(hours)}:${twoDigits(minutes % 60)}:${twoDigits(seconds % 60)}`
        anyUpdated = true
      }

      // If no elements were updated, stop the timer
      if (!anyUpdated) {
        this._stopCountdownTimer()
      }
    }

    tick()
    this._timerInterval = setInterval(tick, 1000)
  }

  /**
   * Stop the countdown timer
   */
  _stopCountdownTimer () {
    if (this._timerInterval) {
      clearInterval(this._timerInterval)
      this._timerInterval = null
    }
  }

  /**
   * Navigate the slider by a given offset by smoothly scrolling the track.
   * @param {number} offset - Direction to move (-1 for prev, 1 for next)
   */
  _navigate (offset) {
    const newIndex = this._sliderIndex + offset
    if (newIndex < 0 || newIndex >= this._games.length) return
    this._goToSlide(newIndex)
  }

  /**
   * Jump to a specific slide. Uses the native scrolling track so the user
   * sees a smooth horizontal scroll instead of a jump cut.
   * @param {number} index - Target slide index
   */
  _goToSlide (index) {
    if (index < 0 || index >= this._games.length) return
    const slider = el('#' + this._sliderId)
    if (!slider) return
    const track = slider.querySelector('.game-slider-track')
    if (!track) return
    const slides = track.querySelectorAll('.game-slider-slide')
    const target = slides[index]
    if (!target) return
    track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' })
    // _setActiveIndex will run from the scroll listener once the scroll
    // settles, but pre-update indicator state right away so the click feels
    // responsive on slow devices.
    this._setActiveIndex(index)
  }

  /**
   * Update internal index + indicator / active classes + card gradient.
   * @param {number} index
   */
  _setActiveIndex (index) {
    if (index === this._sliderIndex) return
    this._sliderIndex = index

    const slider = el('#' + this._sliderId)
    if (!slider) return

    const slides = slider.querySelectorAll('.game-slider-slide')
    slides.forEach((slide, idx) => slide.classList.toggle('active', idx === index))

    const indicators = slider.querySelectorAll('.game-slider-indicator')
    indicators.forEach((indicator, idx) => indicator.classList.toggle('active', idx === index))

    this._updateCardGradient()
  }

  /**
   * Update the wrapper card's background gradient based on the active slide's team colors
   */
  _updateCardGradient () {
    if (!this._cardId) return
    const card = el('#' + this._cardId)
    if (!card) return
    const game = this._games[this._sliderIndex]
    if (!game) return
    const color2 = game.team1Data?.color || '#1a5f7a'
    const color1 = game.team2Data?.color || '#1a5f7a'
    card.style.setProperty('--color-left-25', color2 + 'ff')
    card.style.setProperty('--color-left-50', color2 + 'bb')
    card.style.setProperty('--color-right-25', color1 + 'ff')
    card.style.setProperty('--color-right-50', color1 + 'bb')
    card.style.background = 'transparent'
    card.classList.remove('card-gradient-animate')
    // Force reflow to restart animation
    void card.offsetWidth
    card.classList.add('card-gradient-animate')
  }

  /**
   * Wire up the native horizontal scroll-snap track:
   * - Position to the initial slide without animation.
   * - Listen for scroll events and recompute the active slide based on the
   *   nearest slide centre, so the indicators / gradient stay in sync as the
   *   user swipes.
   */
  _setupScrollSnap () {
    const slider = el('#' + this._sliderId)
    if (!slider) return
    const track = slider.querySelector('.game-slider-track')
    if (!track) return
    const slides = track.querySelectorAll('.game-slider-slide')
    const initial = slides[this._initialIndex]
    if (initial) {
      // Jump (no smooth scroll) so the first paint already shows the right slide.
      track.scrollLeft = initial.offsetLeft
    }
    let scrollTimer = null
    this._onScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer)
      // Debounce until the snap finishes, then read the centred slide.
      scrollTimer = setTimeout(() => {
        const trackRect = track.getBoundingClientRect()
        const trackCentre = trackRect.left + trackRect.width / 2
        let closestIdx = 0
        let closestDist = Infinity
        slides.forEach((slide, idx) => {
          const slideRect = slide.getBoundingClientRect()
          const slideCentre = slideRect.left + slideRect.width / 2
          const dist = Math.abs(slideCentre - trackCentre)
          if (dist < closestDist) {
            closestDist = dist
            closestIdx = idx
          }
        })
        this._setActiveIndex(closestIdx)
      }, 80)
    }
    track.addEventListener('scroll', this._onScroll, { passive: true })
    this._scrollTrackRef = track
  }

  _teardownScrollSnap () {
    if (this._scrollTrackRef && this._onScroll) {
      this._scrollTrackRef.removeEventListener('scroll', this._onScroll)
    }
    this._scrollTrackRef = null
    this._onScroll = null
  }
}
