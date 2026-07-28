import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getHeadToHead: vi.fn()
  }
}))

vi.mock('../../i18n/index.js', () => ({
  t: (key) => key
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<span class="emblem"></span>')
}))

const { showHeadToHeadOverlay } = await import('../../partials/headToHeadOverlay.js')
const { server } = await import('../../lib/gateway.js')

const teamA = { id: 1, name: 'FC A', shortName: 'A', emblem: 'e', color: '#fff', level: 1, league: 0 }
const teamB = { id: 2, name: 'FC B', shortName: 'B', emblem: 'e', color: '#000', level: 1, league: 0 }

function buildData (overrides = {}) {
  return {
    teamA,
    teamB,
    games: [
      // league, A home, A wins 2:1
      { id: 11, season: 3, gameType: 'league', team1Id: 1, goalsTeam1: 2, goalsTeam2: 1 },
      // cup, B home, draw 0:0 (A is team2)
      { id: 12, season: 3, gameType: 'cup', team1Id: 2, goalsTeam1: 0, goalsTeam2: 0 },
      // friendly, A home, A wins 5:0
      { id: 13, season: 2, gameType: 'friendly', team1Id: 1, goalsTeam1: 5, goalsTeam2: 0 }
    ],
    // server-provided stats are intentionally ignored by the overlay (recomputed client-side)
    stats: { winsA: 99, winsB: 99, draws: 99, goalsA: 99, goalsB: 99, totalGames: 99 },
    ...overrides
  }
}

function tableRowCount () {
  return document.querySelectorAll('.head-to-head-table tbody tr').length
}

describe('showHeadToHeadOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('hides friendlies by default and computes the record from non-friendly games only', async () => {
    server.getHeadToHead.mockResolvedValueOnce(buildData())
    await showHeadToHeadOverlay(1, 2)

    // Only league + cup rows are visible
    expect(tableRowCount()).toBe(2)
    expect(document.body.innerHTML).not.toContain('friendly.title')

    // Record excludes the friendly win: 1 win, 1 draw, 0 losses, goals 2:1
    expect(document.querySelector('.head-to-head-wins').textContent.trim()).toBe('1')
    expect(document.querySelector('.head-to-head-draws').textContent.trim()).toBe('1')
    expect(document.querySelector('.head-to-head-losses').textContent.trim()).toBe('0')
    const goals = document.querySelector('.head-to-head-goals').textContent
    expect(goals).toContain('2')
    expect(goals).toContain('1')
  })

  it('renders a toggle that reveals friendlies and updates the record', async () => {
    server.getHeadToHead.mockResolvedValueOnce(buildData())
    await showHeadToHeadOverlay(1, 2)

    const toggle = document.querySelector('.head-to-head-toggle input[type="checkbox"]')
    expect(toggle).not.toBeNull()
    expect(toggle.checked).toBe(false)

    // Turn the toggle on
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))

    // Friendly row now visible → 3 rows and the friendly type label present
    expect(tableRowCount()).toBe(3)
    expect(document.body.innerHTML).toContain('friendly.title')

    // Record now includes the 5:0 friendly win: 2 wins, 1 draw, 0 losses, goals 7:1
    expect(document.querySelector('.head-to-head-wins').textContent.trim()).toBe('2')
    expect(document.querySelector('.head-to-head-draws').textContent.trim()).toBe('1')
    expect(document.querySelector('.head-to-head-losses').textContent.trim()).toBe('0')
    const goals = document.querySelector('.head-to-head-goals').textContent
    expect(goals).toContain('7')
  })

  it('does not render a toggle when there are no friendlies', async () => {
    server.getHeadToHead.mockResolvedValueOnce(buildData({
      games: [
        { id: 11, season: 3, gameType: 'league', team1Id: 1, goalsTeam1: 2, goalsTeam2: 1 }
      ]
    }))
    await showHeadToHeadOverlay(1, 2)

    expect(document.querySelector('.head-to-head-toggle')).toBeNull()
    expect(tableRowCount()).toBe(1)
  })
})
