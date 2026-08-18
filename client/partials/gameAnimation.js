import { UIElement } from '../lib/UIElement.js'
import { renderPlayerImage } from './playerImage.js'
import { el, generateId } from '../lib/html.js'
import { delay } from '../lib/delay.js'

// The formation is drawn on a 2:1 pitch that spans the full modal width, so
// the players have to shrink with the viewport instead of being pinned to a
// fixed pixel size (which used to overlap on phones and look tiny on desktop).
const PLAYER_SIZE_RATIO = 0.085
const PLAYER_SIZE_MIN = 34
const PLAYER_SIZE_MAX = 60

// The modal itself stops growing at 1100px (see overlay.css), so above that
// width the pitch no longer gets bigger either. Between the phone/tablet range
// and that cap the players grow a bit further so they don't look lost on a
// desktop screen — narrower viewports keep the sizes they had before.
const WIDE_SCREEN_MIN_WIDTH = 900
const WIDE_SCREEN_MAX_WIDTH = 1100
const WIDE_PLAYER_SIZE_MAX = 72

/**
 * Size (px) of a player image/name for a given screen width.
 * @param {number} viewportWidth
 * @returns {number}
 */
export function playerSizeForWidth (viewportWidth) {
  const width = Number(viewportWidth) || 0
  if (width > WIDE_SCREEN_MIN_WIDTH) {
    const progress = Math.min(1, (width - WIDE_SCREEN_MIN_WIDTH) / (WIDE_SCREEN_MAX_WIDTH - WIDE_SCREEN_MIN_WIDTH))
    return Math.round(PLAYER_SIZE_MAX + (WIDE_PLAYER_SIZE_MAX - PLAYER_SIZE_MAX) * progress)
  }
  const size = width * PLAYER_SIZE_RATIO
  return Math.round(Math.min(PLAYER_SIZE_MAX, Math.max(PLAYER_SIZE_MIN, size)))
}

