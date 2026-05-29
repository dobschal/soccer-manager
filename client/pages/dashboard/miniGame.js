import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { el } from '../../lib/html.js'
import { toast } from '../../partials/toast.js'
import { showCardClaimOverlay } from '../../partials/cardClaimOverlay.js'

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 600
const PLAYER_WIDTH = 60
const PLAYER_HEIGHT = 60
const PLAYER_Y = FIELD_HEIGHT - PLAYER_HEIGHT - 20
const PLAYER_SPEED = 460
const ENEMY_SIZE = 60
const ENEMY_BASE_SPEED = 200
// Hitboxes are tighter than the sprite box. The drawn figure (shoulders + feet)
// only fills ~84% of the box width and ~50% of the height; the rest is padding.
// Player faces up, so feet sit near the top of the box and shoulders near the
// bottom. Enemies face down, so it's the inverse.
const PLAYER_HIT_INSET_X = 0.08
const PLAYER_HIT_INSET_TOP = 0.32
const PLAYER_HIT_INSET_BOTTOM = 0.18
const ENEMY_HIT_INSET_X = 0.08
const ENEMY_HIT_INSET_TOP = 0.18
const ENEMY_HIT_INSET_BOTTOM = 0.32
const ENEMY_SPAWN_BASE_MS = 550
const ENEMY_SPAWN_MIN_MS = 200
const ENEMY_LATERAL_SPEED_MAX = 120
const GOAL_WIDTH = 220
const GOAL_HEIGHT = 50
const GOAL_X = (FIELD_WIDTH - GOAL_WIDTH) / 2
const GOAL_Y = 10
const GOAL_HIT_INNER_MARGIN = 30
const GOAL_HIT_OUTER_MARGIN = 100
const GOAL_INTERVAL_MS = 12000
const GOAL_VISIBLE_MS = 3500
const SHOT_SPEED = 720
const POINTS_PER_SECOND = 10
const POINTS_PER_GOAL = 500

const STATE_IDLE = 'idle'
const STATE_PLAYING = 'playing'
const STATE_OVER = 'over'

const HAIR_COLORS = ['#1a0e08', '#3c1f0f', '#6b3e1c', '#a67242', '#d4a857', '#e8c873', '#c14b1a', '#8a8a8a']

const ACTION_CARD_LABELS = {
  LEVEL_UP_PLAYER_40: 'actionCards.type.basicPromotion',
  LEVEL_UP_PLAYER_70: 'actionCards.type.epicAdvancement',
  LEVEL_UP_PLAYER_100: 'actionCards.type.legendaryMastery',
  FRESHNESS_5: 'actionCards.type.quickRecovery',
  FRESHNESS_10: 'actionCards.type.energyBoost',
  FRESHNESS_20: 'actionCards.type.fullRecovery',
  NEW_YOUTH_PLAYER_1: 'actionCards.type.youthProspect1',
  NEW_YOUTH_PLAYER_2: 'actionCards.type.youthProspect2',
  NEW_YOUTH_PLAYER_3: 'actionCards.type.youthProspect3',
  BONUS_100K: 'actionCards.type.cashBonus',
  STAR_PLAYER: 'actionCards.type.starPlayer',
  MOTIVATING_SPEECH: 'actionCards.type.motivatingSpeech'
}

export class MiniGame extends UIElement {
  async load () {
    try {
      const response = await server.getMiniGameLeaderboard()
      this.topAllTime = response.topAllTime || []
      this.topToday = response.topToday || []
      this.myBest = response.myBest
    } catch (e) {
      console.error('Failed to load mini-game leaderboard:', e)
      this.topAllTime = []
      this.topToday = []
      this.myBest = null
    }
  }

