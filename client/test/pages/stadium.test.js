import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key, params = {}) => {
    const translations = {
      'stadium.yourStadium': 'Your Stadium',
      'stadium.stadiumDesc': `Here is your beautiful stadium with ${params.seats || ''} seats:`,
      'stadium.ticketPrices': 'Ticket Prices',
      'stadium.adjustPrices': 'Adjust the prices of your stadium tickets.',
      'stadium.priceFor': `Price for tickets on ${params.stand || ''} stand`,
      'stadium.savePrices': 'Save Prices',
      'stadium.expandStadium': 'Expand Stadium',
      'stadium.expandDesc': 'Add more seats to your stadium to get more fans excited.',
      'stadium.seatsOnStand': `Seats on ${params.stand || ''} stand`,
      'stadium.changeSeatsHint': 'Change the amount of seats here to expand your stadium.',
      'stadium.roofOnStand': `Roof on ${params.stand || ''} stand?`,
      'stadium.totalPrice': 'Total Price for construction:',
      'stadium.startConstruction': 'Start Construction',
      'stadium.constructionRemaining': `Under construction - ${params.days ?? ''} gameday(s) remaining`,
      'stadium.constructionCompletesToday': 'Completes today.',
      'stadium.constructionTargetSize': `Expanding to ${params.seats ?? ''} seats`,
      'stadium.north': 'north',
      'stadium.south': 'south',
      'stadium.east': 'east',
      'stadium.west': 'west',
      'stadium.attendance': 'Attendance',
      'stadium.attendanceDesc': 'Attendance per stand for your last 5 home games.',
      'stadium.noAttendanceData': 'No attendance data available yet.',
      'stadium.constructionHistory': 'Construction History',
      'stadium.constructionHistoryDesc': 'All past and current stadium construction projects.',
      'stadium.noConstructionHistory': 'No construction history yet.',
      'stadium.stand': 'Stand',
      'stadium.oldSize': 'Old Size',
      'stadium.newSize2': 'New Size',
      'stadium.roofAdded': 'Roof Added',
      'stadium.started': 'Started',
      'stadium.completed': 'Completed',
      'stadium.inProgress': 'In Progress',
      'stadium.seasonDay': `S${params.season ?? ''} Day ${params.day ?? ''}`,
      'toast.somethingWentWrong': 'Something went wrong!'
    }
    return translations[key] || key
  })
}))

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getStadium: vi.fn(),
    getMyTeam: vi.fn(),
    buildStadium: vi.fn(),
    updatePrices: vi.fn(),
    calculateStadiumPrice: vi.fn(),
    getStadiumAttendance: vi.fn(),
    getConstructionHistory: vi.fn()
  }
}))

