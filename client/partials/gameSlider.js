import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { t } from '../i18n/index.js'
import { renderGameResult } from './gameResult.js'
import { showGameModal } from './gameModal.js'

/**
 * Game slider component for displaying past and upcoming games
 */
export class GameSlider extends UIElement {
  _sliderId = generateId()
  _sliderIndex = 0
  _countdownElementIds = []
  _timerInterval = null

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

      const slideContent = renderGameResult({
        team1: game.team1Data,
        team2: game.team2Data,
        team1Name: game.team1 ?? '',
        team2Name: game.team2 ?? '',
        isTeam1Highlighted: isHomeGame,
        centerContent,
        href
      })

      return `
        <div id="${slideId}" class="game-slider-slide ${isActive ? 'active' : ''}" data-index="${index}">
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
    this._setupTouchSwipe()
    this._startCountdownTimer()
    this._updateCardGradient()
  }

  onDestroy () {
    this._stopCountdownTimer()
  }

  /**
   * Generate the center content for a game slide based on its state
   * @param {Object} game
   * @returns {string}
   */
  _generateCenterContent (game) {
    if (game.isPlayed) {
      // Played game: show game day and result
      return `
        <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay + 1 })}</small>
        <h3 class="mb-0"><span class="badge bg-info">${game.goalsTeam1 ?? '-'}:${game.goalsTeam2 ?? '-'}</span></h3>
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
        <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay + 1 })}</small>
        <div class="badge bg-secondary p-2 countdown-badge">
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
        <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay })}</small>
        <div class="badge bg-secondary p-2 countdown-badge">
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
      <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay + 1 })}</small>
      <div class="badge bg-secondary p-2 countdown-badge">
        <i class="fa fa-clock-o" aria-hidden="true"></i><br>
        <span id="${countdownId}">--:--:--</span>
      </div>
    `
  }

  /**
   * Start the countdown timer for all upcoming games with countdowns
   */
  _startCountdownTimer () {
    if (this._timerInterval) clearInterval(this._timerInterval)
    if (this._countdownElementIds.length === 0) return

    this._timerInterval = setInterval(() => {
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
    }, 1000)
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
   * Navigate the slider by a given offset
   * @param {number} offset - Direction to move (-1 for prev, 1 for next)
   */
  _navigate (offset) {
    const newIndex = this._sliderIndex + offset
    if (newIndex < 0 || newIndex >= this._games.length) return
    this._goToSlide(newIndex)
  }

  /**
   * Jump to a specific slide
   * @param {number} index - Target slide index
   */
  _goToSlide (index) {
    if (index < 0 || index >= this._games.length) return
    if (index === this._sliderIndex) return

    this._sliderIndex = index

    const slider = el('#' + this._sliderId)
    if (!slider) return

    // Update slides
    const slides = slider.querySelectorAll('.game-slider-slide')
    slides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === index)
    })

    // Update indicators
    const indicators = slider.querySelectorAll('.game-slider-indicator')
    indicators.forEach((indicator, idx) => {
      indicator.classList.toggle('active', idx === index)
    })

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
    card.style.background = `linear-gradient(-55deg, ${color1}25, ${color1}50 48.999%, ${color2}50 49%, ${color2}25)`
  }

  /**
   * Sets up touch swipe navigation for touch devices
   */
  _setupTouchSwipe () {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (!isTouchDevice) return

    const slider = el('#' + this._sliderId)
    if (!slider) return

    let touchStartX = 0
    let touchStartY = 0
    let touchEndX = 0
    let touchEndY = 0
    let touchStartTime = 0
    let touchTarget = null
    const swipeThreshold = 50
    const tapThreshold = 10 // Max movement for a tap
    const tapMaxDuration = 300 // Max duration in ms for a tap

    slider.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchEndX = touchStartX
      touchEndY = touchStartY
      touchStartTime = Date.now()
      touchTarget = e.target
    }, { passive: true })

    slider.addEventListener('touchmove', (e) => {
      touchEndX = e.touches[0].clientX
      touchEndY = e.touches[0].clientY
    }, { passive: true })

    slider.addEventListener('touchend', () => {
      const deltaX = touchEndX - touchStartX
      const deltaY = touchEndY - touchStartY
      const touchDuration = Date.now() - touchStartTime

      if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX < 0) {
          // Swipe left → next
          this._navigate(1)
        } else {
          // Swipe right → previous
          this._navigate(-1)
        }
      } else if (
        touchTarget &&
        Math.abs(deltaX) < tapThreshold &&
        Math.abs(deltaY) < tapThreshold &&
        touchDuration < tapMaxDuration
      ) {
        // It's a tap: small movement, short duration
        const link = touchTarget.closest('a[href]')
        if (link) {
          link.click()
          // Block the native click that browsers fire after a touch sequence,
          // to prevent the handler from running a second time.
          slider.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
          }, {
            once: true,
            capture: true
          })
        }
      }
      // Otherwise: scrolling or long press - do nothing

      touchStartX = 0
      touchStartY = 0
      touchEndX = 0
      touchEndY = 0
      touchStartTime = 0
      touchTarget = null
    }, { passive: true })
  }
}
