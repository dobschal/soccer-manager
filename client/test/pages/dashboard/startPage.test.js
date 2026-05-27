import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {}
}))

vi.mock('../../../partials/gameSlider.js', () => ({
  GameSlider: class { toString () { return '' } }
}))

const tableInstances = []
vi.mock('../../../partials/table.js', () => ({
  Table: class {
    constructor (args) {
      this.args = args
      tableInstances.push(this)
    }
    toString () { return '' }
  }
}))

vi.mock('../../../partials/emblem.js', () => ({
  renderEmblem: () => ''
}))

vi.mock('../../../util/league.js', () => ({
  formatLeague: () => ''
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('id'),
  el: vi.fn()
}))

vi.mock('../../../lib/router.js', () => ({
  goTo: vi.fn()
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: (key) => key,
  getLocale: () => 'en'
}))

vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))

vi.mock('../../../partials/gameModal.js', () => ({ showGameModal: vi.fn() }))

const { StartPage } = await import('../../../pages/dashboard/startPage.js')

function makeStartPage (cupGames) {
  return new StartPage({
    sliderGames: [],
    initialSlideIndex: 0,
    team: { id: 1 },
    cupGames,
    friendlyGames: [],
    canPlayFriendly: false,
    standing: [],
    teamPosition: 0,
    urgencies: []
  })
}

describe('StartPage._findCupInitialSlideIndex', () => {
  let store

  beforeEach(() => {
    // The shared setup.js stubs localStorage with vi.fn()s that don't persist
    // anything. Re-wire them here to a small in-memory store so the seen-key
    // flow can actually be exercised.
    store = {}
    window.localStorage.getItem.mockImplementation((key) => store[key] ?? null)
    window.localStorage.setItem.mockImplementation((key, val) => {
      store[key] = String(val)
    })
    window.localStorage.removeItem.mockImplementation((key) => { delete store[key] })
    window.localStorage.clear.mockImplementation(() => { store = {} })
  })

  it('returns the upcoming index when there are no played cup games', () => {
    const page = makeStartPage([
      { id: 10, isPlayed: false, gameDate: new Date() },
      { id: 11, isPlayed: false, gameDate: new Date() }
    ])
    expect(page._findCupInitialSlideIndex()).toBe(0)
  })

  it('returns the latest played cup game on first visit and marks it as seen', () => {
    const page = makeStartPage([
      { id: 10, isPlayed: true },
      { id: 11, isPlayed: true },
      { id: 12, isPlayed: false, gameDate: new Date() }
    ])

    expect(page._findCupInitialSlideIndex()).toBe(1)
    expect(store.cupSliderSeen_11).toBe('1')
  })

  it('returns the next upcoming index once the played game has been seen', () => {
    store.cupSliderSeen_11 = '1'
    const page = makeStartPage([
      { id: 10, isPlayed: true },
      { id: 11, isPlayed: true },
      { id: 12, isPlayed: false, gameDate: new Date() }
    ])

    expect(page._findCupInitialSlideIndex()).toBe(2)
  })

  it('keeps showing the last played game when no upcoming game exists', () => {
    store.cupSliderSeen_11 = '1'
    const page = makeStartPage([
      { id: 10, isPlayed: true },
      { id: 11, isPlayed: true }
    ])

    expect(page._findCupInitialSlideIndex()).toBe(1)
  })

  it('reverts to the new played game when a later round is played (different id)', () => {
    // User already saw the round that played at id 11. Now id 13 (a later
    // round) has been played — they have not yet seen this one, so it should
    // surface first.
    store.cupSliderSeen_11 = '1'
    const page = makeStartPage([
      { id: 10, isPlayed: true },
      { id: 11, isPlayed: true },
      { id: 13, isPlayed: true },
      { id: 14, isPlayed: false, gameDate: new Date() }
    ])

    expect(page._findCupInitialSlideIndex()).toBe(2)
    expect(store.cupSliderSeen_13).toBe('1')
  })
})

describe('StartPage._renderMiniStanding row click', () => {
  it('navigates to the league results page (not the team page) when a row is clicked', async () => {
    const { goTo } = await import('../../../lib/router.js')
    const { onClick } = await import('../../../lib/htmlEventHandlers.js')
    goTo.mockClear()
    onClick.mockClear()
    tableInstances.length = 0

    const page = new StartPage({
      sliderGames: [],
      initialSlideIndex: 0,
      team: { id: 1, level: 3, league: 5 },
      cupGames: [],
      friendlyGames: [],
      canPlayFriendly: false,
      standing: [
        { team: { id: 1, name: 'Mine', user_id: 1 }, points: 30 },
        { team: { id: 2, name: 'Other' }, points: 28 }
      ],
      teamPosition: 1,
      urgencies: []
    })

    page._renderMiniStanding()

    const table = tableInstances[tableInstances.length - 1]
    expect(table).toBeDefined()

    // Trigger rowAttrs for the (non-user) row — this should register a click
    // handler that goes to the league results page, not the team page.
    table.args.rowAttrs(page.standing[1], 1)
    const [, handler] = onClick.mock.calls[onClick.mock.calls.length - 1]
    handler()

    expect(goTo).toHaveBeenCalledWith('results?level=3&league=5')
    expect(goTo).not.toHaveBeenCalledWith(expect.stringContaining('team?id='))
  })
})
