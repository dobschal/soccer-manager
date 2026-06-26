import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock heavy dependencies so we can construct ATeamPage in isolation and
// exercise its event handling without rendering the lineup pitch etc.
vi.mock('../../../lib/gateway.js', () => ({
  server: {},
  showServerError: vi.fn()
}))

vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

const { ATeamPage } = await import('../../../pages/my-team/aTeam.js')

/**
 * @param {object[]} players
 * @returns {{ data: { players: object[], team: object }, season: number }}
 */
function makeParent (players) {
  return {
    data: { players, team: { id: 1, formation: '4-4-2', captain_id: null } },
    season: 0
  }
}

describe('ATeamPage player-updated handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches level/freshness and re-renders when a player-updated event fires', () => {
    const players = [{ id: 5, name: 'Hans', level: 50, freshness: 0.2 }]
    const page = new ATeamPage(makeParent(players))
    const updateSpy = vi.spyOn(page, 'update').mockImplementation(() => {})

    window.addEventListener('player-updated', page._onPlayerUpdated)

    window.dispatchEvent(new CustomEvent('player-updated', {
      detail: { player: { id: 5, level: 51, freshness: 1.0 } }
    }))

    expect(players[0].level).toBe(51)
    expect(players[0].freshness).toBe(1.0)
    expect(updateSpy).toHaveBeenCalled()

    window.removeEventListener('player-updated', page._onPlayerUpdated)
    page.onDestroy()
  })

  it('ignores events for players not in the squad', () => {
    const players = [{ id: 5, name: 'Hans', level: 50, freshness: 0.2 }]
    const page = new ATeamPage(makeParent(players))
    const updateSpy = vi.spyOn(page, 'update').mockImplementation(() => {})

    page._onPlayerUpdated(new CustomEvent('player-updated', {
      detail: { player: { id: 999, level: 80, freshness: 1.0 } }
    }))

    expect(players[0].level).toBe(50)
    expect(updateSpy).not.toHaveBeenCalled()
    page.onDestroy()
  })
})
