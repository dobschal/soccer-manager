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
      'stadium.expandStadiumAction': 'Expand Stadium',
      'stadium.north': 'north',
      'stadium.south': 'south',
      'stadium.east': 'east',
      'stadium.west': 'west',
      'stadium.corner_ne': 'NE Corner',
      'stadium.corner_nw': 'NW Corner',
      'stadium.corner_se': 'SE Corner',
      'stadium.corner_sw': 'SW Corner',
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
    updatePrices: vi.fn(),
    getStadiumAttendance: vi.fn(),
    getConstructionHistory: vi.fn(),
    getBuildings: vi.fn()
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

vi.mock('../../partials/stadiumExpandModal.js', () => ({
  showStadiumExpandModal: vi.fn()
}))

import { StadiumSubPage } from '../../pages/club/stadium.js'
import { server } from '../../lib/gateway.js'
import { showStadiumExpandModal } from '../../partials/stadiumExpandModal.js'

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
        west_stand_roof: 0,
        corner_ne_stand_size: 0,
        corner_nw_stand_size: 0,
        corner_se_stand_size: 0,
        corner_sw_stand_size: 0,
        corner_ne_stand_price: 13,
        corner_nw_stand_price: 13,
        corner_se_stand_price: 13,
        corner_sw_stand_price: 13,
        corner_ne_stand_roof: 0,
        corner_nw_stand_roof: 0,
        corner_se_stand_roof: 0,
        corner_sw_stand_roof: 0
      },
      constructionInfo: {
        north: { underConstruction: false },
        south: { underConstruction: false },
        east: { underConstruction: false },
        west: { underConstruction: false },
        corner_ne: { underConstruction: false },
        corner_nw: { underConstruction: false },
        corner_se: { underConstruction: false },
        corner_sw: { underConstruction: false }
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
    server.getBuildings.mockResolvedValue({ buildings: [{ type: 'training_area', level: 1 }] })
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

    it('template contains price inputs for all stands', async () => {
      const page = new StadiumSubPage()
      await page.load()
      const tpl = page.template
      for (const stand of ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']) {
        expect(tpl).toContain(`data-price-input="${stand}"`)
      }
    })

    it('template contains save prices button', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('Save Prices')
    })

    it('does not render the expand form inline anymore', async () => {
      const page = new StadiumSubPage()
      await page.load()
      const tpl = page.template
      expect(tpl).not.toContain('data-size-input')
      expect(tpl).not.toContain('data-roof-input')
      expect(tpl).not.toContain('id="total-price"')
    })

    it('template contains stadium canvas container', async () => {
      const page = new StadiumSubPage()
      await page.load()
      expect(page.template).toContain('stadium-canvas-container')
      // StadiumCanvas renders as a template placeholder that gets replaced async
      expect(page.template).toContain('template')
    })

    it('has events for the price form and the expand button', () => {
      const page = new StadiumSubPage()
      expect(page.events).toHaveProperty('#price-form')
      expect(page.events).toHaveProperty('#open-expand-modal-btn')
    })

    it('extends UIElement', () => {
      const page = new StadiumSubPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('Expand stadium button', () => {
    it('renders the expand button below the construction section heading', async () => {
      const page = new StadiumSubPage()
      await page.load()
      const tpl = page.template
      expect(tpl).toContain('id="open-expand-modal-btn"')
      expect(tpl).toContain('Expand Stadium')
      // The button sits underneath the "construction" heading
      expect(tpl.indexOf('Construction History')).toBeLessThan(tpl.indexOf('open-expand-modal-btn'))
    })

    it('opens the expand modal with the current stadium state on click', async () => {
      const page = new StadiumSubPage()
      await page.load()
      page.events['#open-expand-modal-btn'].click()
      expect(showStadiumExpandModal).toHaveBeenCalledWith(
        page.stadium,
        page.team,
        page.constructionInfo,
        expect.any(Function)
      )
    })

    it('refreshes the page when a construction was commissioned', async () => {
      const page = new StadiumSubPage()
      await page.load()
      const updateSpy = vi.spyOn(page, 'update').mockResolvedValue(undefined)
      page.events['#open-expand-modal-btn'].click()
      const onConstructionStarted = showStadiumExpandModal.mock.calls[0][3]
      onConstructionStarted()
      expect(updateSpy).toHaveBeenCalledWith(true)
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

    describe('During construction', () => {
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

      it('shows in-progress badge in construction history', async () => {
        const page = new StadiumSubPage()
        await page.load()
        expect(page.template).toContain('In Progress')
        expect(page.template).toContain('badge')
      })

      it('hands the construction info over to the expand modal', async () => {
        const page = new StadiumSubPage()
        await page.load()
        page.events['#open-expand-modal-btn'].click()
        expect(showStadiumExpandModal.mock.calls[0][2].north).toEqual({
          underConstruction: true,
          remainingGameDays: 3,
          targetSize: 8000,
          targetRoof: 1
        })
      })
    })

    describe('After construction completed', () => {
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

      it('shows updated total seat count', async () => {
        const page = new StadiumSubPage()
        await page.load()
        // 8000 + 5000 + 5000 + 5000 = 23000
        expect(page.template).toContain('23000')
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
  })

  describe('StadiumSubPage export', () => {
    it('is a UIElement class', () => {
      expect(StadiumSubPage.isUIElement).toBe(true)
    })
  })
})
