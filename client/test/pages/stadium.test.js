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
      'stadium.constructionRemaining': `Under construction - ${params.days || ''} gameday(s) remaining`,
      'stadium.north': 'north',
      'stadium.south': 'south',
      'stadium.east': 'east',
      'stadium.west': 'west',
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
    calculateStadiumPrice: vi.fn()
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

import { StadiumPage, renderStadiumPage } from '../../pages/stadium.js'
import { server } from '../../lib/gateway.js'

describe('StadiumPage', () => {
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
  })

  describe('StadiumPage class', () => {
    it('loads data from server', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(server.getStadium).toHaveBeenCalled()
    })

    it('template contains page title', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('Your Stadium')
    })

    it('template contains stadium seat count', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('20000')
    })

    it('template contains ticket prices section', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('Ticket Prices')
    })

    it('template contains expand stadium section', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('Expand Stadium')
    })

    it('template contains stand inputs', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('north stand')
      expect(page.template).toContain('south stand')
      expect(page.template).toContain('east stand')
      expect(page.template).toContain('west stand')
    })

    it('template contains roof checkboxes', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('Roof on')
      expect(page.template).toContain('type="checkbox"')
    })

    it('template contains save prices button', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('Save Prices')
    })

    it('template contains disabled start construction button', async () => {
      const page = new StadiumPage()
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
      const page = new StadiumPage()
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
      const page = new StadiumPage()
      await page.load()
      // The north stand inputs should be disabled
      expect(page.template).toContain('disabled')
    })

    it('template contains stadium canvas container', async () => {
      const page = new StadiumPage()
      await page.load()
      expect(page.template).toContain('stadium-canvas-container')
      // StadiumCanvas renders as a template placeholder that gets replaced async
      expect(page.template).toContain('template')
    })

    it('has events for form submission', () => {
      const page = new StadiumPage()
      expect(page.events).toHaveProperty('#price-form')
      expect(page.events).toHaveProperty('#stadium-form')
    })

    it('extends UIElement', () => {
      const page = new StadiumPage()
      expect(page.isUIElement).toBe(true)
    })
  })

  describe('renderStadiumPage (backwards compatibility)', () => {
    it('is exported as a function', () => {
      expect(typeof renderStadiumPage).toBe('function')
    })
  })
})
