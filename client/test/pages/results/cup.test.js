import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getAvailableCupSeasons: vi.fn(() => Promise.resolve({ seasons: [] })),
    getCupRounds: vi.fn(() => Promise.resolve({ rounds: [], totalRounds: 0 })),
    getCupResults: vi.fn(() => Promise.resolve({ results: [] })),
    getSuspendedPlayersForCup: vi.fn(() => Promise.resolve({ suspendedPlayers: [] })),
    getInjuredPlayersForCup: vi.fn(() => Promise.resolve({ injuredPlayers: [] })),
    getCupBracket: vi.fn(() => Promise.resolve({ bracket: {} }))
  }
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: () => 'gen-id',
  el: () => null
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn()
}))

vi.mock('../../../partials/emblem.js', () => ({
  renderEmblem: () => ''
}))

vi.mock('../../../partials/playerImage.js', () => ({
  renderPlayerImage: () => Promise.resolve('')
}))

vi.mock('../../../partials/table.js', () => ({
  Table: class {
    constructor (cfg) { this.cfg = cfg }
    toString () { return `<table data-rows="${this.cfg.data.length}"></table>` }
  }
}))

vi.mock('../../../partials/pagination.js', () => ({
  renderPageNumbers: (total, current) => `<li class="page-item active" data-page-index="${current}">P${total}</li>`
}))

vi.mock('../../../i18n/index.js', () => ({
  t: (key) => key
}))

vi.mock('../../../util/team.js', () => ({
  shortenTeamName: (n) => n
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: { format: (n) => `${n}` }
}))

const { CupResultsPage } = await import('../../../pages/results/cup.js')

function makeResults (count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    team1: `T${i + 1}A`,
    team2: `T${i + 1}B`,
    team1Id: i * 2 + 1,
    team2Id: i * 2 + 2,
    played: 1,
    goalsTeam1: 1,
    goalsTeam2: 0
  }))
}

function makeInjured (count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Player ${i + 1}`,
    team: { id: 99, name: 'FC X' },
    injury_type: 'sprain',
    injury_days_left: 3
  }))
}

describe('CupResultsPage pagination', () => {
  let page
  beforeEach(() => {
    page = new CupResultsPage({ myTeamId: 1 })
    page.cupSeason = 0
    page.cupRound = 4
    page.cupTotalRounds = 4
  })

  it('shows only the first 10 cup results on page 0 and exposes pagination markup', () => {
    page.cupResults = makeResults(23)
    const html = page.template
    expect(html).toContain('cup-results-pagination')
    expect(html).toContain('data-rows="10"')
  })

  it('returns the second slice when advancing to page 1', () => {
    page.cupResults = makeResults(23)
    page._cupResultsPage = 1
    const slice = page._getPagedCupResults()
    expect(slice).toHaveLength(10)
    expect(slice[0].id).toBe(11)
  })

  it('returns the last partial slice on the final page', () => {
    page.cupResults = makeResults(23)
    page._cupResultsPage = 2
    const slice = page._getPagedCupResults()
    expect(slice).toHaveLength(3)
    expect(slice[0].id).toBe(21)
  })

  it('does not render pagination when the list fits on one page', () => {
    page.cupResults = makeResults(7)
    const html = page.template
    expect(html).toContain('data-rows="7"')
    // Pagination wrapper still emits but the inner nav must be empty
    expect(html).not.toMatch(/<nav>[\s\S]*pagination-sm/)
  })

  it('paginates the injured players list with max 10 per page', () => {
    page.injuredPlayers = makeInjured(15)
    const html = page.template
    expect(html).toContain('cup-injured-pagination')
    expect(html).toMatch(/data-rows="10"/)
    expect(page._getPagedInjuredPlayers()).toHaveLength(10)
    page._injuredPlayersPage = 1
    expect(page._getPagedInjuredPlayers()).toHaveLength(5)
  })
})

describe('CupResultsPage season/round dropdowns (#478)', () => {
  /**
   * @returns {Promise<import('../../../pages/results/cup.js').CupResultsPage>}
   */
  async function loadedPage () {
    const page = new CupResultsPage()
    page.cupSeasons = [4, 3, 2]
    page.cupSeason = 3
    page.cupRounds = [{ round: 1 }, { round: 2 }, { round: 3 }]
    page.cupRound = 2
    page.cupTotalRounds = 3
    page.cupResults = []
    page.injuredPlayers = []
    page.suspendedPlayers = []
    page.bracket = {}
    return page
  }

  it('renders a season dropdown alongside the arrows', async () => {
    const page = await loadedPage()
    const html = page.template
    expect(html).toContain('id="cup-season-select"')
    expect(html).toContain('id="prev-cup-season-button"')
    expect(html).toContain('id="next-cup-season-button"')
    expect(html).toContain('<option value="3" selected>')
  })

  it('renders a round dropdown alongside the arrows', async () => {
    const page = await loadedPage()
    const html = page.template
    expect(html).toContain('id="cup-round-select"')
    expect(html).toContain('id="prev-cup-round-button"')
    expect(html).toContain('id="next-cup-round-button"')
    expect(html).toContain('<option value="2" selected>')
  })

  it('lists every available season and round', async () => {
    const page = await loadedPage()
    const html = page.template
    for (const season of [4, 3, 2]) expect(html).toContain(`value="${season}"`)
    for (const round of [1, 2, 3]) expect(html).toContain(`value="${round}"`)
  })

  it('jumps to the chosen season and resets the round', async () => {
    const { setQueryParams } = await import('../../../lib/router.js')
    setQueryParams.mockClear()
    const page = await loadedPage()

    page.events['(optional) #cup-season-select'].change({ target: { value: '4' } })

    expect(setQueryParams).toHaveBeenCalledWith({ sub_page: 'cup', cup_season: 4, cup_round: null })
  })

  it('jumps to the chosen round inside the current season', async () => {
    const { setQueryParams } = await import('../../../lib/router.js')
    setQueryParams.mockClear()
    const page = await loadedPage()

    page.events['(optional) #cup-round-select'].change({ target: { value: '3' } })

    expect(setQueryParams).toHaveBeenCalledWith({ sub_page: 'cup', cup_season: 3, cup_round: 3 })
  })
})
