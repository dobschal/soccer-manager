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

  it('links upcoming league games to the league results page', () => {
    const upcomingLeagueGame = {
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

    const slider = new GameSlider({ games: [upcomingLeagueGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('href="#results"')
    expect(html).not.toContain('game_id=')
  })

  it('links upcoming cup games to the cup sub-page', () => {
    const upcomingCupGame = {
      id: 4,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      isCup: true,
      cupRound: 8,
      totalRounds: 7,
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [upcomingCupGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('href="#results?sub_page=cup"')
    expect(html).not.toContain('game_id=')
  })

  it('links upcoming friendly games to the friendly sub-page', () => {
    const upcomingFriendlyGame = {
      id: 5,
      team1Id: 42,
      team2Id: 99,
      team1: 'My Team',
      team2: 'Other Team',
      team1Data: { name: 'My Team' },
      team2Data: { name: 'Other Team' },
      isPlayed: false,
      game_type: 'friendly',
      gameDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    }

    const slider = new GameSlider({ games: [upcomingFriendlyGame], teamId: 42 })
    const html = slider.template

    expect(html).toContain('href="#results?sub_page=friendly"')
    expect(html).not.toContain('game_id=')
  })
})
