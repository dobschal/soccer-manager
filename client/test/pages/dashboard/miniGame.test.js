import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getMiniGameLeaderboard: vi.fn(),
    submitMiniGameScore: vi.fn()
  }
}))

vi.mock('../../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../lib/websocket.js', () => ({
  onServerEvent: vi.fn(),
  offServerEvent: vi.fn()
}))

vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))

vi.mock('../../../partials/cardClaimOverlay.js', () => ({
  showCardClaimOverlay: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: (key) => key
}))

const { MiniGame } = await import('../../../pages/dashboard/miniGame.js')

const FIELD_WIDTH = 800
const FIELD_HEIGHT = 600
const PLAYER_BOX = 60
const ENEMY_BOX = 60
const PLAYER_Y = FIELD_HEIGHT - PLAYER_BOX - 20

function makeGame () {
  const game = new MiniGame()
  game._state = 'playing'
  game._player = { x: FIELD_WIDTH / 2 - PLAYER_BOX / 2 }
  game._enemies = []
  game._startedAtTs = 0
  // Stub the game-over so we can detect it without running submission/IO.
  game._endGame = vi.fn(() => { game._state = 'over' })
  return game
}

describe('MiniGame collision hitbox', () => {
  it('does NOT trigger game-over when the enemy sprite box overlaps but the visible figure is still clear of the player', () => {
    const game = makeGame()
    // Enemy positioned so its sprite box (60x60) overlaps the player's sprite
    // box vertically, but its visible figure (shoulders top at 0.18*H, feet
    // bottom at 0.68*H) sits well above the player's visible figure (feet top
    // at 0.32*H, shoulders bottom at 0.82*H).
    // Place enemy bottom of box at PLAYER_Y + 10 -> enemy.y = PLAYER_Y + 10 - 60.
    game._enemies.push({
      x: game._player.x, // perfectly aligned horizontally
      y: PLAYER_Y + 10 - ENEMY_BOX,
      vx: 0,
      color: '#fff',
      stepPhase: 0
    })
    game._tickEnemies(0, 1000, 1000)
    expect(game._endGame).not.toHaveBeenCalled()
  })

  it('does NOT trigger game-over when enemy is laterally offset so only the empty padding overlaps', () => {
    const game = makeGame()
    // Enemy at the same y as the player but shifted right so the boxes overlap
    // by less than the combined horizontal padding (8% per side => 4.8px each,
    // so combined overlap up to ~9.6px is still empty padding).
    game._enemies.push({
      x: game._player.x + PLAYER_BOX - 6, // boxes overlap by 6px on the edges
      y: PLAYER_Y,
      vx: 0,
      color: '#fff',
      stepPhase: 0
    })
    game._tickEnemies(0, 1000, 1000)
    expect(game._endGame).not.toHaveBeenCalled()
  })

  it('DOES trigger game-over when the visible figures clearly overlap', () => {
    const game = makeGame()
    // Enemy directly on top of the player.
    game._enemies.push({
      x: game._player.x,
      y: PLAYER_Y,
      vx: 0,
      color: '#fff',
      stepPhase: 0
    })
    game._tickEnemies(0, 1000, 1000)
    expect(game._endGame).toHaveBeenCalledWith('collision')
  })
})

describe('MiniGame keyboard handling', () => {
  function installKeyHandlers (game) {
    // Re-create the same handlers onMounted() would attach, without needing a
    // canvas. Keep this in sync with miniGame.js onMounted().
    game._keyDown = (e) => {
      if (MiniGame._isEditableTarget(e.target)) return
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        game._tryShoot = game._tryShoot || vi.fn()
        game._tryShoot()
      }
    }
  }

  it('does NOT preventDefault on space when the user is typing in a textarea', () => {
    const game = new MiniGame()
    installKeyHandlers(game)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const evt = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    Object.defineProperty(evt, 'target', { value: textarea })
    game._keyDown(evt)
    expect(evt.defaultPrevented).toBe(false)
    textarea.remove()
  })

  it('does NOT preventDefault on space when the user is typing in an input', () => {
    const game = new MiniGame()
    installKeyHandlers(game)
    const input = document.createElement('input')
    document.body.appendChild(input)
    const evt = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    Object.defineProperty(evt, 'target', { value: input })
    game._keyDown(evt)
    expect(evt.defaultPrevented).toBe(false)
    input.remove()
  })

  it('DOES preventDefault on space when the focus is on a non-editable element', () => {
    const game = new MiniGame()
    installKeyHandlers(game)
    const div = document.createElement('div')
    document.body.appendChild(div)
    const evt = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true })
    Object.defineProperty(evt, 'target', { value: div })
    game._keyDown(evt)
    expect(evt.defaultPrevented).toBe(true)
    div.remove()
  })
})

describe('MiniGame leaderboard rendering', () => {
  it('renders the team name as a link to the team page and shows the manager username', () => {
    const game = new MiniGame()
    const html = game._renderLeaderboard([
      { teamId: 42, teamName: 'My FC', username: 'alice', score: 1200, goalsScored: 4, isMyTeam: false }
    ])
    expect(html).toContain('href="#team?id=42"')
    expect(html).toContain('My FC')
    expect(html).toContain('<td>alice</td>')
  })

  it('falls back to plain text when teamId or username are missing', () => {
    const game = new MiniGame()
    const html = game._renderLeaderboard([
      { teamId: null, teamName: 'Bot FC', username: null, score: 100, goalsScored: 0, isMyTeam: false }
    ])
    expect(html).not.toContain('href="#team?id=')
    expect(html).toContain('Bot FC')
    // username cell is empty but still rendered
    expect(html).toContain('<td></td>')
  })
})
