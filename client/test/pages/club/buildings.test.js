import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getBuildings: vi.fn(),
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
  })

  it('loads buildings data from server', async () => {
    const page = new BuildingsPage({})
    await page.load()
    expect(server.getBuildings).toHaveBeenCalled()
    expect(page.buildings).toHaveLength(2)
  })

  it('shows tutorial on mount', async () => {
    const page = new BuildingsPage({})
    await page.load()
    page.onMounted()
    expect(showTutorialIfNeeded).toHaveBeenCalledWith('buildings', expect.any(Object))
  })
})