  get template () {
    return `
      <div class="mini-game mb-5">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h3 class="m-0">${t('miniGame.title')}</h3>
          ${this.myBest != null ? `<span class="badge bg-info">${t('miniGame.personalBest', { score: this.myBest })}</span>` : ''}
        </div>
        <p class="u-max-w-620">${t('miniGame.subtitle')}</p>

        <div class="mini-game-stage">
          <canvas class="mini-game-canvas" width="${FIELD_WIDTH}" height="${FIELD_HEIGHT}"></canvas>
          <div class="mini-game-hud">
            <span class="mini-game-score-label">${t('miniGame.score')}: <strong class="mini-game-score-value">0</strong></span>
            <span class="mini-game-score-label">${t('miniGame.goals')}: <strong class="mini-game-goals-value">0</strong></span>
          </div>
          <div class="mini-game-overlay mini-game-overlay-idle">
            <h4>${t('miniGame.startTitle')}</h4>
            <p>${t('miniGame.howToPlay')}</p>
            <button class="btn btn-primary mini-game-start">${t('miniGame.start')}</button>
          </div>
          <div class="mini-game-overlay mini-game-overlay-over hidden">
            <h4 class="mini-game-over-title">${t('miniGame.gameOver')}</h4>
            <p class="mini-game-over-text"></p>
            <div class="mini-game-reward"></div>
            <button class="btn btn-primary mini-game-restart">${t('miniGame.tryAgain')}</button>
          </div>
        </div>

        <div class="mini-game-controls">
          <button class="btn btn-dark mini-game-btn-left" type="button" aria-label="left">◀</button>
          <button class="btn btn-warning mini-game-btn-shoot" type="button" aria-label="shoot">⚽</button>
          <button class="btn btn-dark mini-game-btn-right" type="button" aria-label="right">▶</button>
        </div>

        <div class="row g-3 mt-3">
          <div class="col-12 col-md-6 mini-game-leaderboard-today">
            <h5>${t('miniGame.topToday')}</h5>
            ${this._renderLeaderboard(this.topToday)}
          </div>
          <div class="col-12 col-md-6 mini-game-leaderboard-all">
            <h5>${t('miniGame.topAllTime')}</h5>
            ${this._renderLeaderboard(this.topAllTime)}
          </div>
        </div>
      </div>
    `
  }

  get events () {
    return {
      '.mini-game-start': { click: () => this._startGame() },
      '.mini-game-restart': { click: () => this._startGame() },
      '.mini-game-btn-left': {
        pointerdown: () => { this._touchLeft = true },
        pointerup: () => { this._touchLeft = false },
        pointerleave: () => { this._touchLeft = false },
        pointercancel: () => { this._touchLeft = false }
      },
      '.mini-game-btn-right': {
        pointerdown: () => { this._touchRight = true },
        pointerup: () => { this._touchRight = false },
        pointerleave: () => { this._touchRight = false },
        pointercancel: () => { this._touchRight = false }
      },
      '.mini-game-btn-shoot': {
        click: () => this._tryShoot()
      }
    }
  }

