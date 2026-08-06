import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getBuildings: vi.fn(),
    getStadium: vi.fn(),
    getMyTeam: vi.fn(),
    upgradeBuilding: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../../lib/html.js', () => ({
  generateId: vi.fn(() => 'test-id'),
  el: vi.fn()
}))

vi.mock('../../../lib/htmlEventHandlers.js', () => ({
  onClick: vi.fn()
}))

vi.mock('../../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../../partials/tutorialOverlay.js', () => ({
  showTutorialIfNeeded: vi.fn()
}))

vi.mock('../../../lib/observeDOM.js', () => ({
  onDOMNodeChanged: vi.fn()
}))

vi.mock('../../../lib/event.js', () => ({
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../../lib/currency.js', () => ({
  euroFormat: {
    format: vi.fn((val) => `${val} EUR`)
  }
}))

import { BuildingsPage } from '../../../pages/club/buildings.js'
import { server } from '../../../lib/gateway.js'
import { showTutorialIfNeeded } from '../../../partials/tutorialOverlay.js'

describe('BuildingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getBuildings.mockResolvedValue({
      buildings: [
        { type: 'training_area', level: 1 },
        { type: 'fitness_studio', level: 1 }
      ],
      upgrades: {},
      cardChances: {},
      fitnessCardChances: {}
    })
    server.getStadium.mockResolvedValue({ stadium: { north_stand_size: 1000 } })
    server.getMyTeam.mockResolvedValue({ team: { color: '#ff0000' } })
  })

  it('loads buildings data from server', async () => {
    const page = new BuildingsPage({})
    await page.load()
    expect(server.getBuildings).toHaveBeenCalled()
    expect(page.buildings).toHaveLength(2)
  })

  it('loads the stadium and team the 3D scene needs', async () => {
    const page = new BuildingsPage({})
    await page.load()
    expect(page.stadium.north_stand_size).toBe(1000)
    expect(page.team.color).toBe('#ff0000')
  })

  it('renders the 3D canvas focused on the buildings, above the building cards', async () => {
    const page = new BuildingsPage({})
    await page.load()
    const html = page.template
    expect(html).toContain('buildings-canvas-container')
    expect(page._canvas.options.focus).toBe('buildings')
    expect(page._canvas.options.buildings).toBe(page.buildings)
    expect(html.indexOf('buildings-canvas-container')).toBeLessThan(html.indexOf('buildings.title'))
  })

  it('shows tutorial on mount', async () => {
    const page = new BuildingsPage({})
    await page.load()
    page.onMounted()
    expect(showTutorialIfNeeded).toHaveBeenCalledWith('buildings', expect.any(Object))
  })

  it('disposes the 3D canvas when the page is destroyed', async () => {
    const page = new BuildingsPage({})
    await page.load()
    void page.template
    const canvas = page._canvas
    canvas.onDestroy = vi.fn()
    page.onDestroy()
    expect(canvas.onDestroy).toHaveBeenCalled()
    expect(page._canvas).toBeNull()
  })
})
