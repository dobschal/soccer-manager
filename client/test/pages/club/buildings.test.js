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
import { el } from '../../../lib/html.js'
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

  it('renders the 3D canvas focused on the buildings, below the heading and intro text', async () => {
    const page = new BuildingsPage({})
    await page.load()
    const html = page.template
    expect(html).toContain('buildings-canvas-container')
    expect(page._canvas.options.focus).toBe('buildings')
    expect(page._canvas.options.buildings).toBe(page.buildings)
    expect(html.indexOf('buildings.title')).toBeLessThan(html.indexOf('buildings.pageDesc'))
    expect(html.indexOf('buildings.pageDesc')).toBeLessThan(html.indexOf('buildings-canvas-container'))
    expect(html.indexOf('buildings-canvas-container')).toBeLessThan(html.indexOf('building-card'))
  })

  describe('medical practice card', () => {
    const pageWith = async (level) => {
      server.getBuildings.mockResolvedValue({
        buildings: [{ type: 'medical_practice', level }],
        upgrades: { medical_practice_1: { cost: 500_000, constructionDays: 8 } },
        cardChances: {},
        fitnessCardChances: {}
      })
      const page = new BuildingsPage({})
      await page.load()
      return page
    }

    it('offers a build button with the price while it is not there yet', async () => {
      const html = (await pageWith(0)).template
      expect(html).toContain('buildings.medicalPractice')
      expect(html).toContain('buildings.medicalLevel0Desc')
      expect(html).toContain('buildings.medicalLevel1Desc') // what the money buys
      expect(html).toContain('buildings.upgradeCost')
      expect(html).toContain('buildings.constructionDays')
      expect(html).toContain('buildings.build')
      // Never a level ladder: this building has exactly one level.
      expect(html).not.toContain('buildings.level')
      expect(html).not.toContain('buildings.upgrade\'')
    })

    it('shows it as built and stops offering anything once it stands', async () => {
      const html = (await pageWith(1)).template
      expect(html).toContain('buildings.built')
      expect(html).toContain('buildings.singleLevel')
      expect(html).not.toContain('buildings.build<')
      expect(html).not.toContain('buildings.upgradeCost')
    })

    it('hides the build button while it is under construction', async () => {
      server.getBuildings.mockResolvedValue({
        buildings: [{
          type: 'medical_practice',
          level: 0,
          constructionInfo: { underConstruction: true, targetLevel: 1, remainingGameDays: 3 }
        }],
        upgrades: { medical_practice_1: { cost: 500_000, constructionDays: 8 } },
        cardChances: {},
        fitnessCardChances: {}
      })
      const page = new BuildingsPage({})
      await page.load()
      const html = page.template
      expect(html).toContain('buildings.underConstruction')
      expect(html).not.toContain('buildings.upgradeCost')
    })
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

/**
 * Every card shows the club's own building rather than a painted level image: a
 * still cropped out of the 3D scene above, taken once the scene stands.
 */
describe('BuildingsPage building stills', () => {
  const CARDS = ['training_area', 'fitness_studio']

  beforeEach(() => {
    vi.clearAllMocks()
    server.getBuildings.mockResolvedValue({
      buildings: [
        { type: 'training_area', level: 1 },
        { type: 'fitness_studio', level: 2 }
      ],
      upgrades: {},
      cardChances: {},
      fitnessCardChances: {}
    })
    server.getStadium.mockResolvedValue({ stadium: {} })
    server.getMyTeam.mockResolvedValue({ team: {} })
  })

  /** The card images the page writes its stills into. */
  const mountCards = () => {
    const root = document.createElement('div')
    root.innerHTML = CARDS.map(type => `<img data-building-image="${type}">`).join('')
    document.body.append(root)
    el.mockReturnValue(root)
    return root
  }

  const fakeCanvas = (ready = true) => ({
    onMounted: vi.fn(),
    onDestroy: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(ready),
    captureBuilding: vi.fn((type, { level }) => `still:${type}:${level}`)
  })

  const loadedPage = async () => {
    const page = new BuildingsPage({})
    await page.load()
    return page
  }

  it('puts a still of the team\'s own building on every card', async () => {
    const page = await loadedPage()
    const root = mountCards()
    page._canvas = fakeCanvas()

    await page._loadBuildingStills()

    expect(page._canvas.captureBuilding).toHaveBeenCalledWith('training_area', { level: 1 })
    expect(page._canvas.captureBuilding).toHaveBeenCalledWith('fitness_studio', { level: 2 })
    expect([...root.querySelectorAll('img')].map(image => image.getAttribute('src')))
      .toEqual(['still:training_area:1', 'still:fitness_studio:2'])
  })

  it('photographs the next level too — that is what the upgrade dialog shows', async () => {
    const page = await loadedPage()
    mountCards()
    page._canvas = fakeCanvas()

    await page._loadBuildingStills()

    expect(page._buildingImage('training_area', 2)).toBe('still:training_area:2')
    expect(page._buildingImage('fitness_studio', 3)).toBe('still:fitness_studio:3')
  })

  it('never asks for a level beyond the last one', async () => {
    server.getBuildings.mockResolvedValue({
      buildings: [{ type: 'training_area', level: 3 }],
      upgrades: {},
      cardChances: {},
      fitnessCardChances: {}
    })
    const page = await loadedPage()
    mountCards()
    page._canvas = fakeCanvas()

    await page._loadBuildingStills()

    expect(page._canvas.captureBuilding.mock.calls.map(([, options]) => options.level)).toEqual([3])
  })

  it('previews the level under construction while it is being built', async () => {
    server.getBuildings.mockResolvedValue({
      buildings: [{
        type: 'training_area',
        level: 1,
        constructionInfo: { underConstruction: true, targetLevel: 2, remainingGameDays: 3 }
      }],
      upgrades: {},
      cardChances: {},
      fitnessCardChances: {}
    })
    const page = await loadedPage()
    mountCards()
    page._canvas = fakeCanvas()

    await page._loadBuildingStills()

    expect(page._canvas.captureBuilding.mock.calls.map(([, options]) => options.level))
      .toEqual([1, 2])
  })

  it('keeps the painted images when the 3D scene never comes up', async () => {
    const page = await loadedPage()
    mountCards()
    page._canvas = fakeCanvas(false)

    await page._loadBuildingStills()

    expect(page._canvas.captureBuilding).not.toHaveBeenCalled()
    expect(page._buildingImage('training_area', 1)).toContain('assets/training-area/')
    expect(page.template).toContain('assets/fitness/fitness-2.png')
  })

  it('falls back to the painted image for a level not rendered yet', async () => {
    const page = await loadedPage()
    expect(page._buildingImage('youth_academy', 9))
      .toBe('assets/youth-academy/youth-academy-level-3.png')
  })

  it('gives up when the page is left while the scene is still coming up', async () => {
    const page = await loadedPage()
    mountCards()
    let ready
    const canvas = fakeCanvas()
    canvas.whenReady.mockReturnValue(new Promise(resolve => { ready = resolve }))
    page._canvas = canvas

    const loading = page._loadBuildingStills()
    page.onDestroy()
    ready(true)
    await loading

    expect(canvas.captureBuilding).not.toHaveBeenCalled()
  })

  it('photographs the unbuilt medical practice so its card shows what it buys', async () => {
    server.getBuildings.mockResolvedValue({
      buildings: [{ type: 'medical_practice', level: 0 }],
      upgrades: { medical_practice_1: { cost: 500_000, constructionDays: 8 } },
      cardChances: {},
      fitnessCardChances: {}
    })
    const page = await loadedPage()
    const root = document.createElement('div')
    root.innerHTML = '<img data-building-image="medical_practice">'
    document.body.append(root)
    el.mockReturnValue(root)
    page._canvas = fakeCanvas()

    await page._loadBuildingStills()

    // Level 0 has nothing to photograph, so level 1 is shot once and shown.
    expect(page._canvas.captureBuilding.mock.calls.map(([, o]) => o.level)).toEqual([1])
    expect(root.querySelector('img').getAttribute('src')).toBe('still:medical_practice:1')
  })

  it('leaves a card alone when its still could not be encoded', async () => {
    const page = await loadedPage()
    const root = mountCards()
    const canvas = fakeCanvas()
    canvas.captureBuilding.mockReturnValue(null)
    page._canvas = canvas

    await page._loadBuildingStills()

    expect([...root.querySelectorAll('img')].map(image => image.getAttribute('src')))
      .toEqual([null, null])
  })
})