  onMounted () {
    this._canvas = el(`${this._elementQuery} .mini-game-canvas`)
    if (!this._canvas) return
    this._ctx = this._canvas.getContext('2d')
    this._renderScene()
    this._keyDown = (e) => {
      if (MiniGame._isEditableTarget(e.target)) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this._keyLeft = true
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._keyRight = true
      else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        this._tryShoot()
      } else if ((e.key === 'Enter' || e.key === 'Return') && this._state !== STATE_PLAYING) {
        this._startGame()
      }
    }
    this._keyUp = (e) => {
      if (MiniGame._isEditableTarget(e.target)) return
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this._keyLeft = false
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this._keyRight = false
    }
    window.addEventListener('keydown', this._keyDown)
    window.addEventListener('keyup', this._keyUp)
  }

  onDestroy () {
    if (this._rafId) cancelAnimationFrame(this._rafId)
    if (this._keyDown) window.removeEventListener('keydown', this._keyDown)
    if (this._keyUp) window.removeEventListener('keyup', this._keyUp)
  }

  // The keydown listener lives on `window` and the router keeps old pages in
  // the DOM (hidden), so this instance can survive into other pages like the
  // forum. Skip the handler when the user is typing into an input/textarea
  // anywhere, otherwise `preventDefault()` on space would swallow real input.
  static _isEditableTarget (target) {
    if (!target) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return target.isContentEditable === true
  }

  topAllTime = []
  topToday = []
  myBest = null
  _canvas = null
  _ctx = null
  _state = STATE_IDLE
  _rafId = null
  _lastFrameTs = 0
  _startedAtTs = 0
  _player = { x: FIELD_WIDTH / 2 - PLAYER_WIDTH / 2 }
  _enemies = []
  _shots = []
  _goal = null
  _nextEnemyAt = 0
  _nextGoalAt = 0
  _score = 0
  _goalsScored = 0
  _keyLeft = false
  _keyRight = false
  _touchLeft = false
  _touchRight = false
  _submitting = false
  _hasBall = true
  _animTime = 0
  _playerStepTime = 0
  _playerHairColor = HAIR_COLORS[0]
  _keeperHairColor = HAIR_COLORS[0]

  _startGame () {
    if (this._state === STATE_PLAYING) return
    this._state = STATE_PLAYING
    this._startedAtTs = performance.now()
    this._lastFrameTs = this._startedAtTs
    this._player.x = FIELD_WIDTH / 2 - PLAYER_WIDTH / 2
    this._enemies = []
    this._shots = []
    this._goal = null
    this._nextEnemyAt = this._startedAtTs + ENEMY_SPAWN_BASE_MS
    this._nextGoalAt = this._startedAtTs + GOAL_INTERVAL_MS
    this._score = 0
    this._goalsScored = 0
    this._hasBall = true
    this._animTime = 0
    this._playerStepTime = 0
    this._playerHairColor = this._randomHairColor()
    this._keeperHairColor = this._randomHairColor()
    this._showOverlay('idle', false)
    this._showOverlay('over', false)
    this._updateHud()
    this._loop(this._startedAtTs)
  }

  _loop (ts) {
    if (this._state !== STATE_PLAYING) return
    const dt = Math.min(0.05, (ts - this._lastFrameTs) / 1000)
    this._lastFrameTs = ts
    const elapsed = ts - this._startedAtTs

    this._animTime += dt
    this._tickPlayer(dt)
    this._tickEnemies(dt, ts, elapsed)
    this._tickGoal(ts)
    this._tickShots(dt)
    this._score = Math.floor((elapsed / 1000) * POINTS_PER_SECOND) + this._goalsScored * POINTS_PER_GOAL
    this._updateHud()
    this._renderScene()

    if (this._state === STATE_PLAYING) {
      this._rafId = requestAnimationFrame((next) => this._loop(next))
    }
  }

  _tickPlayer (dt) {
    const dir = (this._keyLeft || this._touchLeft ? -1 : 0) + (this._keyRight || this._touchRight ? 1 : 0)
    if (dir !== 0) {
      this._player.x += dir * PLAYER_SPEED * dt
      this._player.x = Math.max(0, Math.min(FIELD_WIDTH - PLAYER_WIDTH, this._player.x))
      this._playerStepTime += dt
    }
  }

  _tickEnemies (dt, ts, elapsed) {
    const speed = ENEMY_BASE_SPEED + Math.min(elapsed / 10000, 12) * 20
    const spawnInterval = Math.max(ENEMY_SPAWN_MIN_MS, ENEMY_SPAWN_BASE_MS - Math.floor(elapsed / 10000) * 60)
    if (ts >= this._nextEnemyAt) {
      const x = Math.random() * (FIELD_WIDTH - ENEMY_SIZE)
      const vx = (Math.random() * 2 - 1) * ENEMY_LATERAL_SPEED_MAX
      const stepPhase = Math.random() * Math.PI * 2
      this._enemies.push({ x, y: -ENEMY_SIZE, vx, color: this._randomEnemyColor(), hairColor: this._randomHairColor(), stepPhase })
      this._nextEnemyAt = ts + spawnInterval
    }
    for (const enemy of this._enemies) {
      enemy.y += speed * dt
      enemy.x += enemy.vx * dt
      if (enemy.x < 0) {
        enemy.x = 0
        enemy.vx = Math.abs(enemy.vx)
      } else if (enemy.x > FIELD_WIDTH - ENEMY_SIZE) {
        enemy.x = FIELD_WIDTH - ENEMY_SIZE
        enemy.vx = -Math.abs(enemy.vx)
      }
    }
    this._enemies = this._enemies.filter(e => e.y < FIELD_HEIGHT + ENEMY_SIZE)

    const playerLeft = this._player.x + PLAYER_WIDTH * PLAYER_HIT_INSET_X
    const playerRight = this._player.x + PLAYER_WIDTH * (1 - PLAYER_HIT_INSET_X)
    const playerTop = PLAYER_Y + PLAYER_HEIGHT * PLAYER_HIT_INSET_TOP
    const playerBottom = PLAYER_Y + PLAYER_HEIGHT * (1 - PLAYER_HIT_INSET_BOTTOM)
    for (const enemy of this._enemies) {
      const eLeft = enemy.x + ENEMY_SIZE * ENEMY_HIT_INSET_X
      const eRight = enemy.x + ENEMY_SIZE * (1 - ENEMY_HIT_INSET_X)
      const eTop = enemy.y + ENEMY_SIZE * ENEMY_HIT_INSET_TOP
      const eBottom = enemy.y + ENEMY_SIZE * (1 - ENEMY_HIT_INSET_BOTTOM)
      if (eRight > playerLeft && eLeft < playerRight && eBottom > playerTop && eTop < playerBottom) {
        this._endGame('collision')
        return
      }
    }
  }

  _tickGoal (ts) {
    if (!this._goal && ts >= this._nextGoalAt) {
      this._goal = { appearedAt: ts, hit: false }
    }
    if (this._goal && ts - this._goal.appearedAt > GOAL_VISIBLE_MS) {
      const consumedShot = this._shots.find(s => s.aimingAtGoal)
      if (!consumedShot) {
        this._goal = null
        this._nextGoalAt = ts + GOAL_INTERVAL_MS
      }
    }
  }

  _tickShots (dt) {
    for (const shot of this._shots) {
      shot.y -= SHOT_SPEED * dt
    }
    this._shots = this._shots.filter(s => s.y > -20 && !s.consumed)

    if (!this._goal) return
    const goalLineY = GOAL_Y + GOAL_HEIGHT
    for (const shot of this._shots) {
      if (shot.consumed || !shot.aimingAtGoal) continue
      if (shot.y <= goalLineY) {
        const dx = shot.x - (GOAL_X + GOAL_WIDTH / 2)
        const absDx = Math.abs(dx)
        shot.consumed = true
        if (absDx < GOAL_HIT_INNER_MARGIN) {
          // Goalkeeper save
          this._endGame('save')
          return
        }
        if (absDx > GOAL_HIT_OUTER_MARGIN) {
          // Wide miss
          this._endGame('wide')
          return
        }
        // Goal!
        this._goalsScored += 1
        this._goal = null
        this._nextGoalAt = performance.now() + GOAL_INTERVAL_MS
        this._hasBall = true
      }
    }
  }

  _tryShoot () {
    if (this._state !== STATE_PLAYING) return
    if (!this._goal) return
    if (!this._hasBall) return
    this._hasBall = false
    // Start the shot from where the ball was sitting in front of the player's feet,
    // so it visually reads as the same ball flying off.
    this._shots.push({
      x: this._player.x + PLAYER_WIDTH / 2,
      y: PLAYER_Y + PLAYER_HEIGHT * 0.08,
      aimingAtGoal: true,
      consumed: false
    })
  }

  _endGame (reason) {
    if (this._state !== STATE_PLAYING) return
    this._state = STATE_OVER
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = null
    const durationMs = Math.round(performance.now() - this._startedAtTs)
    void this._submitScore(reason, durationMs)
  }

  async _submitScore (reason, durationMs) {
    if (this._submitting) return
    this._submitting = true
    let response = null
    try {
      response = await server.submitMiniGameScore(this._score, this._goalsScored, durationMs)
    } catch (e) {
      console.error('Failed to submit mini-game score:', e)
      toast(e.message ?? 'Score could not be saved', 'error')
    } finally {
      this._submitting = false
    }
    this._renderGameOver(reason, response)
    if (response?.awardedCard) {
      void showCardClaimOverlay([response.awardedCard])
    }
    void this._refreshLeaderboard()
  }

  async _refreshLeaderboard () {
    try {
      const response = await server.getMiniGameLeaderboard()
      this.topAllTime = response.topAllTime || []
      this.topToday = response.topToday || []
      this.myBest = response.myBest
      this._updateLeaderboardDom()
    } catch (e) {
      console.error('Failed to refresh leaderboard:', e)
    }
  }

  _renderGameOver (reason, response) {
    const titleEl = el(`${this._elementQuery} .mini-game-over-title`)
    const textEl = el(`${this._elementQuery} .mini-game-over-text`)
    const rewardEl = el(`${this._elementQuery} .mini-game-reward`)
    if (titleEl) titleEl.textContent = t(`miniGame.reason.${reason}`)
    if (textEl) {
      const lines = [t('miniGame.finalScore', { score: this._score, goals: this._goalsScored })]
      if (response?.leaderboardRank) {
        lines.push(t('miniGame.yourRank', { rank: response.leaderboardRank }))
      }
      if (response?.isPersonalBest) {
        lines.push(t('miniGame.personalBestNew'))
      }
      textEl.textContent = lines.join(' • ')
    }
    if (rewardEl) {
      if (response?.awardedCard) {
        const labelKey = ACTION_CARD_LABELS[response.awardedCard.action] || ''
        const label = labelKey ? t(labelKey) : response.awardedCard.action
        rewardEl.innerHTML = `
          <div class="alert alert-success mb-0">
            <strong>${t('miniGame.rewardWon')}</strong> ${label}
          </div>
        `
      } else if (response?.gameDayRewardUsed) {
        rewardEl.innerHTML = `<div class="alert alert-info mb-0">${t('miniGame.rewardGameDayUsed')}</div>`
      } else {
        rewardEl.innerHTML = `<div class="alert alert-secondary mb-0">${t('miniGame.rewardBlank')}</div>`
      }
    }
    this._showOverlay('over', true)
  }

  _showOverlay (kind, visible) {
    const overlay = el(`${this._elementQuery} .mini-game-overlay-${kind}`)
    if (!overlay) return
    if (visible) overlay.classList.remove('hidden')
    else overlay.classList.add('hidden')
  }

  _updateHud () {
    const scoreEl = el(`${this._elementQuery} .mini-game-score-value`)
    const goalsEl = el(`${this._elementQuery} .mini-game-goals-value`)
    if (scoreEl) scoreEl.textContent = this._score
    if (goalsEl) goalsEl.textContent = this._goalsScored
  }

  _updateLeaderboardDom () {
    const root = el(this._elementQuery)
    if (!root) return
    const todayCol = root.querySelector('.mini-game-leaderboard-today')
    const allCol = root.querySelector('.mini-game-leaderboard-all')
    if (todayCol) todayCol.innerHTML = `<h5>${t('miniGame.topToday')}</h5>${this._renderLeaderboard(this.topToday)}`
    if (allCol) allCol.innerHTML = `<h5>${t('miniGame.topAllTime')}</h5>${this._renderLeaderboard(this.topAllTime)}`
  }

  _renderScene () {
    if (!this._ctx) return
    const ctx = this._ctx
    ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT)
    // Pitch background
    ctx.fillStyle = '#1f6f3e'
    ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.strokeRect(20, 20, FIELD_WIDTH - 40, FIELD_HEIGHT - 40)
    ctx.beginPath()
    ctx.moveTo(20, FIELD_HEIGHT / 2)
    ctx.lineTo(FIELD_WIDTH - 20, FIELD_HEIGHT / 2)
    ctx.stroke()

    // Goal (only when active)
    if (this._goal) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(GOAL_X, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT)
      // Net stripes
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'
      ctx.lineWidth = 1
      for (let i = 1; i < 6; i++) {
        const x = GOAL_X + (GOAL_WIDTH / 6) * i
        ctx.beginPath()
        ctx.moveTo(x, GOAL_Y)
        ctx.lineTo(x, GOAL_Y + GOAL_HEIGHT)
        ctx.stroke()
      }
      // Goalkeeper — same figure as the field players, just standing on the goal line.
      const keeperSize = GOAL_HEIGHT - 4
      const keeperX = GOAL_X + GOAL_WIDTH / 2 - keeperSize / 2
      const keeperY = GOAL_Y + (GOAL_HEIGHT - keeperSize) / 2
      // Slow shuffle in place so the keeper looks alive.
      const keeperPhase = this._animTime * Math.PI * 3
      this._drawFigure(ctx, keeperX, keeperY, keeperSize, keeperSize, '#e02020', false, 'down', keeperPhase, this._keeperHairColor)
    }

    // Enemies (face down towards the player)
    const enemyStepBase = this._animTime * Math.PI * 7
    for (const enemy of this._enemies) {
      this._drawFigure(ctx, enemy.x, enemy.y, ENEMY_SIZE, ENEMY_SIZE, enemy.color, false, 'down', enemyStepBase + enemy.stepPhase, enemy.hairColor)
    }

    // Shots — same look as the ball at the player's feet, so it reads as the ball flying off
    for (const shot of this._shots) {
      this._drawBall(ctx, shot.x, shot.y, Math.max(7, PLAYER_WIDTH * 0.16))
    }

    // Player (faces up towards goal; ball at the feet unless it has just been kicked)
    const playerPhase = this._playerStepTime * Math.PI * 7
    this._drawFigure(ctx, this._player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT, '#ffd54f', this._hasBall, 'up', playerPhase, this._playerHairColor)
  }

  _drawFigure (ctx, x, y, width, height, jerseyColor, withBall, facing, walkPhase = 0, hairColor = '#3c1f0f') {
    const cx = x + width / 2
    const shoulderRx = width * 0.42
    const shoulderRy = height * 0.20
    const headRx = width * 0.16
    const headRy = height * 0.18
    const footOffset = width * 0.16
    const footRx = width * 0.11
    const footRy = height * 0.13
    const armOffset = width * 0.34
    const armRx = width * 0.08
    const armRy = height * 0.11
    const ballRadius = Math.max(7, width * 0.16)

    // Lay out shoulders/head and feet depending on facing direction.
    // Head sits in the centre of the shoulders (top-down view).
    const facingUp = facing === 'up'
    const bodyY = y + (facingUp ? height * 0.62 : height * 0.38)
    const feetY = y + (facingUp ? height * 0.45 : height * 0.55)
    const ballY = y + (facingUp ? height * 0.20 : height * 0.80)
    const stepAmp = height * 0.10
    const forwardSign = facingUp ? -1 : 1
    const leftStep = Math.sin(walkPhase) * stepAmp * forwardSign
    const rightStep = Math.sin(walkPhase + Math.PI) * stepAmp * forwardSign
    // Arms swing opposite to the corresponding leg (left arm back when left leg forward).
    const leftArmStep = -leftStep
    const rightArmStep = -rightStep

    // Feet first so the body covers the heels (gives a slight depth illusion)
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.ellipse(cx - footOffset, feetY + leftStep, footRx, footRy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + footOffset, feetY + rightStep, footRx, footRy, 0, 0, Math.PI * 2)
    ctx.fill()

    // Shoulders (wide jersey ellipse)
    ctx.fillStyle = jerseyColor
    ctx.beginPath()
    ctx.ellipse(cx, bodyY, shoulderRx, shoulderRy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Arms — sleeves at the shoulder edges, swinging forward/back opposite the legs
    ctx.fillStyle = jerseyColor
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(cx - armOffset, bodyY + leftArmStep, armRx, armRy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(cx + armOffset, bodyY + rightArmStep, armRx, armRy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Head — same y as shoulders, just smaller, so it appears centred between the shoulders
    ctx.fillStyle = '#f5cba7'
    ctx.beginPath()
    ctx.ellipse(cx, bodyY, headRx, headRy, 0, 0, Math.PI * 2)
    ctx.fill()

    // Hair — covers the head except for a forehead strip at the front of the face
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, bodyY, headRx, headRy, 0, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = hairColor
    const foreheadStrip = headRy * 0.6
    if (facingUp) {
      ctx.fillRect(cx - headRx - 1, bodyY - headRy + foreheadStrip, headRx * 2 + 2, headRy * 2 + 2)
    } else {
      ctx.fillRect(cx - headRx - 1, bodyY - headRy - 1, headRx * 2 + 2, headRy * 2 - foreheadStrip + 1)
    }
    ctx.restore()

    ctx.beginPath()
    ctx.ellipse(cx, bodyY, headRx, headRy, 0, 0, Math.PI * 2)
    ctx.strokeStyle = '#3a2a1a'
    ctx.lineWidth = 1
    ctx.stroke()

    if (!withBall) return

    this._drawBall(ctx, cx, ballY, ballRadius)
  }

  _drawBall (ctx, cx, cy, radius) {
    // White outer
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = Math.max(1, radius * 0.18)
    ctx.stroke()

    // Classic black-and-white pattern: a centred pentagon with five smaller pentagons
    // arranged around it, scaled to the ball's radius.
    ctx.fillStyle = '#1a1a1a'
    const centreR = radius * 0.32
    drawPentagon(ctx, cx, cy, centreR, -Math.PI / 2)
    const orbitR = radius * 0.6
    const patchR = radius * 0.22
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
      const px = cx + Math.cos(a) * orbitR
      const py = cy + Math.sin(a) * orbitR
      drawPentagon(ctx, px, py, patchR, a + Math.PI / 2)
    }
  }

  _randomEnemyColor () {
    const colors = ['#1565c0', '#c62828', '#6a1b9a', '#2e7d32', '#ef6c00']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  _randomHairColor () {
    return HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]
  }

  _renderLeaderboard (rows) {
    if (!rows || rows.length === 0) {
      return `<p class="text-muted small">${t('miniGame.leaderboardEmpty')}</p>`
    }
    return `
      <div class="table-responsive">
        <table class="table table-sm mini-game-leaderboard">
          <thead>
            <tr>
              <th class="mini-game-rank">#</th>
              <th>${t('miniGame.team')}</th>
              <th>${t('miniGame.manager')}</th>
              <th class="text-end">${t('miniGame.score')}</th>
              <th class="text-end">${t('miniGame.goals')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
    const teamName = escapeHtml(r.teamName ?? '')
    const teamCell = r.teamId
      ? `<a href="#team?id=${r.teamId}" class="text-info">${teamName}</a>`
      : teamName
    return `
              <tr class="${r.isMyTeam ? 'mini-game-row-mine' : ''}">
                <td>${i + 1}</td>
                <td>${teamCell}</td>
                <td>${escapeHtml(r.username ?? '')}</td>
                <td class="text-end">${r.score}</td>
                <td class="text-end">${r.goalsScored}</td>
              </tr>
            `
  }).join('')}
          </tbody>
        </table>
      </div>
    `
  }
}

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function drawPentagon (ctx, cx, cy, radius, rotation) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = rotation + (i / 5) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const y = cy + Math.sin(a) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}
