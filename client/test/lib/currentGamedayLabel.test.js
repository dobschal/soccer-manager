import { describe, it, expect, vi } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => {
    const dict = {
      'cup.final': 'Final',
      'cup.semiFinal': 'Semi-Final',
      'cup.quarterFinal': 'Quarter-Final',
      'cup.roundOf16': 'Round of 16',
      'cup.roundNumber': `Round ${params?.number}`,
      'nav.day': `Spieltag ${params?.gameDay} (${params?.season})`
    }
    return dict[key] ?? key
  }
}))

import { currentGamedayLabel } from '../../lib/currentGamedayLabel.js'

describe('currentGamedayLabel', () => {
  it('renders the cup final label when today is the cup final', () => {
    const label = currentGamedayLabel({
      gameDay: 32,
      season: 4,
      cupRoundToday: { cupRound: 1, totalRounds: 7 },
      userMatchDayToday: null,
      userNextMatchDay: null
    })
    expect(label).toBe('Final')
  })

  it('renders the semi-final label when cupRound is 2', () => {
    const label = currentGamedayLabel({
      gameDay: 27,
      season: 4,
      cupRoundToday: { cupRound: 2, totalRounds: 7 },
      userMatchDayToday: null,
      userNextMatchDay: null
    })
    expect(label).toBe('Semi-Final')
  })

  it('renders the sequential round number for early cup rounds', () => {
    const label = currentGamedayLabel({
      gameDay: 4,
      season: 4,
      cupRoundToday: { cupRound: 64, totalRounds: 7 },
      userMatchDayToday: null,
      userNextMatchDay: null
    })
    // totalRounds 7 minus log2(64)=6 → round 1
    expect(label).toBe('Round 1')
  })

  it('shows the user league match day when their league plays today', () => {
    const label = currentGamedayLabel({
      gameDay: 5,
      season: 1,
      cupRoundToday: null,
      userMatchDayToday: 4,
      userNextMatchDay: 4
    })
    expect(label).toBe('Spieltag 4 (2)')
  })

  it('falls back to next league match day when the user league does not play today', () => {
    const label = currentGamedayLabel({
      gameDay: 33,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: 29
    })
    expect(label).toBe('Spieltag 29 (5)')
  })

  it('falls back to the internal counter when nothing is known', () => {
    const label = currentGamedayLabel({
      gameDay: 7,
      season: 1,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: null
    })
    expect(label).toBe('Spieltag 8 (2)')
  })

  it('prefers cup over user match day', () => {
    const label = currentGamedayLabel({
      gameDay: 4,
      season: 4,
      cupRoundToday: { cupRound: 8, totalRounds: 7 },
      userMatchDayToday: 5,
      userNextMatchDay: 5
    })
    expect(label).toBe('Round of 16')
  })
})
