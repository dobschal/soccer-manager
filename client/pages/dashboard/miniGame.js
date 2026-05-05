import { UIElement } from '../../lib/UIElement.js'
import { server } from '../../lib/gateway.js'
import { t } from '../../i18n/index.js'
import { el } from '../../lib/html.js'
import { toast } from '../../partials/toast.js'

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 600
const PLAYER_WIDTH = 60
const PLAYER_HEIGHT = 60
const PLAYER_Y = FIELD_HEIGHT - PLAYER_HEIGHT - 20
const PLAYER_SPEED = 460
const ENEMY_SIZE = 40
const ENEMY_BASE_SPEED = 200
const ENEMY_SPAWN_BASE_MS = 1500
const ENEMY_SPAWN_MIN_MS = 400
const GOAL_WIDTH = 220
const GOAL_HEIGHT = 50
const GOAL_X = (FIELD_WIDTH - GOAL_WIDTH) / 2
const GOAL_Y = 10
const GOAL_KEEPER_HALF_WIDTH = 30
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

const ACTION_CARD_LABELS = {
  LEVEL_UP_PLAYER_40: 'actionCards.type.basicPromotion',
  LEVEL_UP_PLAYER_70: 'actionCards.type.epicAdvancement',
  LEVEL_UP_PLAYER_100: 'actionCards.type.legendaryMastery',
  FRESHNESS_5: 'actionCards.type.quickRecovery',
  FRESHNESS_10: 'actionCards.type.energyBoost',
  FRESHNESS_20: 'actionCards.type.fullRecovery',
  CHANGE_PLAYER_POSITION: 'actionCards.type.tacticalShift',
  NEW_YOUTH_PLAYER: 'actionCards.type.youthProspect',
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
          ${this.myBest != null ? `<span class="badge bg-secondary">${t('miniGame.personalBest', { score: this.myBest })}</span>` : ''}
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
          <button class="btn btn-outline-light mini-game-btn-left" type="button" aria-label="left">◀</button>
          <button class="btn btn-warning mini-game-btn-shoot" type="button" aria-label="shoot">⚽</button>
          <button class="btn btn-outline-light mini-game-btn-right" type="button" aria-label="right">▶</button>
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
    }
  }

  _tickEnemies (dt, ts, elapsed) {
    const speed = ENEMY_BASE_SPEED + Math.min(elapsed / 10000, 12) * 20
    const spawnInterval = Math.max(ENEMY_SPAWN_MIN_MS, ENEMY_SPAWN_BASE_MS - Math.floor(elapsed / 10000) * 50)
    if (ts >= this._nextEnemyAt) {
      const x = Math.random() * (FIELD_WIDTH - ENEMY_SIZE)
      this._enemies.push({ x, y: -ENEMY_SIZE, color: this._randomEnemyColor() })
      this._nextEnemyAt = ts + spawnInterval
    }
    for (const enemy of this._enemies) {
      enemy.y += speed * dt
    }
    this._enemies = this._enemies.filter(e => e.y < FIELD_HEIGHT + ENEMY_SIZE)

    const playerLeft = this._player.x
    const playerRight = this._player.x + PLAYER_WIDTH
    const playerTop = PLAYER_Y
    const playerBottom = PLAYER_Y + PLAYER_HEIGHT
    for (const enemy of this._enemies) {
      const eLeft = enemy.x
      const eRight = enemy.x + ENEMY_SIZE
      const eTop = enemy.y
      const eBottom = enemy.y + ENEMY_SIZE
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
      }
    }
  }

  _tryShoot () {
    if (this._state !== STATE_PLAYING) return
    if (!this._goal) return
    const aimingAtGoal = !this._shots.some(s => s.aimingAtGoal && !s.consumed)
    this._shots.push({
      x: this._player.x + PLAYER_WIDTH / 2,
      y: PLAYER_Y,
      aimingAtGoal,
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
            <div class="small">${t('miniGame.rewardClaimHint')}</div>
          </div>
        `
      } else if (response?.dailyRewardUsed) {
        rewardEl.innerHTML = `<div class="alert alert-info mb-0">${t('miniGame.rewardDailyUsed')}</div>`
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
      // Goalkeeper
      const kCenter = GOAL_X + GOAL_WIDTH / 2
      ctx.fillStyle = '#e02020'
      ctx.fillRect(kCenter - GOAL_KEEPER_HALF_WIDTH, GOAL_Y + 8, GOAL_KEEPER_HALF_WIDTH * 2, GOAL_HEIGHT - 16)
    }

    // Enemies
    for (const enemy of this._enemies) {
      ctx.fillStyle = enemy.color
      ctx.fillRect(enemy.x, enemy.y, ENEMY_SIZE, ENEMY_SIZE)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(enemy.x + 8, enemy.y + 12, ENEMY_SIZE - 16, 6)
    }

    // Shots
    ctx.fillStyle = '#ffeb3b'
    for (const shot of this._shots) {
      ctx.beginPath()
      ctx.arc(shot.x, shot.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Player
    ctx.fillStyle = '#ffd54f'
    ctx.fillRect(this._player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT)
    ctx.fillStyle = '#222'
    ctx.fillRect(this._player.x + 16, PLAYER_Y + 18, PLAYER_WIDTH - 32, 8)
    ctx.fillRect(this._player.x + 16, PLAYER_Y + 36, PLAYER_WIDTH - 32, 8)
  }

  _randomEnemyColor () {
    const colors = ['#1565c0', '#c62828', '#6a1b9a', '#2e7d32', '#ef6c00']
    return colors[Math.floor(Math.random() * colors.length)]
  }

  _renderLeaderboard (rows) {
    if (!rows || rows.length === 0) {
      return `<p class="text-muted small">${t('miniGame.leaderboardEmpty')}</p>`
    }
    return `
      <table class="table table-sm mini-game-leaderboard">
        <thead>
          <tr>
            <th class="mini-game-rank">#</th>
            <th>${t('miniGame.team')}</th>
            <th class="text-end">${t('miniGame.score')}</th>
            <th class="text-end">${t('miniGame.goals')}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${r.isMyTeam ? 'mini-game-row-mine' : ''}">
              <td>${i + 1}</td>
              <td>${escapeHtml(r.teamName ?? '')}</td>
              <td class="text-end">${r.score}</td>
              <td class="text-end">${r.goalsScored}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
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
