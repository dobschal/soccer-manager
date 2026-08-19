import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'stadium.noAttendanceData': 'No attendance data available yet.',
      'stadium.noAttendanceForFilter': 'No home games match the selected filters.',
      'stadium.attendanceMatchDay': 'Match Day',
      'stadium.attendanceOpponent': 'Opponent',
      'stadium.attendanceFilter.league': 'League Games',
      'stadium.attendanceFilter.cup': 'Cup Games',
      'stadium.attendanceFilter.friendly': 'Friendlies',
      'stadium.north': 'North',
      'stadium.south': 'South',
      'stadium.east': 'East',
      'stadium.west': 'West',
      'stadium.corner_ne': 'N. East',
      'stadium.corner_nw': 'N. West',
      'stadium.corner_se': 'S. East',
      'stadium.corner_sw': 'S. West',
      'schedule.leagueDay': `Match day ${params.day ?? ''}`,
      'cup.final': 'Final',
      'cup.semiFinal': 'Semi-Final',
      'cup.quarterFinal': 'Quarter-Final',
      'cup.roundOf16': 'Round of 16',
      'cup.round': 'Round',
      'cup.roundNumber': `Round ${params.number ?? ''}`,
      'stadium.attendanceUnderConstruction': 'Closed for construction',
      'common.prev': 'Previous',
      'common.next': 'Next'
    }
    return translations[key] || key
  })
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn(() => 'test-id'),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../partials/gameModal.js', () => ({
  showGameModal: vi.fn()
}))

import { StadiumAttendanceTable } from '../../partials/stadiumAttendanceTable.js'
import { showGameModal } from '../../partials/gameModal.js'

/**
 * @param {object} overrides
 * @returns {object}
 */
function makeRow (overrides = {}) {
  return {
    gameId: 1,
    gameType: 'league',
    season: 0,
    gameDay: 4,
    matchDay: 5,
    cupRound: null,
    totalCupRounds: 0,
    opponent: { id: 2, name: 'FC Dynamic Ironhold', short_name: null, emblem: null, color: '#123456' },
    stands: {
      north: { guests: 4000, size: 5000, percentage: 80 },
      south: { guests: 2500, size: 5000, percentage: 50 },
      east: { guests: 0, size: 1, percentage: 0 },
      west: { guests: 0, size: 1, percentage: 0 },
      corner_ne: { guests: 0, size: 1, percentage: 0 },
      corner_nw: { guests: 0, size: 1, percentage: 0 },
      corner_se: { guests: 0, size: 1, percentage: 0 },
      corner_sw: { guests: 0, size: 1, percentage: 0 }
    },
    ...overrides
  }
}

/**
 * @param {number} count
 * @param {string} gameType
 * @returns {Array<object>}
 */
function makeRows (count, gameType = 'league') {
  return Array.from({ length: count }, (_, i) => makeRow({
    gameId: i + 1,
    gameType,
    matchDay: i + 1,
    gameDay: i
  }))
}

