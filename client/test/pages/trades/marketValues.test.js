import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockServer } = vi.hoisted(() => ({
  mockServer: {
    getTransferStats: vi.fn().mockResolvedValue({})
  }
}))

vi.mock('../../../lib/gateway.js', () => ({
  server: mockServer
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn().mockReturnValue('test-id'),
  el: vi.fn()
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString('de-DE')} €`)
  }
}))

import { MarketValuesPage } from '../../../pages/trades/marketValues.js'
import { calculateMarketValue } from '../../../util/player.js'

describe('MarketValuesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServer.getTransferStats.mockResolvedValue({})
  })

  it('extends UIElement', () => {
    const page = new MarketValuesPage()
    expect(page.isUIElement).toBe(true)
  })

  it('template contains position select with all 12 positions', () => {
    const page = new MarketValuesPage()
    const html = page.template

    expect(html).toContain('<select')
    expect(html).toContain('id="position-select"')

    const positions = ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'LA', 'CA', 'RA']
    for (const pos of positions) {
      expect(html).toContain(`value="${pos}"`)
    }
  })

  it('table has rows for default level range (40-50) and age columns 20-30', () => {
    const page = new MarketValuesPage()
    const html = page.template

    // Default range: levels 40 to 50
    for (let level = 40; level <= 50; level++) {
      expect(html).toContain(`<td><strong>${level}</strong></td>`)
    }

    // Levels outside default range should not appear
    expect(html).not.toContain(`<td><strong>39</strong></td>`)
    expect(html).not.toContain(`<td><strong>51</strong></td>`)

    // Age columns in header (20 through 30)
    for (let age = 20; age <= 30; age++) {
      expect(html).toContain(`<th class="text-center">${age}</th>`)
    }
  })

  it('has from-level and to-level selects', () => {
    const page = new MarketValuesPage()
    const html = page.template

    expect(html).toContain('id="from-level-select"')
    expect(html).toContain('id="to-level-select"')
  })

  it('adjusts table rows when level range changes', () => {
    const page = new MarketValuesPage()
    page._fromLevel = 80
    page._toLevel = 90
    const html = page.template

    for (let level = 80; level <= 90; level++) {
      expect(html).toContain(`<td><strong>${level}</strong></td>`)
    }
    expect(html).not.toContain(`<td><strong>79</strong></td>`)
    expect(html).not.toContain(`<td><strong>91</strong></td>`)
  })

  it('from-level change clamps to-level upward', () => {
    const page = new MarketValuesPage()
    page.update = vi.fn()
    page._fromLevel = 30
    page._toLevel = 50

    const handler = page.events['#from-level-select'].change
    handler({ target: { value: '60' } })

    expect(page._fromLevel).toBe(60)
    expect(page._toLevel).toBe(60)
  })

  it('to-level change clamps from-level downward', () => {
    const page = new MarketValuesPage()
    page.update = vi.fn()
    page._fromLevel = 30
    page._toLevel = 50

    const handler = page.events['#to-level-select'].change
    handler({ target: { value: '20' } })

    expect(page._toLevel).toBe(20)
    expect(page._fromLevel).toBe(20)
  })

  it('cells have gray text when no transfer data exists', () => {
    const page = new MarketValuesPage()
    page._transferStats = {}
    const html = page.template
    expect(html).toContain('color: #c0c0c0;')
  })

  it('cells without transfer data show estimate in gray text', () => {
    const page = new MarketValuesPage()
    page._transferStats = {}
    const html = page.template
    const estimate = calculateMarketValue(50, 22)
    const formattedEstimate = `${estimate.toLocaleString('de-DE')} €`
    expect(html).toContain(`color: #c0c0c0;">${formattedEstimate}</td>`)
  })

  it('cells with transfer data show avgPrice without gray styling', () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    const avgPrice = Math.floor(estimate * 0.5)
    page._transferStats = {
      '50:22': { avgPrice, count: 3 }
    }
    const html = page.template
    const formattedAvg = `${avgPrice.toLocaleString('de-DE')} €`
    expect(html).toContain(`style="">${formattedAvg}</td>`)
  })

  it('cells with transfer data display avgPrice value', () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    const avgPrice = Math.floor(estimate * 0.5)
    page._transferStats = {
      '50:22': { avgPrice, count: 3 }
    }
    const html = page.template
    const formattedAvg = `${avgPrice.toLocaleString('de-DE')} €`
    expect(html).toContain(formattedAvg)
  })

  it('cells without transfer data display estimate value', () => {
    const page = new MarketValuesPage()
    page._transferStats = {}
    const html = page.template
    const estimate = calculateMarketValue(50, 22)
    const formattedEstimate = `${estimate.toLocaleString('de-DE')} €`
    expect(html).toContain(formattedEstimate)
  })

  it('cells with transfer data use empty style, cells without use gray color', () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    page._transferStats = {
      '50:22': { avgPrice: estimate, count: 3 }
    }
    const html = page.template
    // Cell with data has empty style
    expect(html).toContain('style="">')
    // Cells without data have gray color
    expect(html).toContain('color: #c0c0c0;')
  })

  it('cells with high avgPrice still render without background color', () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    page._transferStats = {
      '50:22': { avgPrice: Math.floor(estimate * 1.5), count: 3 }
    }
    const html = page.template
    const formattedAvg = `${Math.floor(estimate * 1.5).toLocaleString('de-DE')} €`
    expect(html).toContain(formattedAvg)
  })

  it('load fetches transfer stats for selected position', async () => {
    const page = new MarketValuesPage()
    page._selectedPosition = 'GK'
    mockServer.getTransferStats.mockResolvedValue({ '50:22': { avgPrice: 1000000, count: 2 } })
    await page.load()
    expect(mockServer.getTransferStats).toHaveBeenCalledWith('GK')
    expect(page._transferStats).toEqual({ '50:22': { avgPrice: 1000000, count: 2 } })
  })

  it('position change triggers update with reload', () => {
    const page = new MarketValuesPage()
    page.update = vi.fn()
    const handler = page.events['#position-select'].change
    handler({ target: { value: 'LA' } })
    expect(page._selectedPosition).toBe('LA')
    expect(page.update).toHaveBeenCalledWith(true)
  })

  describe('calculateMarketValue', () => {
    it('level 100, age 22 = 40,000,000', () => {
      expect(calculateMarketValue(100, 22)).toBe(40_000_000)
    })

    it('level 50, age 22 = 1,250,000', () => {
      expect(calculateMarketValue(50, 22)).toBe(1_250_000)
    })

    it('level 100, age 30 = floor(40M * 0.75^8)', () => {
      const expected = Math.floor(40_000_000 * Math.pow(0.75, 8))
      expect(calculateMarketValue(100, 30)).toBe(expected)
    })

    it('younger age does not reduce price', () => {
      expect(calculateMarketValue(100, 16)).toBe(40_000_000)
      expect(calculateMarketValue(100, 20)).toBe(40_000_000)
    })

    it('lower level reduces price by half each step', () => {
      expect(calculateMarketValue(90, 22)).toBe(20_000_000)
      expect(calculateMarketValue(80, 22)).toBe(10_000_000)
    })
  })

})
