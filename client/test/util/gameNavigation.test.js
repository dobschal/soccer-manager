import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn()
}))

vi.mock('../../partials/headToHeadOverlay.js', () => ({
  showHeadToHeadOverlay: vi.fn()
}))

import { goToTeamPage, openGameCenter } from '../../util/gameNavigation.js'
import { goTo, setQueryParams } from '../../lib/router.js'
import { showHeadToHeadOverlay } from '../../partials/headToHeadOverlay.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('goToTeamPage', () => {
  it('navigates to the team page for a valid id', () => {
    goToTeamPage(42)
    expect(goTo).toHaveBeenCalledWith('team?id=42')
  })

  it('is a no-op when the id is missing', () => {
    goToTeamPage(undefined)
    goToTeamPage(null)
    expect(goTo).not.toHaveBeenCalled()
  })
})

describe('openGameCenter', () => {
  it('opens the game-details modal (via game_id) for played games', () => {
    openGameCenter({ isPlayed: true, id: 7, team1Id: 1, team2Id: 2 })
    expect(setQueryParams).toHaveBeenCalledWith({ game_id: 7 })
    expect(showHeadToHeadOverlay).not.toHaveBeenCalled()
  })

  it('opens the head-to-head overlay for upcoming games', () => {
    openGameCenter({ isPlayed: false, team1Id: 1, team2Id: 2 })
    expect(showHeadToHeadOverlay).toHaveBeenCalledWith(1, 2)
    expect(setQueryParams).not.toHaveBeenCalled()
  })

  it('does nothing for an upcoming game with an unknown opponent', () => {
    openGameCenter({ isPlayed: false, team1Id: 1 })
    expect(showHeadToHeadOverlay).not.toHaveBeenCalled()
    expect(setQueryParams).not.toHaveBeenCalled()
  })
})
