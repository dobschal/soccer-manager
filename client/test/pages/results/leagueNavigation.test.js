import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn(),
  getQueryParams: vi.fn(() => ({}))
}))
vi.mock('../../../i18n/index.js', () => ({ t: (key) => key }))
// Heavy leaf dependencies the filter logic does not touch.
vi.mock('chart.js/auto', () => ({ Chart: class {} }))
vi.mock('../../../lib/gateway.js', () => ({ server: {}, showServerError: vi.fn() }))
vi.mock('../../../lib/html.js', () => ({ generateId: () => 'gen-id', el: () => null }))
vi.mock('../../../lib/htmlEventHandlers.js', () => ({ onClick: vi.fn() }))
vi.mock('../../../partials/emblem.js', () => ({ renderEmblem: () => '' }))
vi.mock('../../../partials/playerImage.js', () => ({ renderPlayerImage: () => Promise.resolve('') }))
vi.mock('../../../partials/overlay.js', () => ({ showOverlay: vi.fn(), showConfirmDialog: vi.fn() }))
vi.mock('../../../partials/seasonReviewOverlay.js', () => ({ showSeasonReviewOverlay: vi.fn() }))
vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../../partials/wikiInfoIcon.js', () => ({ wikiInfoIcon: () => '' }))
vi.mock('../../../partials/table.js', () => ({
  Table: class {
    constructor (cfg) { this.cfg = cfg }
    toString () { return '<table></table>' }
  }
}))

const { LeagueResultsPage } = await import('../../../pages/results/league.js')
const { setQueryParams } = await import('../../../lib/router.js')

/**
 * A page with the filter lists populated, positioned in the middle of each.
 * @returns {object}
 */
function page () {
  const p = new LeagueResultsPage()
  p.availableLeagues = [
    { level: 1, league: 0 },
    { level: 2, league: 0 },
    { level: 2, league: 1 }
  ]
  p.availableSeasons = [5, 4, 3]
  p.availableMatchDays = [1, 2, 3]
  p.level = 2
  p.league = 0
  p.season = 4
  p.matchDay = 2
  return p
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LeagueResultsPage filter arrows (#478)', () => {
  it('steps to the next league in the list', () => {
    page()._stepLeague(1)
    expect(setQueryParams).toHaveBeenCalledWith({ level: 2, league: 1, season: 4, match_day: 2 })
  })

  it('steps to the previous league in the list', () => {
    page()._stepLeague(-1)
    expect(setQueryParams).toHaveBeenCalledWith({ level: 1, league: 0, season: 4, match_day: 2 })
  })

  it('steps through seasons', () => {
    page()._stepSeason(1)
    expect(setQueryParams).toHaveBeenCalledWith({ season: 3, match_day: 2 })
  })

  it('steps through match days', () => {
    page()._stepMatchDay(-1)
    expect(setQueryParams).toHaveBeenCalledWith({ season: 4, match_day: 1 })
  })

  it('does nothing at the start of a list', () => {
    const p = page()
    p.season = 5 // first entry
    p._stepSeason(-1)
    expect(setQueryParams).not.toHaveBeenCalled()
  })

  it('does nothing at the end of a list', () => {
    const p = page()
    p.matchDay = 3 // last entry
    p._stepMatchDay(1)
    expect(setQueryParams).not.toHaveBeenCalled()
  })

  it('does not wrap around from the last league to the first', () => {
    const p = page()
    p.level = 2
    p.league = 1 // last entry
    p._stepLeague(1)
    expect(setQueryParams).not.toHaveBeenCalled()
  })

  it('does nothing when the current value is not in the list', () => {
    const p = page()
    p.matchDay = 99
    p._stepMatchDay(1)
    expect(setQueryParams).not.toHaveBeenCalled()
  })

  it('renders an arrow on each side of every filter dropdown', () => {
    const p = page()
    p.results = []
    p.standing = []
    p.topScorers = []
    p.teamStats = []
    p.stadiums = []
    const html = p.template
    for (const id of [
      'prev-league-button', 'next-league-button',
      'prev-season-button', 'next-season-button',
      'prev-game-day-button', 'next-game-day-button'
    ]) {
      expect(html).toContain(`id="${id}"`)
    }
    // The dropdowns stay — the ticket asks for both controls side by side.
    expect(html).toContain('id="results-league-select"')
    expect(html).toContain('id="results-season-select"')
    expect(html).toContain('id="results-game-day-select"')
  })
})
