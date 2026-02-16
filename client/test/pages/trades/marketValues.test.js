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

import { MarketValuesPage, calculateMarketValue, getCellColor } from '../../../pages/trades/marketValues.js'

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

  it('table has rows for default level range (30-50) and 20 age columns', () => {
    const page = new MarketValuesPage()
    const html = page.template

    // Default range: levels 30 to 50
    for (let level = 30; level <= 50; level++) {
      expect(html).toContain(`<td><strong>${level}</strong></td>`)
    }

    // Levels outside default range should not appear
    expect(html).not.toContain(`<td><strong>29</strong></td>`)
    expect(html).not.toContain(`<td><strong>51</strong></td>`)

    // 20 age columns in header (16 through 35)
    for (let age = 16; age <= 35; age++) {
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

  it('cells have gray background when no transfer data exists', () => {
    const page = new MarketValuesPage()
    page._transferStats = {}
    const html = page.template
    expect(html).toContain('background: #f0f0f0')
  })

  it('cells have green background when avg price < 80% of estimate', async () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    const avgPrice = Math.floor(estimate * 0.5)
    page._transferStats = {
      '50:22': { avgPrice, count: 3 }
    }
    const html = page.template
    expect(html).toContain('background: #d1e7dd')
  })

  it('displays avgPrice in colored cell when transfer data exists', () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    const avgPrice = Math.floor(estimate * 0.5)
    page._transferStats = {
      '50:22': { avgPrice, count: 3 }
    }
    const html = page.template
    // The green-colored cell should contain avgPrice, not the estimate
    const formattedAvg = `${avgPrice.toLocaleString('de-DE')} €`
    expect(html).toContain(`background: #d1e7dd">${formattedAvg}</td>`)
  })

  it('displays estimate in gray cell when no transfer data exists', () => {
    const page = new MarketValuesPage()
    page._transferStats = {}
    const html = page.template
    const estimate = calculateMarketValue(50, 22)
    const formattedEstimate = `${estimate.toLocaleString('de-DE')} €`
    // Gray cells show the estimate
    expect(html).toContain(`background: #f0f0f0">${formattedEstimate}</td>`)
  })

  it('cells have yellow background when avg price is within 80-120% of estimate', async () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    page._transferStats = {
      '50:22': { avgPrice: estimate, count: 3 }
    }
    const html = page.template
    expect(html).toContain('background: #fff3cd')
  })

  it('cells have red background when avg price > 120% of estimate', async () => {
    const page = new MarketValuesPage()
    const estimate = calculateMarketValue(50, 22)
    page._transferStats = {
      '50:22': { avgPrice: Math.floor(estimate * 1.5), count: 3 }
    }
    const html = page.template
    expect(html).toContain('background: #f8d7da')
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
    it('level 100, age 22 = 50,000,000', () => {
      expect(calculateMarketValue(100, 22)).toBe(50_000_000)
    })

    it('level 50, age 22 = 1,562,500', () => {
      expect(calculateMarketValue(50, 22)).toBe(1_562_500)
    })

    it('level 100, age 30 = floor(50M * 0.75^8)', () => {
      const expected = Math.floor(50_000_000 * Math.pow(0.75, 8))
      expect(calculateMarketValue(100, 30)).toBe(expected)
    })

    it('younger age does not reduce price', () => {
      expect(calculateMarketValue(100, 16)).toBe(50_000_000)
      expect(calculateMarketValue(100, 20)).toBe(50_000_000)
    })

    it('lower level reduces price by half each step', () => {
      expect(calculateMarketValue(90, 22)).toBe(25_000_000)
      expect(calculateMarketValue(80, 22)).toBe(12_500_000)
    })
  })

  describe('getCellColor', () => {
    it('returns green when avgPrice < 80% of estimate', () => {
      expect(getCellColor(700, 1000)).toBe('background: #d1e7dd')
    })

    it('returns red when avgPrice > 120% of estimate', () => {
      expect(getCellColor(1300, 1000)).toBe('background: #f8d7da')
    })

    it('returns yellow when avgPrice is within 80-120% of estimate', () => {
      expect(getCellColor(1000, 1000)).toBe('background: #fff3cd')
      expect(getCellColor(800, 1000)).toBe('background: #fff3cd')
      expect(getCellColor(1200, 1000)).toBe('background: #fff3cd')
    })

    it('returns green at boundary (avgPrice exactly 79.9% of estimate)', () => {
      expect(getCellColor(799, 1000)).toBe('background: #d1e7dd')
    })

    it('returns red at boundary (avgPrice exactly 120.1% of estimate)', () => {
      expect(getCellColor(1201, 1000)).toBe('background: #f8d7da')
    })
  })
})
