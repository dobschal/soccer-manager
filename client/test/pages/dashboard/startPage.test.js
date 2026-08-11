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

describe('StartPage._renderVideoCard', () => {
  let getLocaleMock

  beforeEach(async () => {
    const i18n = await import('../../../i18n/index.js')
    getLocaleMock = vi.spyOn(i18n, 'getLocale').mockReturnValue('en')
    delete window.__nativePlatform
  })

  function makePage () {
    return new StartPage({
      sliderGames: [],
      initialSlideIndex: 0,
      team: { id: 1 },
      cupGames: [],
      friendlyGames: [],
      canPlayFriendly: false,
      standing: [],
      teamPosition: 0,
      urgencies: []
    })
  }

  it('uses the desktop English tutorial video for the English locale in the browser', () => {
    getLocaleMock.mockReturnValue('en')
    const html = makePage()._renderVideoCard()
    expect(html).toContain('kK_OHx9gypc')
    expect(html).not.toContain('gcBC70_ElFQ')
    expect(html).not.toContain('ogCKtnHt04s')
    expect(html).not.toContain('D7v1Y2-HUlk')
  })

  it('uses the mobile English tutorial video for the English locale in the native app', () => {
    getLocaleMock.mockReturnValue('en')
    window.__nativePlatform = 'ios'
    const html = makePage()._renderVideoCard()
    expect(html).toContain('gcBC70_ElFQ')
    expect(html).not.toContain('kK_OHx9gypc')
    expect(html).not.toContain('D7v1Y2-HUlk')
  })

  it('uses the desktop German tutorial video for the German locale in the browser', () => {
    getLocaleMock.mockReturnValue('de')
    const html = makePage()._renderVideoCard()
    expect(html).toContain('ogCKtnHt04s')
    expect(html).not.toContain('D7v1Y2-HUlk')
    expect(html).not.toContain('kK_OHx9gypc')
  })

  it('uses the mobile German tutorial video for the German locale in the native app', () => {
    getLocaleMock.mockReturnValue('de')
    window.__nativePlatform = 'ios'
    const html = makePage()._renderVideoCard()
    expect(html).toContain('D7v1Y2-HUlk')
    expect(html).not.toContain('ogCKtnHt04s')
    expect(html).not.toContain('gcBC70_ElFQ')
  })
})

describe('StartPage urgency section placement', () => {
  it('renders the urgency section twice: hidden on mobile inside the sidebar, and shown only on mobile below the sliders', () => {
    const page = new StartPage({
      sliderGames: [],
      initialSlideIndex: 0,
      team: { id: 1, level: 1, league: 1, name: 'Test' },
      cupGames: [],
      friendlyGames: [],
      canPlayFriendly: false,
      standing: [],
      teamPosition: 0,
      urgencies: []
    })

    const html = page.toString()

    expect(html).toContain('d-none d-lg-block')
    expect(html).toContain('d-lg-none order-3 w-100 text-center')

    const urgencyTitleMatches = html.match(/dashboard\.urgencyTitle/g) || []
    expect(urgencyTitleMatches.length).toBe(2)

    const mobileBlockStart = html.indexOf('d-lg-none order-3 w-100 text-center')
    const sliderColumnStart = html.indexOf('order-2 order-lg-1')
    expect(mobileBlockStart).toBeGreaterThan(sliderColumnStart)
  })
})

describe('StartPage._renderUrgencyChecklist collapsing', () => {
  function makeUrgencyPage (urgencies) {
    return new StartPage({
      sliderGames: [],
      initialSlideIndex: 0,
      team: { id: 1, level: 1, league: 1, name: 'Test' },
      cupGames: [],
      friendlyGames: [],
      canPlayFriendly: false,
      standing: [],
      teamPosition: 0,
      urgencies
    })
  }

  function countRows (html) {
    return (html.match(/<li /g) || []).length
  }

  it('renders three items and a show-all row', () => {
    const html = makeUrgencyPage([])._renderUrgencyChecklist()
    expect(countRows(html)).toBe(StartPage.URGENCY_PREVIEW_COUNT + 1)
    expect(html).toContain('dashboard.urgencyShowAll')
  })

  it('sorts warnings above the ok rows so they are never collapsed away', () => {
    // NO_SPONSOR is the second-to-last check — with warnings sorted first it
    // must still show up in the three-row preview.
    const html = makeUrgencyPage([
      { type: 'NO_SPONSOR' },
      { type: 'FORUM_MENTIONS', count: 2 }
    ])._renderUrgencyChecklist()

    const preview = html.slice(0, html.indexOf('dashboard.urgencyShowAll'))
    expect(preview).toContain('dashboard.urgencySponsor')
    expect(preview).toContain('dashboard.urgencyMentions')
    expect(preview.indexOf('dashboard.urgencySponsor'))
      .toBeLessThan(preview.indexOf('dashboard.urgencyOk.'))
  })

  it('expands to the full list when the show-all row is clicked', async () => {
    const { onClick } = await import('../../../lib/htmlEventHandlers.js')
    const { generateId } = await import('../../../lib/html.js')
    onClick.mockClear()
    let idCount = 0
    generateId.mockImplementation(() => `id-${++idCount}`)

    const html = makeUrgencyPage([])._renderUrgencyChecklist()
    const listId = html.match(/<ul id="([^"]+)"/)[1]

    document.body.innerHTML = html
    const [selector, handler] = onClick.mock.calls[onClick.mock.calls.length - 1]
    expect(selector).toBe('#' + html.match(/<li id="([^"]+)"/)[1])
    handler()

    const list = document.getElementById(listId)
    expect(countRows(list.innerHTML)).toBeGreaterThan(StartPage.URGENCY_PREVIEW_COUNT)
    expect(list.innerHTML).not.toContain('dashboard.urgencyShowAll')

    generateId.mockReturnValue('id')
    document.body.innerHTML = ''
  })

  it('renders a plain list without a toggle when everything fits', () => {
    const page = makeUrgencyPage([])
    const original = StartPage.URGENCY_PREVIEW_COUNT
    try {
      StartPage.URGENCY_PREVIEW_COUNT = 99
      const html = page._renderUrgencyChecklist()
      expect(html).not.toContain('dashboard.urgencyShowAll')
    } finally {
      StartPage.URGENCY_PREVIEW_COUNT = original
    }
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