vi.mock('../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

import { StadiumSubPage } from '../../pages/club/stadium.js'
import { server } from '../../lib/gateway.js'

describe('StadiumSubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getStadium.mockResolvedValue({
      stadium: {
        id: 1,
        north_stand_size: 5000,
        south_stand_size: 5000,
        east_stand_size: 5000,
        west_stand_size: 5000,
        north_stand_price: 20,
        south_stand_price: 20,
        east_stand_price: 20,
        west_stand_price: 20,
        north_stand_roof: 0,
        south_stand_roof: 0,
        east_stand_roof: 0,
        west_stand_roof: 0
      },
      constructionInfo: {
        north: { underConstruction: false },
        south: { underConstruction: false },
        east: { underConstruction: false },
        west: { underConstruction: false }
      }
    })
    server.getMyTeam.mockResolvedValue({
      team: {
        id: 1,
        name: 'Test FC',
        color: '#FF0000'
      }
    })
    server.getStadiumAttendance.mockResolvedValue({ attendance: [] })
    server.getConstructionHistory.mockResolvedValue({ history: [] })
  })

  describe('StadiumSubPage class', () => {
    it('loads data from server', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(server.getStadium).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Your Stadium')
    })

    it('template contains stadium seat count', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('20000')
    })

    it('template contains ticket prices section', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Ticket Prices')
    })

    it('template contains expand stadium section', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Expand Stadium')
    })

    it('template contains stand inputs', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('north stand')
      expect(page.template).toContain('south stand')
      expect(page.template).toContain('east stand')
      expect(page.template).toContain('west stand')
    })

    it('template contains roof checkboxes', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Roof on')
      expect(page.template).toContain('type="checkbox"')
    })

    it('template contains save prices button', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Save Prices')
    })

    it('template contains disabled start construction button', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Start Construction')
      // Button should be disabled by default until construction is validated
      expect(page.template).toContain('disabled')
    })

    it('shows construction status when stand is under construction', async () => {
      server.getStadium.mockResolvedValue({
        stadium: {
          id: 1,
          north_stand_size: 5000,
          south_stand_size: 5000,
          east_stand_size: 5000,
          west_stand_size: 5000,
          north_stand_price: 20,
          south_stand_price: 20,
          east_stand_price: 20,
          west_stand_price: 20,
          north_stand_roof: 0,
          south_stand_roof: 0,
          east_stand_roof: 0,
          west_stand_roof: 0
        },
        constructionInfo: {
          north: { underConstruction: true, remainingGameDays: 5 },
          south: { underConstruction: false },
          east: { underConstruction: false },
          west: { underConstruction: false }
        }
      })
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Under construction')
      expect(page.template).toContain('5 gameday(s) remaining')
    })

    it('disables inputs for stands under construction', async () => {
      server.getStadium.mockResolvedValue({
        stadium: {
          id: 1,
          north_stand_size: 5000,
          south_stand_size: 5000,
          east_stand_size: 5000,
          west_stand_size: 5000,
          north_stand_price: 20,
          south_stand_price: 20,
          east_stand_price: 20,
          west_stand_price: 20,
          north_stand_roof: 0,
          south_stand_roof: 0,
          east_stand_roof: 0,
          west_stand_roof: 0
        },
        constructionInfo: {
          north: { underConstruction: true, remainingGameDays: 5 },
          south: { underConstruction: false },
          east: { underConstruction: false },
          west: { underConstruction: false }
        }
      })
      const page = new StadiumSubPage()
      await page.load()
      // The north stand inputs should be disabled
      expect(page.template).toContain('disabled')
    })

    it('template contains stadium canvas container', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('stadium-canvas-container')
      // StadiumCanvas renders as a template placeholder that gets replaced async
      expect(page.template).toContain('template')
    })

    it('has events for form submission', () => {
      const page = new StadiumSubPage()
      expect(page.events).toHaveProperty('#price-form')
      expect(page.events).toHaveProperty('#stadium-form')
    })

    it('extends UIElement', () => {
      const page = new StadiumSubPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('Attendance section', () => {
    it('renders empty state when no attendance data', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('No attendance data available yet.')
    })

    it('renders attendance table with data', async () => {
      server.getStadiumAttendance.mockResolvedValue({
        attendance: [
          {
            season: 1,
            gameDay: 5,
            stands: {
              north: { guests: 4000, size: 5000, percentage: 80 },
              south: { guests: 3500, size: 5000, percentage: 70 },
              east: { guests: 2500, size: 5000, percentage: 50 },
              west: { guests: 4500, size: 5000, percentage: 90 }
            }
          }
        ]
      })
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('4,000')
      expect(page.template).toContain('80%')
      expect(page.template).toContain('S2 Day 6')
    })
  })

  describe('Construction history section', () => {
    it('renders empty state when no history', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('No construction history yet.')
    })

    it('renders history table with past constructions', async () => {
      server.getConstructionHistory.mockResolvedValue({
        history: [
          {
            stand: 'north',
            old_size: 5000,
            new_size: 8000,
            added_roof: 0,
            started_game_day: 3,
            started_season: 1,
            completed_game_day: 8,
            completed_season: 1
          }
        ]
      })
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('5,000')
      expect(page.template).toContain('8,000')
      expect(page.template).toContain('S2 Day 4')
      expect(page.template).toContain('S2 Day 9')
    })

    it('renders in-progress badge for active construction', async () => {
      server.getConstructionHistory.mockResolvedValue({
        history: [
          {
            stand: 'south',
            old_size: 3000,
            new_size: 6000,
            added_roof: 1,
            started_game_day: 10,
            started_season: 2,
            completed_game_day: null,
            completed_season: null
          }
        ]
      })
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('In Progress')
      expect(page.template).toContain('badge')
    })
  })

  describe('Stadium build lifecycle', () => {
    const baseStadium = {
      id: 1,
      north_stand_size: 5000,
      south_stand_size: 5000,
      east_stand_size: 5000,
      west_stand_size: 5000,
      north_stand_price: 20,
      south_stand_price: 20,
      east_stand_price: 20,
      west_stand_price: 20,
      north_stand_roof: 0,
      south_stand_roof: 0,
      east_stand_roof: 0,
      west_stand_roof: 0
    }

    describe('Phase 1: Before construction', () => {
      it('shows current sizes in expand form inputs', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const tpl = page.template
        expect(tpl).toContain('value="5000"')
      })

      it('all stand inputs are enabled', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const tpl = page.template
        const sizeInputs = tpl.match(/data-size-input="(north|south|east|west)"/g)
        expect(sizeInputs).toHaveLength(4)
        // None of the size inputs should have disabled in the same <input> tag
        for (const stand of ['north', 'south', 'east', 'west']) {
          expect(tpl).not.toMatch(new RegExp(`data-size-input="${stand}"[^>]*disabled`))
        }
      })

      it('shows no construction badges', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toContain('Under construction')
        expect(page.template).not.toContain('gameday(s) remaining')
      })

      it('shows empty construction history', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('No construction history yet.')
      })

      it('shows total seat count for all 4 stands', async () => {
        const page = new StadiumSubPage()
        await page.load()
        // 4 x 5000 = 20000
        expect(page.template).toContain('20000')
      })
    })

    describe('Phase 2: During construction (remaining > 0)', () => {
      beforeEach(() => {
        server.getStadium.mockResolvedValue({
          stadium: { ...baseStadium },
          constructionInfo: {
            north: { underConstruction: true, remainingGameDays: 3, targetSize: 8000, targetRoof: 1 },
            south: { underConstruction: false },
            east: { underConstruction: false },
            west: { underConstruction: false }
          }
        })
        server.getConstructionHistory.mockResolvedValue({
          history: [{
            stand: 'north',
            old_size: 5000,
            new_size: 8000,
            added_roof: 1,
            started_game_day: 5,
            started_season: 0,
            completed_game_day: null,
            completed_season: null
          }]
        })
      })

      it('shows construction badge with remaining days on the stand under construction', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('Under construction')
        expect(page.template).toContain('3 gameday(s) remaining')
      })

      it('shows the target seat count on the stand under construction', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('Expanding to 8,000 seats')
      })

      it('disables size input for the stand under construction', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-size-input="north"[^>]*disabled/)
      })

      it('disables roof checkbox for the stand under construction', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-roof-input="north"[^>]*disabled/)
      })

      it('keeps other stands enabled', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const tpl = page.template
        for (const stand of ['south', 'east', 'west']) {
          expect(tpl).not.toMatch(new RegExp(`data-size-input="${stand}"[^>]*disabled`))
        }
      })

      it('still shows old size in input (not the target size)', async () => {
        const page = new StadiumSubPage()
        await page.load()
        // The stadium still has 5000 for north_stand_size (construction hasn't completed)
        const northMatch = page.template.match(/data-size-input="north"[\s\S]*?value="(\d+)"/)
        expect(northMatch).toBeTruthy()
        expect(northMatch[1]).toBe('5000')
      })

      it('shows in-progress badge in construction history', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('In Progress')
        expect(page.template).toContain('badge')
      })
    })

    describe('Phase 3: Construction due but not yet completed (remaining = 0)', () => {
      beforeEach(() => {
        server.getStadium.mockResolvedValue({
          stadium: { ...baseStadium },
          constructionInfo: {
            north: { underConstruction: true, remainingGameDays: 0, targetSize: 8000, targetRoof: 1 },
            south: { underConstruction: false },
            east: { underConstruction: false },
            west: { underConstruction: false }
          }
        })
        server.getConstructionHistory.mockResolvedValue({
          history: [{
            stand: 'north',
            old_size: 5000,
            new_size: 8000,
            added_roof: 1,
            started_game_day: 5,
            started_season: 0,
            completed_game_day: null,
            completed_season: null
          }]
        })
      })

      it('still shows as under construction with completes-today message', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('Completes today.')
        expect(page.template).not.toContain('0 gameday(s) remaining')
      })

      it('still disables the stand input', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-size-input="north"[^>]*disabled/)
      })

      it('still shows old size (construction not finalized)', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const northMatch = page.template.match(/data-size-input="north"[\s\S]*?value="(\d+)"/)
        expect(northMatch[1]).toBe('5000')
      })

      it('history still shows in-progress badge', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('In Progress')
      })
    })

    describe('Phase 4: After construction completed', () => {
      beforeEach(() => {
        server.getStadium.mockResolvedValue({
          stadium: {
            ...baseStadium,
            north_stand_size: 8000,
            north_stand_roof: 1
          },
          constructionInfo: {
            north: { underConstruction: false },
            south: { underConstruction: false },
            east: { underConstruction: false },
            west: { underConstruction: false }
          }
        })
        server.getConstructionHistory.mockResolvedValue({
          history: [{
            stand: 'north',
            old_size: 5000,
            new_size: 8000,
            added_roof: 1,
            started_game_day: 5,
            started_season: 0,
            completed_game_day: 10,
            completed_season: 0
          }]
        })
      })

      it('shows updated size in expand form input', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const northMatch = page.template.match(/data-size-input="north"[\s\S]*?value="(\d+)"/)
        expect(northMatch[1]).toBe('8000')
      })

      it('shows updated total seat count', async () => {
        const page = new StadiumSubPage()
        await page.load()
        // 8000 + 5000 + 5000 + 5000 = 23000
        expect(page.template).toContain('23000')
      })

      it('roof checkbox is now checked', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-roof-input="north"[\s\S]*?checked/)
      })

      it('no construction badges shown', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toContain('gameday(s) remaining')
      })

      it('stand input is enabled again', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toMatch(/data-size-input="north"[^>]*disabled/)
      })

      it('construction history shows completed entry with dates', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toContain('In Progress')
        // started: season 0 + 1 = S1, day 5 + 1 = Day 6
        expect(page.template).toContain('S1 Day 6')
        // completed: season 0 + 1 = S1, day 10 + 1 = Day 11
        expect(page.template).toContain('S1 Day 11')
        expect(page.template).toContain('5,000')
        expect(page.template).toContain('8,000')
      })
    })

    describe('Multiple stands in different phases', () => {
      beforeEach(() => {
        server.getStadium.mockResolvedValue({
          stadium: {
            ...baseStadium,
            north_stand_size: 8000,
            north_stand_roof: 1
          },
          constructionInfo: {
            north: { underConstruction: false },
            south: { underConstruction: true, remainingGameDays: 5 },
            east: { underConstruction: true, remainingGameDays: 0 },
            west: { underConstruction: false }
          }
        })
        server.getConstructionHistory.mockResolvedValue({
          history: [
            { stand: 'east', old_size: 5000, new_size: 7000, added_roof: 0, started_game_day: 2, started_season: 0, completed_game_day: null, completed_season: null },
            { stand: 'south', old_size: 5000, new_size: 10000, added_roof: 1, started_game_day: 1, started_season: 0, completed_game_day: null, completed_season: null },
            { stand: 'north', old_size: 5000, new_size: 8000, added_roof: 1, started_game_day: 0, started_season: 0, completed_game_day: 5, completed_season: 0 }
          ]
        })
      })

      it('north (completed) is enabled with new size', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toMatch(/data-size-input="north"[^>]*disabled/)
        const northMatch = page.template.match(/data-size-input="north"[\s\S]*?value="(\d+)"/)
        expect(northMatch[1]).toBe('8000')
      })

      it('south (active, 5 days remaining) is disabled with badge', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-size-input="south"[^>]*disabled/)
        expect(page.template).toContain('5 gameday(s) remaining')
      })

      it('east (due, 0 days remaining) is disabled with completes-today badge', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toMatch(/data-size-input="east"[^>]*disabled/)
        expect(page.template).toContain('Completes today.')
      })

      it('west (no construction) is enabled', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).not.toMatch(/data-size-input="west"[^>]*disabled/)
      })

      it('construction history shows 2 in-progress and 1 completed entry', async () => {
        const page = new StadiumSubPage()
        await page.load()
        const tpl = page.template
        const inProgressMatches = tpl.match(/In Progress/g)
        expect(inProgressMatches).toHaveLength(2)
        // The north entry has a completed date
        expect(tpl).toContain('S1 Day 6')
      })
    })
  })

  describe('StadiumSubPage export', () => {
    it('is a UIElement class', () => {
      expect(StadiumSubPage.isUIElement).toBe(true)
    })
  })
})
