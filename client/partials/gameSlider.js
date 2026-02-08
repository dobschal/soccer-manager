import { UIElement } from '../lib/UIElement.js'
import { el, generateId } from '../lib/html.js'
import { onClick } from '../lib/htmlEventHandlers.js'
import { t } from '../i18n/index.js'
import { renderGameResult } from './gameResult.js'

/**
 * Game slider component for displaying past and upcoming games
 */
export class GameSlider extends UIElement {
  _sliderId = generateId()
  _sliderIndex = 0
  _countdownElementId = generateId()

  /**
   * @param {Object} options
   * @param {Array} options.games - Array of game objects with isPlayed, team1Data, team2Data, etc.
   * @param {number} options.teamId - Current user's team ID
   * @param {number} options.initialIndex - Index of the initially active slide
   */
  constructor ({ games = [], teamId, initialIndex = 0 }) {
    super()
    this._games = games
    this._teamId = teamId
    this._sliderIndex = initialIndex
    this._initialIndex = initialIndex
  }

  get template () {
    if (this._games.length === 0) {
      return ''
    }

    const prevBtnId = generateId()
    const nextBtnId = generateId()

    onClick('#' + prevBtnId, () => this._navigate(-1))
    onClick('#' + nextBtnId, () => this._navigate(1))

    const slides = this._games.map((game, index) => {
      const isHomeGame = game.team1Id === this._teamId
      const isActive = index === this._initialIndex

      let centerContent
      if (game.isPlayed) {
        centerContent = `
          <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay })}</small>
          <h3 class="mb-0"><span class="badge bg-info">${game.goalsTeam1 ?? '-'}:${game.goalsTeam2 ?? '-'}</span></h3>
        `
      } else {
        const countdownId = index === this._games.findIndex(g => !g.isPlayed) ? this._countdownElementId : generateId()
        centerContent = `
          <small class="d-block mb-1">${t('dashboard.gameDay', { gameDay: game.gameDay })}</small>
          <div class="badge bg-secondary p-2" style="font-size: 1.2rem;">
            <i class="fa fa-clock-o" aria-hidden="true"></i><br>
            <span id="${countdownId}">--:--:--</span>
          </div>
        `
      }

      const slideContent = renderGameResult({
        team1: game.team1Data,
        team2: game.team2Data,
        team1Name: game.team1 ?? '',
        team2Name: game.team2 ?? '',
        isTeam1Highlighted: isHomeGame,
        centerContent,
        href: game.isPlayed ? `#results?game_id=${game.id}` : undefined
      })

      return `
        <div class="game-slider-slide ${isActive ? 'active' : ''}" data-index="${index}">
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
  }

  /**
   * Get the countdown element ID for external timer setup
   * @returns {string}
   */
  getCountdownElementId () {
    return this._countdownElementId
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
    let touchEndX = 0
    const swipeThreshold = 50

    slider.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX
    }, { passive: true })

    slider.addEventListener('touchmove', (e) => {
      touchEndX = e.touches[0].clientX
    }, { passive: true })

    slider.addEventListener('touchend', () => {
      const deltaX = touchEndX - touchStartX

      if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX < 0) {
          // Swipe left → next
          this._navigate(1)
        } else {
          // Swipe right → previous
          this._navigate(-1)
        }
      }

      touchStartX = 0
      touchEndX = 0
    }, { passive: true })
  }
}