export class GameAnimation extends UIElement {
  /**
   * @param {GameResultType} game
   * @param {TeamType} team1
   * @param {TeamType} team2
   */
  constructor (game, team1, team2) {
    super()
    this.game = game
    this.team1 = team1
    this.team2 = team2
    this.details = JSON.parse(game.details)
    /** @type {PlayerType[]} */
    this.playerTeamA = this.details.playerTeamA
    /** @type {PlayerType[]} */
    this.playerTeamB = this.details.playerTeamB
    // Only starters are shown in the formation. Substitutes are pushed into
    // playerTeamA/B during the match with enterMinute > 0; starters have
    // enterMinute === 0 (set in play-game-day.js before kickoff).
    /** @type {PlayerType[]} */
    this.startersTeamA = this.playerTeamA.filter(p => !p.enterMinute)
    /** @type {PlayerType[]} */
    this.startersTeamB = this.playerTeamB.filter(p => !p.enterMinute)
  }
  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="game-animation">
        <div class="play-button">
          <i class="fa fa-play text-white" aria-hidden="true"></i>
        </div>
        ${this.startersTeamA.map(p => this._renderTeamPlayer(p, this.team1, 'home')).join('')}
        ${this.startersTeamB.map(p => this._renderTeamPlayer(p, this.team2, 'away')).join('')}
      </div>
    `
  }
  /**
   * @returns {void}
   */
  onMounted () {
    this._applyPlayerSize()
    this._applyPositionHacks()
    this._loadPlayerImages()
    this._attachPlayButtonHandler()
    window.addEventListener('resize', this._onResize)
  }
  /**
   * @returns {void}
   */
  onDestroy () {
    this.isPlaying = false
    window.removeEventListener('resize', this._onResize)
    clearTimeout(this._resizeTimerId)
  }
  isPlaying = false

  _timerId = null

  _ballId = null
  _messageId = null

  _playerSize = PLAYER_SIZE_MIN
  _resizeTimerId = null

  /**
   * Recalculate the player size when the screen width changes (e.g. an
   * orientation change on mobile) and redraw the images at the new size.
   * @returns {void}
   */
  _onResize = () => {
    clearTimeout(this._resizeTimerId)
    this._resizeTimerId = setTimeout(() => {
      const previousSize = this._playerSize
      this._applyPlayerSize()
      if (this._playerSize !== previousSize) this._loadPlayerImages()
    }, 200)
  }

  /**
   * Writes the calculated size as a CSS custom property so name, image and
   * ball all scale from a single value.
   * @returns {void}
   */
  _applyPlayerSize () {
    this._playerSize = playerSizeForWidth(typeof window === 'undefined' ? 0 : window.innerWidth)
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    // Dynamic value computed at runtime, hence an inline style.
    gameEl?.style.setProperty('--ga-player-size', `${this._playerSize}px`)
  }

  /**
   * @returns {void}
   */
  _applyPositionHacks () {
    setTimeout(() => {
      const selectors = ['.player.home.CM', '.player.home.CD', '.player.home.DM', '.player.away.CM', '.player.away.CD', '.player.away.DM']
      selectors.forEach(positionClass => {
        const elements = document.querySelectorAll(`${this._elementQuery} ${positionClass}`)
        if (elements.length === 2) {
          elements.item(0).style.top = '38%'
          elements.item(1).style.top = '62%'
        }
        if (elements.length === 3) {
          elements.item(0).style.top = '38%'
          elements.item(1).style.top = '50%'
          elements.item(2).style.top = '62%'
        }
      })
    }, 1000)
  }

  /**
   * @returns {void}
   */
  _loadPlayerImages () {
    const loadImages = (players, team, type) => {
      const playerEls = document.querySelectorAll(`${this._elementQuery} .player.${type}`)
      players.forEach((player, index) => {
        renderPlayerImage(player, team, this._playerSize)
          .then(image => {
            const playerEl = playerEls[index]
            if (playerEl) {
              playerEl.querySelector('.player-image')?.remove()
              playerEl.insertAdjacentHTML('afterbegin', image)
              setTimeout(() => playerEl.classList.add(player.in_game_position), 500)
            }
          })
          .catch(() => console.error('Could not load player image'))
      })
    }

    loadImages(this.startersTeamA, this.team1, 'home')
    loadImages(this.startersTeamB, this.team2, 'away')
  }

  /**
   * @returns {void}
   */
  _attachPlayButtonHandler () {
    const playBtn = el(`${this._elementQuery} .play-button`)
    if (playBtn) {
      playBtn.addEventListener('click', async () => {
        this.isPlaying = !this.isPlaying
        if (this.isPlaying) {
          playBtn.innerHTML = '<i class="fa fa-pause text-white" aria-hidden="true"></i>'
          await this._playGameAnimation()
          if (playBtn) playBtn.innerHTML = '<i class="fa fa-play text-white" aria-hidden="true"></i>'
        } else {
          playBtn.innerHTML = '<i class="fa fa-play text-white" aria-hidden="true"></i>'
        }
      })
    }
  }

  /**
   * @param {PlayerType} player
   * @param {TeamType} team
   * @param {string} type
   * @returns {string}
   */
  _renderTeamPlayer (player, team, type) {
    const freshnessClass = player.freshness < 0.4 ? 'text-danger' : (player.freshness < 0.7 ? 'text-warning' : '')
    return `
      <div class="player ${type} ${freshnessClass}">
        ${player.name.split(' ')[1]}
      </div>
    `
  }

  /**
   * @returns {Promise<void>}
   */
  async _playGameAnimation () {
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    if (!gameEl) return

    gameEl.classList.add('play')
    this._timerId = this._createTimer()
    this._ballId = this._createBall()
    this._messageId = this._createMessage()

    const items = this.details.log
    let i = 0
    let goalsTeamA = 0
    let goalsTeamB = 0

    for (const item of items) {
      if (!this.isPlaying) {
        this._endAnimation()
        return
      }

      i++
      const messageEl = el(this._messageId)
      const timerEl = el(this._timerId)
      if (!messageEl || !timerEl) return
      messageEl.innerHTML = `${goalsTeamA} : ${goalsTeamB}`
      timerEl.innerHTML = `'${Math.floor(i / 10)}`

