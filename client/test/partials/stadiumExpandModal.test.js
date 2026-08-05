import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../i18n/index.js', () => ({
  t: (key, params = {}) => {
    const translations = {
      'stadium.expandStadium': 'Expand Stadium',
      'stadium.expandDesc': 'Add more seats to your stadium to get more fans excited.',
      'stadium.seatsOnStand': `Seats on ${params.stand ?? ''} stand`,
      'stadium.changeSeatsHint': 'Change the amount of seats here to expand your stadium.',
      'stadium.roofOnStand': `Roof on ${params.stand ?? ''} stand?`,
      'stadium.calculateStadium': 'Calculate Stadium',
      'stadium.commissionConstruction': 'Commission Construction',
      'stadium.constructionStarted': 'Construction has started!',
      'stadium.constructionTimeEstimate': 'Construction Time Estimate:',
      'stadium.constructionRemaining': `Under construction - ${params.days ?? ''} gameday(s) remaining`,
      'stadium.constructionCompletesToday': 'Completes today.',
      'stadium.constructionTargetSize': `Expanding to ${params.seats ?? ''} seats`,
      'stadium.gameDaysSingle': `${params.days ?? ''} gameday`,
      'stadium.gameDaysPlural': `${params.days ?? ''} gamedays`,
      'stadium.includesRoof': '(includes roof)',
      'stadium.includesRoofExtension': '(includes roof extension)',
      'stadium.includesRoofRemoval': '(roof gets torn down)',
      'stadium.roofCostHint': 'A new roof comes at a surcharge.',
      'stadium.stadiumDesc': `Here is your beautiful stadium with ${params.seats ?? ''} seats:`,
      'stadium.totalPrice': 'Total Price for construction:',
      'stadium.makeChangesFirst': 'Please make changes and wait for cost calculation',
      'stadium.north': 'north',
      'stadium.south': 'south',
      'stadium.east': 'east',
      'stadium.west': 'west',
      'stadium.corner_ne': 'NE Corner',
      'stadium.corner_nw': 'NW Corner',
      'stadium.corner_se': 'SE Corner',
      'stadium.corner_sw': 'SW Corner',
      'toast.somethingWentWrong': 'Something went wrong!'
    }
    return translations[key] ?? key
  }
}))