describe('StadiumAttendanceTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the empty state when there are no games at all', () => {
    const table = new StadiumAttendanceTable([])
    expect(table.template).toContain('No attendance data available yet.')
  })

  it('renders only the percentage per stand, not the absolute numbers', () => {
    const table = new StadiumAttendanceTable([makeRow()])
    const html = table._renderTable()
    expect(html).toContain('80%')
    expect(html).not.toContain('>4,000 /')
    expect(html).toContain('title="4,000 / 5,000"')
  })

  it('marks a stand that was closed for construction instead of printing 0%', () => {
    // 0% would sit in the same column as a stand nobody wanted to visit, while
    // the stand in fact sold no tickets at all.
    const row = makeRow()
    row.stands.north = { guests: 0, size: 5000, percentage: 0, underConstruction: true }
    const html = new StadiumAttendanceTable([row])._renderTable()

    expect(html).toContain('fa-wrench')
    expect(html).toContain('title="Closed for construction"')
    // The open stands keep their percentage.
    expect(html).toContain('50%')
  })

  it('shows a plain 0% for an open stand nobody visited', () => {
    const row = makeRow()
    row.stands.north = { guests: 0, size: 5000, percentage: 0, underConstruction: false }
    const html = new StadiumAttendanceTable([row])._renderTable()

    expect(html).not.toContain('fa-wrench')
    expect(html).toContain('title="0 / 5,000"')
  })

  it('shows the league match day and the opponent short name', () => {
    const table = new StadiumAttendanceTable([makeRow()])
    const html = table._renderTable()
    expect(html).toContain('Match day 5')
    expect(html).toContain('Ironhold')
  })

  it('prefers a user-defined opponent short name', () => {
    const row = makeRow()
    row.opponent.short_name = 'DYN'
    const table = new StadiumAttendanceTable([row])
    expect(table._renderTable()).toContain('DYN')
  })

  it('names cup rounds instead of showing a match day', () => {
    const rows = [
      makeRow({ gameId: 1, gameType: 'cup', cupRound: 1, matchDay: null }),
      makeRow({ gameId: 2, gameType: 'cup', cupRound: 2, matchDay: null }),
      makeRow({ gameId: 3, gameType: 'cup', cupRound: 16, totalCupRounds: 6, matchDay: null })
    ]
    const table = new StadiumAttendanceTable(rows)
    const html = table._renderTable()
    expect(html).toContain('Final')
    expect(html).toContain('Semi-Final')
    expect(html).toContain('Round 2')
  })

  it('labels friendlies', () => {
    const table = new StadiumAttendanceTable([makeRow({ gameType: 'friendly', matchDay: null })])
    expect(table._renderTable()).toContain('Friendlies')
  })

  it('tags every row with its game id', () => {
    const table = new StadiumAttendanceTable([makeRow({ gameId: 77 })])
    expect(table._renderTable()).toContain('data-game-id="77"')
  })

  it('opens the game details overlay when a row is clicked', () => {
    const table = new StadiumAttendanceTable([makeRow({ gameId: 77 })])
    table.events['(optional).stadium-attendance-rows'].click({
      target: {
        closest: (selector) => selector === 'tr[data-game-id]'
          ? { dataset: { gameId: '77' } }
          : null
      }
    })
    expect(showGameModal).toHaveBeenCalledWith(77)
  })

  it('ignores clicks that do not land on a row', () => {
    const table = new StadiumAttendanceTable([makeRow({ gameId: 77 })])
    table.events['(optional).stadium-attendance-rows'].click({
      target: { closest: () => null }
    })
    expect(showGameModal).not.toHaveBeenCalled()
  })

  it('starts with all three game type filters enabled', () => {
    const table = new StadiumAttendanceTable([makeRow()])
    expect(table.activeTypes).toEqual({ league: true, cup: true, friendly: true })
    expect(table.template).toContain('League Games')
    expect(table.template).toContain('Cup Games')
    expect(table.template).toContain('Friendlies')
  })

  it('renders a deselected filter as an outline button', () => {
    const table = new StadiumAttendanceTable([makeRow()])
    expect(table.template).toContain('class="btn btn-info"')
    table.activeTypes.cup = false
    const html = table.template
    expect(html).toContain('class="btn btn-outline-info"')
    expect(html).toMatch(/btn-outline-info"[^>]*data-attendance-filter="cup"/)
  })

  it('filters rows by the active game types', () => {
    const table = new StadiumAttendanceTable([
      ...makeRows(2, 'league'),
      ...makeRows(3, 'cup'),
      ...makeRows(4, 'friendly')
    ])
    expect(table.filteredRows).toHaveLength(9)
    table.activeTypes.friendly = false
    expect(table.filteredRows).toHaveLength(5)
    table.activeTypes.cup = false
    expect(table.filteredRows.every(row => row.gameType === 'league')).toBe(true)
  })

  it('tells the user when the filters exclude every game', () => {
    const table = new StadiumAttendanceTable(makeRows(3, 'league'))
    table.activeTypes = { league: false, cup: false, friendly: false }
    expect(table.template).toContain('No home games match the selected filters.')
  })

  it('shows at most five rows per page', () => {
    const table = new StadiumAttendanceTable(makeRows(12))
    expect(table._buildTable().config.data).toHaveLength(5)
    expect(table._renderPagination()).toContain('pagination')
  })

  it('pages through the filtered rows', () => {
    const table = new StadiumAttendanceTable(makeRows(12))
    table._goToPage(2)
    expect(table._page).toBe(2)
    expect(table._buildTable().config.data).toHaveLength(2)
  })

  it('ignores page indexes outside the available range', () => {
    const table = new StadiumAttendanceTable(makeRows(7))
    table._goToPage(-1)
    expect(table._page).toBe(0)
    table._goToPage(5)
    expect(table._page).toBe(0)
  })

  it('hides the pagination for a single page of results', () => {
    const table = new StadiumAttendanceTable(makeRows(4))
    expect(table._renderPagination()).toBe('')
  })

  it('resets to the first page when a filter is toggled', () => {
    const table = new StadiumAttendanceTable(makeRows(12))
    table._page = 2
    table.events['(optional).stadium-attendance-filters'].click({
      target: {
        closest: () => ({ dataset: { attendanceFilter: 'friendly' } })
      }
    })
    expect(table.activeTypes.friendly).toBe(false)
    expect(table._page).toBe(0)
  })
})