      if (item.goal) {
        const isTeamAGoal = this.playerTeamA.some(p => p.id === item.player)
        gameEl.style.boxShadow = `0 0 10px 10px ${isTeamAGoal ? this.team1.color : this.team2.color}`

        for (let j = Math.max(0, i - 5); j < i; j++) {
          if (!this.isPlaying) {
            this._endAnimation()
            return
          }
          const item2 = items[j]
          if (item2.pass && this._inSameTeam(item2.newPlayer, item.player)) {
            await this._moveBallToPlayer(item2.newPlayer)
          }
        }

        await this._moveBallToPlayer(item.player)
        const msgEl1 = el(this._messageId)
        if (msgEl1) msgEl1.innerHTML = `${this._getPlayerName(item.player)} shoots...`
        await delay(1000)

        const ballEl1 = el(this._ballId)
        if (ballEl1) {
          if (isTeamAGoal) {
            ballEl1.className = 'ball away GK'
            goalsTeamA++
          } else {
            ballEl1.className = 'ball home GK'
            goalsTeamB++
          }
        }

        const msgEl2 = el(this._messageId)
        if (msgEl2) msgEl2.innerHTML = 'GOAL!!!'
        await delay(1000)
      }

      if (item.keeperHolds && item.player) {
        const isTeamAShot = this.playerTeamA.some(p => p.id === item.player)
        gameEl.style.boxShadow = `0 0 10px 10px ${isTeamAShot ? this.team1.color : this.team2.color}`

        for (let j = Math.max(0, i - 5); j < i; j++) {
          if (!this.isPlaying) {
            this._endAnimation()
            return
          }
          const item2 = items[j]
          if (item2.pass && this._inSameTeam(item2.newPlayer, item.player)) {
            await this._moveBallToPlayer(item2.newPlayer)
          }
        }

        await this._moveBallToPlayer(item.player)
        const msgEl3 = el(this._messageId)
        if (msgEl3) msgEl3.innerHTML = `${this._getPlayerName(item.player)} shoots...`
        await delay(500)

        const ballEl2 = el(this._ballId)
        if (ballEl2) ballEl2.className = isTeamAShot ? 'ball away GK' : 'ball home GK'
        const msgEl4 = el(this._messageId)
        if (msgEl4) msgEl4.innerHTML = 'No goal...'
        await delay(500)
      }
    }

    this.isPlaying = false
    this._endAnimation()
  }

  /**
   * @param {number} playerId
   * @returns {string}
   */
  _getPlayerName (playerId) {
    let player = this.playerTeamA.find(p => p.id === playerId)
    if (!player) player = this.playerTeamB.find(p => p.id === playerId)
    return player.name.split(' ')[1]
  }

  /**
   * @param {number} playerId1
   * @param {number} playerId2
   * @returns {boolean}
   */
  _inSameTeam (playerId1, playerId2) {
    const p1InA = this.playerTeamA.some(p => p.id === playerId1)
    const p2InA = this.playerTeamA.some(p => p.id === playerId2)
    const p1InB = this.playerTeamB.some(p => p.id === playerId1)
    const p2InB = this.playerTeamB.some(p => p.id === playerId2)
    return (p1InA && p2InA) || (p1InB && p2InB)
  }

  /**
   * @param {number} playerId
   * @returns {Promise<void>}
   */
  async _moveBallToPlayer (playerId) {
    const ballEl = el(this._ballId)
    if (!ballEl) return
    let player = this.playerTeamA.find(p => p.id === playerId)
    if (player) {
      ballEl.className = 'ball home ' + player.position
    } else {
      player = this.playerTeamB.find(p => p.id === playerId)
      if (player) {
        ballEl.className = 'ball away ' + player.position
      }
    }
    await delay(500)
  }

  /**
   * @returns {string}
   */
  _createBall () {
    const id = generateId()
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    gameEl?.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="ball">
        <img src="./assets/ball.svg" alt="ball"/>
      </div>
    `)
    return id
  }

  /**
   * @returns {string}
   */
  _createTimer () {
    const id = generateId()
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    gameEl?.insertAdjacentHTML('beforeend', `<div id="${id}" class="timer">'0</div>`)
    return id
  }

  /**
   * @returns {string}
   */
  _createMessage () {
    const id = generateId()
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    gameEl?.insertAdjacentHTML('beforeend', `<div id="${id}" class="message">Kickoff!</div>`)
    return id
  }

  /**
   * @returns {void}
   */
  _endAnimation () {
    const gameEl = el(`${this._elementQuery} .game-animation`) || el(this._elementQuery)
    if (gameEl) {
      gameEl.classList.remove('play')
      gameEl.style.boxShadow = 'none'
    }
    el(this._timerId)?.remove()
    el(this._messageId)?.remove()
    el(this._ballId)?.remove()
  }
}

