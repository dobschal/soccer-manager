import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg class="emblem"></svg>')
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../partials/gameModal.js', () => ({
  showGameModal: vi.fn()
}))

vi.mock('../../partials/headToHeadOverlay.js', () => ({
  showHeadToHeadOverlay: vi.fn()
}))

import { GameSlider } from '../../partials/gameSlider.js'
import { showGameModal } from '../../partials/gameModal.js'
import { showHeadToHeadOverlay } from '../../partials/headToHeadOverlay.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GameSlider', () => {
  it('shows "-" instead of 0:0 for cup byes', () => {
    const byeGame = {
      id: 1,
      team1Id: 42,
      team2Id: null,
      team1: 'My Team',
      team1Data: { name: 'My Team' },
      team2Data: {},
      goalsTeam1: 0,
      goalsTeam2: 0,
      isPlayed: true,
      isCup: true,
      cupRound: 64,
      totalRounds: 7,
      playedAt: null
    }

    const slider = new GameSlider({ games: [byeGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('<span class="badge bg-info">-</span>')
    expect(html).not.toContain('0:0')
  })

  it('shows the score for played non-bye cup games', () => {
    const playedGame = {
      id: 2,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      goalsTeam1: 3,
      goalsTeam2: 1,
      isPlayed: true,
      isCup: true,
      cupRound: 32,
      totalRounds: 7,
      playedAt: null
    }

    const slider = new GameSlider({ games: [playedGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('<span class="badge bg-info">3:1</span>')
  })

  it('links each team column to its team page', () => {
    const game = {
      id: 3,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [game], teamId: 42 })
    const html = slider.template

    // Team columns navigate to the respective team pages.
    expect(html).toContain('href="#team?id=42"')
    expect(html).toContain('href="#team?id=99"')
    // The center no longer links anywhere (it opens a modal/overlay via JS).
    expect(html).not.toContain('game_id=')
    expect(html).not.toContain('href="#results')
  })

  it('opens the game-details modal when the center of a played game is clicked', () => {
    const playedGame = {
      id: 7,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      goalsTeam1: 2,
      goalsTeam2: 0,
      isPlayed: true,
      playedAt: null
    }

    const slider = new GameSlider({ games: [playedGame], teamId: 42 })
    slider._handleCenterClick(playedGame, false)

    expect(showGameModal).toHaveBeenCalledWith(7)
    expect(showHeadToHeadOverlay).not.toHaveBeenCalled()
  })

  it('opens the head-to-head overlay when the center of an upcoming game is clicked', () => {
    const upcomingGame = {
      id: 8,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [upcomingGame], teamId: 42 })
    slider._handleCenterClick(upcomingGame, false)

    expect(showHeadToHeadOverlay).toHaveBeenCalledWith(42, 99)
  })
})
