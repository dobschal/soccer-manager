import { describe, it, expect, vi } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: (key, params) => {
    const dict = {
      'cup.final': 'Final',
      'cup.semiFinal': 'Semi-Final',
      'cup.quarterFinal': 'Quarter-Final',
      'cup.roundOf16': 'Round of 16',
      'cup.roundNumber': `Round ${params?.number}`,
      'nav.day': `Tag ${params?.gameDay}`,
      'nav.seasonEnd': 'Saisonende'
    }
    return dict[key] ?? key
  }
}))

import { currentGamedayLabel, currentGamedayHref } from '../../lib/currentGamedayLabel.js'

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
    expect(label).toBe('Tag 4')
  })

  it('falls back to next league match day when the user league does not play today', () => {
    const label = currentGamedayLabel({
      gameDay: 33,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: 29
    })
    expect(label).toBe('Tag 29')
  })

  it('falls back to the internal counter when nothing is known', () => {
    const label = currentGamedayLabel({
      gameDay: 7,
      season: 1,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: null
    })
    expect(label).toBe('Tag 8')
  })

  it('shows "Saisonende" when no unplayed games remain', () => {
    const label = currentGamedayLabel({
      gameDay: 42,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: null,
      isSeasonEnd: true
    })
    expect(label).toBe('Saisonende')
  })

  it('prefers an upcoming user match day over the season-end label', () => {
    const label = currentGamedayLabel({
      gameDay: 33,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: 34,
      isSeasonEnd: false
    })
    expect(label).toBe('Tag 34')
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

describe('currentGamedayHref', () => {
  it('links to the match day the label names, not the last played one', () => {
    // The bug: label said "Tag 9", the results page opened match day 8.
    const data = {
      gameDay: 9,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: 9
    }
    expect(currentGamedayLabel(data)).toBe('Tag 9')
    expect(currentGamedayHref(data)).toBe('#results?season=4&match_day=9')
  })

  it('links to the match day played today', () => {
    expect(currentGamedayHref({
      gameDay: 5,
      season: 1,
      cupRoundToday: null,
      userMatchDayToday: 4,
      userNextMatchDay: 4
    })).toBe('#results?season=1&match_day=4')
  })

  it('opens the cup tab when the label shows a cup round', () => {
    expect(currentGamedayHref({
      gameDay: 4,
      season: 4,
      cupRoundToday: { cupRound: 8, totalRounds: 7 },
      userMatchDayToday: 5,
      userNextMatchDay: 5
    })).toBe('#results?sub_page=cup')
  })

  it('falls back to the plain results page when no match day is known', () => {
    expect(currentGamedayHref({
      gameDay: 42,
      season: 4,
      cupRoundToday: null,
      userMatchDayToday: null,
      userNextMatchDay: null,
      isSeasonEnd: true
    })).toBe('#results')
  })
})
