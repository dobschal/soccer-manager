import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: (key, vars) => vars ? `${key}:${JSON.stringify(vars)}` : key
}))

vi.mock('../../partials/emblem.js', () => ({
  renderEmblem: vi.fn(() => '<svg data-emblem="x"></svg>')
}))

vi.mock('../../util/league.js', () => ({
  formatLeague: vi.fn((level, league) => `LEAGUE(${level}/${league})`)
}))

vi.mock('../../lib/html.js', () => {
  let i = 0
  return {
    generateId: vi.fn(() => `sr-id-${i++}`),
    el: (q) => document.querySelector(q)
  }
})

const clickHandlers = {}
vi.mock('../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn((selector, handler) => {
    clickHandlers[selector] = handler
  })
}))

const { showSeasonReviewOverlay, isSeasonReviewDismissed } = await import('../../partials/seasonReviewOverlay.js')

function baseReview (overrides = {}) {
  return {
    isSeasonEnd: true,
    season: 4,
    team: { id: 100, name: 'User FC', color: '#FF0000', emblem: '{}', level: 1, league: 0 },
    position: 1,
    outcome: 'promoted',
    userWonCup: false,
    leagueChampion: {
      teamId: 100,
      teamName: 'User FC',
      color: '#FF0000',
      emblem: '{}',
      points: 80,
      isUser: true
    },
    relegatedTeams: [
      { teamId: 15, teamName: 'Bottom A', color: '#000', emblem: '{}', isUser: false },
      { teamId: 16, teamName: 'Bottom B', color: '#000', emblem: '{}', isUser: false }
    ],
    topScorer: {
      id: 9,
      name: 'Top Scorer',
      goals: 25,
      team: { id: 100, name: 'User FC', color: '#FF0000', emblem: '{}' },
      isUserTeam: true
    },
    cupWinner: null,
    ...overrides
  }
}

describe('showSeasonReviewOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    Object.keys(clickHandlers).forEach(k => delete clickHandlers[k])
    // sessionStorage mock — the auto setup.js mock only replaces localStorage
    const store = {}
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v) },
        removeItem: (k) => { delete store[k] },
        clear: () => { Object.keys(store).forEach(k => delete store[k]) }
      }
    })
  })

  it('resolves immediately and renders nothing when isSeasonEnd is false', async () => {
    await showSeasonReviewOverlay({ isSeasonEnd: false })
    expect(document.body.querySelector('.season-review-card')).toBeNull()
  })

  it('renders the overlay with emoji, headline, champion line, top scorer and relegated teams', async () => {
    void showSeasonReviewOverlay(baseReview())

    const card = document.body.querySelector('.season-review-card')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('🎉') // promoted emoji
    expect(card.textContent).toContain('seasonReview.outcome.promoted')
    expect(card.textContent).toContain('User FC') // champion + top scorer team
    expect(card.textContent).toContain('Top Scorer')
    expect(card.textContent).toContain('Bottom A')
    expect(card.textContent).toContain('Bottom B')
  })

  it('renders the user\'s historical league label in the header', async () => {
    void showSeasonReviewOverlay(baseReview({ team: { id: 100, name: 'User FC', color: '#FF0000', emblem: '{}', level: 2, league: 1 } }))

    const card = document.body.querySelector('.season-review-card')
    expect(card.textContent).toContain('LEAGUE(2/1)')
  })

  it('uses the server-supplied headlineVariant so reopening shows the same text', async () => {
    void showSeasonReviewOverlay(baseReview({ outcome: 'champion', position: 1, headlineVariant: 2 }))
    let card = document.body.querySelector('.season-review-card')
    expect(card.textContent).toContain('seasonReview.outcome.champion.2')
    expect(card.textContent).not.toContain('seasonReview.outcome.champion.1')

    // Clean DOM and render again with the same review — should pick variant 2 again.
    document.body.innerHTML = ''
    void showSeasonReviewOverlay(baseReview({ outcome: 'champion', position: 1, headlineVariant: 2 }))
    card = document.body.querySelector('.season-review-card')
    expect(card.textContent).toContain('seasonReview.outcome.champion.2')
  })

  it('falls back to variant 1 when the server omits headlineVariant', async () => {
    void showSeasonReviewOverlay(baseReview({ outcome: 'lowerHalf', position: 12, headlineVariant: undefined }))
    const card = document.body.querySelector('.season-review-card')
    expect(card.textContent).toContain('seasonReview.outcome.lowerHalf.1')
  })

  it('renders a sticky close X button inside the card', async () => {
    void showSeasonReviewOverlay(baseReview())
    const closeX = document.body.querySelector('.season-review-close-x')
    expect(closeX).not.toBeNull()
    // The card is the scrolling container so the close X can stay pinned even
    // when content overflows. overflow:hidden would prevent that — guard
    // against accidentally reintroducing it via the inline element.
    expect(closeX.querySelector('.fa-close')).not.toBeNull()
  })

  it('shows the trophy emoji and confetti when the user is the cup winner', async () => {
    void showSeasonReviewOverlay(baseReview({
      outcome: 'lowerHalf',
      position: 12,
      userWonCup: true,
      cupWinner: {
        teamId: 100,
        teamName: 'User FC',
        color: '#FF0000',
        emblem: '{}',
        username: 'testuser',
        isUser: true
      }
    }))

    const card = document.body.querySelector('.season-review-card')
    expect(card.textContent).toContain('🏆')
    expect(document.body.querySelector('.season-review-confetti')).not.toBeNull()
    expect(card.textContent).toContain('seasonReview.cupWonExtra')
  })

  it('renders confetti for champion and promoted outcomes, but not for relegation', async () => {
    void showSeasonReviewOverlay(baseReview({ outcome: 'champion', position: 1 }))
    expect(document.body.querySelector('.season-review-confetti')).not.toBeNull()
    document.body.innerHTML = ''

    void showSeasonReviewOverlay(baseReview({ outcome: 'relegated', position: 17, userWonCup: false, cupWinner: null }))
    expect(document.body.querySelector('.season-review-confetti')).toBeNull()
  })

  it('marks the overlay as dismissed once closed so isSeasonReviewDismissed returns true', async () => {
    const promise = showSeasonReviewOverlay(baseReview({ season: 7 }))

    expect(isSeasonReviewDismissed(7)).toBe(false)

    // The close button handler is registered first and takes zero arguments;
    // the backdrop handler takes the event. Filter by function arity.
    const closeSelector = Object.keys(clickHandlers).find(s => clickHandlers[s].length === 0)
    expect(closeSelector).toBeDefined()
    clickHandlers[closeSelector]()

    // Drive the fade-out animation to completion
    const overlay = document.body.querySelector('.season-review-backdrop')
    overlay.dispatchEvent(new Event('animationend'))
    await promise

    expect(isSeasonReviewDismissed(7)).toBe(true)
  })
})