vi.mock('../../lib/gateway.js', () => ({
  server: {
    calculateStadiumPrice: vi.fn(),
    buildStadium: vi.fn()
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val.toLocaleString()} EUR`)
  }
}))

const canvasInstances = []

vi.mock('../../partials/stadiumCanvas.js', () => ({
  StadiumCanvas: class {
    constructor (stadium, team, canvasId, options) {
      this.stadium = stadium
      this.team = team
      this.canvasId = canvasId
      this.options = options
      this.onDestroy = vi.fn()
      canvasInstances.push(this)
    }

    calculateTotalSeats () {
      return ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
        .reduce((total, name) => total + (this.stadium[name + '_stand_size'] || 0), 0)
    }

    toString () {
      return `<canvas id="${this.canvasId}"></canvas>`
    }
  }
}))

const { showStadiumExpandModal } = await import('../../partials/stadiumExpandModal.js')
const { server } = await import('../../lib/gateway.js')
const { toast } = await import('../../partials/toast.js')

const STANDS = ['north', 'south', 'east', 'west', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw']

const stadium = {
  id: 7,
  north_stand_size: 5000,
  south_stand_size: 5000,
  east_stand_size: 3000,
  west_stand_size: 3000,
  corner_ne_stand_size: 0,
  corner_nw_stand_size: 0,
  corner_se_stand_size: 0,
  corner_sw_stand_size: 0,
  north_stand_roof: 1,
  south_stand_roof: 0,
  east_stand_roof: 0,
  west_stand_roof: 0,
  corner_ne_stand_roof: 0,
  corner_nw_stand_roof: 0,
  corner_se_stand_roof: 0,
  corner_sw_stand_roof: 0
}

const team = { id: 3, name: 'Test FC', color: '#FF0000' }

/** Let the async click handlers settle. */
function flush () {
  return new Promise(resolve => setTimeout(resolve))
}

function calculateButton () {
  return [...document.querySelectorAll('button')].find(b => b.textContent.includes('Calculate Stadium'))
}

function buildButton () {
  return [...document.querySelectorAll('button')].find(b => b.textContent.includes('Commission Construction'))
}

function sizeInput (stand) {
  return document.querySelector(`[data-size-input="${stand}"]`)
}

function setSize (stand, value) {
  const input = sizeInput(stand)
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setRoof (stand, checked) {
  const input = document.querySelector(`[data-roof-input="${stand}"]`)
  input.checked = checked
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('showStadiumExpandModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canvasInstances.length = 0
    document.body.innerHTML = ''
  })

  it('renders size and roof inputs for every stand with the current values', () => {
    showStadiumExpandModal(stadium, team)
    for (const stand of STANDS) {
      expect(sizeInput(stand)).not.toBeNull()
      expect(document.querySelector(`[data-roof-input="${stand}"]`)).not.toBeNull()
    }
    expect(sizeInput('north').value).toBe('5000')
    expect(sizeInput('east').value).toBe('3000')
    expect(document.querySelector('[data-roof-input="north"]').checked).toBe(true)
    expect(document.querySelector('[data-roof-input="south"]').checked).toBe(false)
  })

  it('shows neither price nor preview before the calculation was requested', () => {
    showStadiumExpandModal(stadium, team)
    expect(calculateButton()).not.toBeNull()
    expect(buildButton()).toBeUndefined()
    expect(document.body.textContent).not.toContain('Total Price for construction:')
    expect(document.querySelector('#stadium-expand-canvas')).toBeNull()
    expect(server.calculateStadiumPrice).not.toHaveBeenCalled()
  })

  it('does not calculate the price while inputs change', async () => {
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    setRoof('south', true)
    await flush()
    expect(server.calculateStadiumPrice).not.toHaveBeenCalled()
  })

  it('shows price, construction time and the 3D preview after calculating', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 1_500_000,
      constructionTimes: {
        north: { days: 4, seatsDiff: 3000, addingRoof: false },
        south: { days: 1, seatsDiff: 500, addingRoof: true }
      }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    expect(server.calculateStadiumPrice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, north_stand_size: 8000 })
    )
    expect(document.body.textContent).toContain('1,500,000 EUR')
    expect(document.body.textContent).toContain('Construction Time Estimate:')
    expect(document.body.textContent).toContain('4 gamedays')
    expect(document.body.textContent).toContain('1 gameday')
    expect(document.body.textContent).toContain('(includes roof)')
    expect(document.querySelector('#stadium-expand-canvas')).not.toBeNull()
    expect(buildButton()).not.toBeUndefined()
  })

  it('previews the planned stadium, not the current one', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    expect(canvasInstances).toHaveLength(1)
    expect(canvasInstances[0].stadium.north_stand_size).toBe(8000)
    // 8000 + 5000 + 3000 + 3000 = 19000
    expect(document.body.textContent).toContain('19000')
  })

  it('shows the preview without controls, orbiting and free of building sites', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    // `showConstruction: false`: the preview shows the finished plan, so a stand
    // that happens to be under construction right now is still drawn complete.
    expect(canvasInstances[0].options).toEqual({
      interactive: false,
      autoRotate: true,
      showConstruction: false
    })
  })

  it('shows no price and no preview when the plan is invalid', async () => {
    server.calculateStadiumPrice.mockRejectedValue(new Error('Minimum size for north stand is 200 seats.'))
    showStadiumExpandModal(stadium, team)
    setSize('north', 10)
    calculateButton().click()
    await flush()

    expect(toast).toHaveBeenCalledWith('Minimum size for north stand is 200 seats.', 'error')
    expect(document.body.textContent).not.toContain('Total Price for construction:')
    expect(document.querySelector('#stadium-expand-canvas')).toBeNull()
    expect(buildButton()).toBeUndefined()
  })

  it('labels a roof extension and a roof teardown in the construction list', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 700_000,
      constructionTimes: {
        north: { days: 8, seatsDiff: 3000, addingRoof: false, extendingRoof: true, removingRoof: false },
        south: { days: 8, seatsDiff: 1000, addingRoof: false, extendingRoof: false, removingRoof: true }
      }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    expect(document.body.textContent).toContain('(includes roof extension)')
    expect(document.body.textContent).toContain('(roof gets torn down)')
    expect(document.body.textContent).not.toContain('(includes roof)')
  })

  it('allows a free roof teardown - a zero price is a valid plan', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 0,
      constructionTimes: {
        north: { days: 8, seatsDiff: 0, addingRoof: false, extendingRoof: false, removingRoof: true }
      }
    })
    showStadiumExpandModal(stadium, team)
    setRoof('north', false)
    calculateButton().click()
    await flush()

    expect(document.body.textContent).toContain('0 EUR')
    expect(document.querySelector('#stadium-expand-canvas')).not.toBeNull()
    expect(buildButton()).not.toBeUndefined()
    expect(toast).not.toHaveBeenCalled()
  })

  it('shows no preview when nothing was changed', async () => {
    server.calculateStadiumPrice.mockResolvedValue({ totalPrice: 0, constructionTimes: {} })
    showStadiumExpandModal(stadium, team)
    calculateButton().click()
    await flush()

    expect(toast).toHaveBeenCalledWith('Please make changes and wait for cost calculation', 'error')
    expect(document.querySelector('#stadium-expand-canvas')).toBeNull()
    expect(buildButton()).toBeUndefined()
  })

  it('shows no preview when a stand is blocked by a running construction', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 900_000,
      constructionTimes: {
        north: { blocked: true, message: 'north stand is already under construction' }
      }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    expect(toast).toHaveBeenCalledWith('north stand is already under construction', 'error')
    expect(document.querySelector('#stadium-expand-canvas')).toBeNull()
    expect(buildButton()).toBeUndefined()
  })

  it('drops the preview again when an input is changed', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()
    expect(document.querySelector('#stadium-expand-canvas')).not.toBeNull()

    setSize('north', 9000)
    expect(document.querySelector('#stadium-expand-canvas')).toBeNull()
    expect(buildButton()).toBeUndefined()
    expect(document.body.textContent).not.toContain('Total Price for construction:')
    // The 3D scene of the dropped preview is cleaned up
    expect(canvasInstances[0].onDestroy).toHaveBeenCalled()
  })

  it('commissions the build with the planned stadium and closes the overlay', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    server.buildStadium.mockResolvedValue({ success: true, constructionInfo: {} })
    const onConstructionStarted = vi.fn()
    showStadiumExpandModal(stadium, team, {}, onConstructionStarted)
    setSize('north', 8000)
    setRoof('south', true)
    calculateButton().click()
    await flush()

    buildButton().click()
    await flush()

    expect(server.buildStadium).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, north_stand_size: 8000, south_stand_roof: 1 })
    )
    expect(toast).toHaveBeenCalledWith('Construction has started!', 'success')
    expect(onConstructionStarted).toHaveBeenCalled()
    expect(document.querySelector('.overlay-backdrop').classList.contains('fade-out')).toBe(true)
  })

  it('keeps the overlay open and reports the error when the build fails', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    server.buildStadium.mockRejectedValue(new Error('Not enough money'))
    const onConstructionStarted = vi.fn()
    showStadiumExpandModal(stadium, team, {}, onConstructionStarted)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    buildButton().click()
    await flush()

    expect(toast).toHaveBeenCalledWith('Not enough money', 'error')
    expect(onConstructionStarted).not.toHaveBeenCalled()
    expect(document.querySelector('.overlay-backdrop').classList.contains('fade-out')).toBe(false)
  })

  it('disables inputs of stands that are already under construction and shows their status', () => {
    showStadiumExpandModal(stadium, team, {
      north: { underConstruction: true, remainingGameDays: 3, targetSize: 8000 },
      south: { underConstruction: true, remainingGameDays: 0 },
      east: { underConstruction: false }
    })

    expect(sizeInput('north').disabled).toBe(true)
    expect(document.querySelector('[data-roof-input="north"]').disabled).toBe(true)
    expect(sizeInput('east').disabled).toBe(false)
    expect(document.body.textContent).toContain('Under construction - 3 gameday(s) remaining')
    expect(document.body.textContent).toContain('Expanding to 8,000 seats')
    expect(document.body.textContent).toContain('Completes today.')
  })

  it('cleans up the preview scene when the overlay is closed', async () => {
    server.calculateStadiumPrice.mockResolvedValue({
      totalPrice: 500_000,
      constructionTimes: { north: { days: 2, seatsDiff: 3000, addingRoof: false } }
    })
    const overlay = showStadiumExpandModal(stadium, team)
    setSize('north', 8000)
    calculateButton().click()
    await flush()

    overlay.remove()
    expect(canvasInstances[0].onDestroy).toHaveBeenCalled()
  })
})
