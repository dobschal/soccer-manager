import { UIElement } from '../lib/UIElement.js'
import { renderPlayerImage } from './playerImage.js'
import { el, generateId } from '../lib/html.js'
import { delay } from '../lib/delay.js'

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
  }
  /**
   * @returns {void}
   */
  onMounted () {
    this._applyPositionHacks()
    this._loadPlayerImages()
    this._attachPlayButtonHandler()
  }
  /**
   * @returns {void}
   */
  onDestroy () {
    this.isPlaying = false
  }
  isPlaying = false

  _timerId = null

  _ballId = null
  _messageId = null

  /**
   * @returns {string}
   */
  get template () {
    return `
      <div class="game-animation">
        <div class="play-button">
          <i class="fa fa-play text-white" aria-hidden="true"></i>
        </div>
        ${this.playerTeamA.map(p => this._renderTeamPlayer(p, this.team1, 'home')).join('')}
        ${this.playerTeamB.map(p => this._renderTeamPlayer(p, this.team2, 'away')).join('')}
      </div>
    `
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
        renderPlayerImage(player, team, 50)
          .then(image => {
            const playerEl = playerEls[index]
            if (playerEl) {
              playerEl.insertAdjacentHTML('afterbegin', image)
              setTimeout(() => playerEl.classList.add(player.in_game_position), 500)
            }
          })
          .catch(() => console.error('Could not load player image'))
      })
    }

    loadImages(this.playerTeamA, this.team1, 'home')
    loadImages(this.playerTeamB, this.team2, 'away')
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

