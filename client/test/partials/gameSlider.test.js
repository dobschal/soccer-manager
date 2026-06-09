import { describe, it, expect, vi } from 'vitest'

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

import { GameSlider } from '../../partials/gameSlider.js'

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
})
