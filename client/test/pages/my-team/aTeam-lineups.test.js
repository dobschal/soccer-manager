import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../../setup.js'

vi.mock('../../../lib/gateway.js', () => ({
  server: {
    getMyLineups: vi.fn(),
    createMyLineup: vi.fn(),
    activateMyLineup: vi.fn(),
    renameMyLineup: vi.fn(),
    deleteMyLineup: vi.fn()
  },
  showServerError: vi.fn()
}))
vi.mock('../../../partials/lineup.js', () => ({
  Lineup: class { toString () { return '<div class="lineup-mock"></div>' } }
}))
vi.mock('../../../partials/playerList.js', () => ({
  PlayerList: class { toString () { return '<div class="player-list-mock"></div>' } }
}))
vi.mock('../../../partials/benchSlot.js', () => ({
  BenchSlot: class { toString () { return '<div class="bench-slot-mock"></div>' } }
}))
vi.mock('../../../partials/captainSelect.js', () => ({
  CaptainSelect: class { toString () { return '<div class="captain-select-mock"></div>' } }
}))
vi.mock('../../../partials/spyReportCard.js', () => ({
  SpyReportCard: class { toString () { return '<div class="spy-report-mock"></div>' } }
}))
vi.mock('../../../partials/toast.js', () => ({ toast: vi.fn() }))
vi.mock('../../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn(), onClose: vi.fn() })),
  showConfirmDialog: vi.fn()
}))
vi.mock('../../../partials/wikiInfoIcon.js', () => ({ wikiInfoIcon: vi.fn(() => '') }))
vi.mock('../../../i18n/index.js', () => ({ t: vi.fn((key) => key) }))
vi.mock('../../../lib/event.js', () => ({ on: vi.fn(), off: vi.fn(), fire: vi.fn() }))
vi.mock('../../../lib/router.js', () => ({ setQueryParams: vi.fn() }))

import { ATeamPage } from '../../../pages/my-team/aTeam.js'
import { server, showServerError } from '../../../lib/gateway.js'
import { showConfirmDialog } from '../../../partials/overlay.js'

/**
 * @param {object} over
 * @returns {object} a stand-in for MyTeamPage
 */
function parentPage (over = {}) {
  return {
    data: { team: testData.team({ formation: '4-4-2' }), players: [] },
    season: 1,
    load: vi.fn().mockResolvedValue(undefined),
    ...over
  }
}

const LINEUPS = [
  { id: 3, name: 'Lineup 1', formation: '442a', is_active: 1 },
  { id: 4, name: 'Cup night', formation: '433', is_active: 0 }
]

beforeEach(() => {
  vi.clearAllMocks()
  server.getMyLineups.mockResolvedValue({ lineups: LINEUPS, activeId: 3 })
})

describe('ATeamPage lineup slots (#481)', () => {
  it('loads the saved lineups', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    expect(page._lineups).toEqual(LINEUPS)
    expect(page._activeLineupId).toBe(3)
  })

  it('renders a select with every lineup and preselects the active one', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    const html = page._renderLineupManager()
    expect(html).toContain('lineup-slot-select')
    expect(html).toContain('Lineup 1')
    expect(html).toContain('Cup night')
    expect(html).toContain('<option value="3" selected>')
    expect(html).toContain('myTeam.newLineup')
  })

  it('offers a delete button only when more than one lineup exists', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    expect(page._renderLineupManager()).toContain('lineup-slot-delete-btn')

    page._lineups = [LINEUPS[0]]
    expect(page._renderLineupManager()).not.toContain('lineup-slot-delete-btn')
  })

  it('renders nothing before the lineups have loaded', () => {
    const page = new ATeamPage(parentPage())
    expect(page._renderLineupManager()).toBe('')
  })

  it('keeps the squad page usable when the lineup request fails', async () => {
    server.getMyLineups.mockRejectedValue(new Error('boom'))
    const page = new ATeamPage(parentPage())
    await page.load()
    expect(page._lineups).toEqual([])
    expect(page._renderLineupManager()).toBe('')
  })

  it('switching the select activates the lineup and reloads the team', async () => {
    const parent = parentPage()
    const page = new ATeamPage(parent)
    await page.load()
    page.update = vi.fn()
    server.activateMyLineup.mockResolvedValue({ lineups: LINEUPS, activeId: 4 })

    await page.events['(optional).lineup-slot-select'].change({ target: { value: '4' } })

    expect(server.activateMyLineup).toHaveBeenCalledWith(4)
    expect(page._activeLineupId).toBe(4)
    // The whole team (formation, tactics, captain, squad) changed server-side.
    expect(parent.load).toHaveBeenCalled()
    expect(page.update).toHaveBeenCalled()
  })

  it('does not re-activate the lineup that is already active', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()

    await page.events['(optional).lineup-slot-select'].change({ target: { value: '3' } })

    expect(server.activateMyLineup).not.toHaveBeenCalled()
  })

  it('surfaces a server error when activating fails', async () => {
    const parent = parentPage()
    const page = new ATeamPage(parent)
    await page.load()
    page.update = vi.fn()
    server.activateMyLineup.mockRejectedValue(new Error('nope'))

    await page.events['(optional).lineup-slot-select'].change({ target: { value: '4' } })

    expect(showServerError).toHaveBeenCalled()
    expect(parent.load).not.toHaveBeenCalled()
  })

  it('deletes the active lineup after confirmation', async () => {
    const parent = parentPage()
    const page = new ATeamPage(parent)
    await page.load()
    page.update = vi.fn()
    showConfirmDialog.mockResolvedValue(true)
    server.deleteMyLineup.mockResolvedValue({ lineups: [LINEUPS[1]], activeId: 4 })

    await page.events['(optional).lineup-slot-delete-btn'].click()

    expect(server.deleteMyLineup).toHaveBeenCalledWith(3)
    expect(page._activeLineupId).toBe(4)
  })

  it('keeps the lineup when the delete confirmation is cancelled', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    showConfirmDialog.mockResolvedValue(false)

    await page.events['(optional).lineup-slot-delete-btn'].click()

    expect(server.deleteMyLineup).not.toHaveBeenCalled()
  })

  it('shows the lineup picker above the pitch', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    const html = page.template
    expect(html.indexOf('lineup-slot-select')).toBeLessThan(html.indexOf('lineup-mock'))
  })
})

describe('ATeamPage lineup renaming (#481)', () => {
  /**
   * Put a lineup select into the document so `_showRenameLineupOverlay` can
   * read the picked id off it.
   * @param {string} selectedId
   * @returns {void}
   */
  function mountSelect (selectedId) {
    document.body.innerHTML = `
      <select class="lineup-slot-select">
        <option value="3">Lineup 1</option>
        <option value="4">Cup night</option>
      </select>
    `
    document.querySelector('.lineup-slot-select').value = selectedId
  }

  it('renders a rename button for every lineup, the seeded default included', async () => {
    const page = new ATeamPage(parentPage())
    await page.load()
    expect(page._renderLineupManager()).toContain('lineup-slot-rename-btn')

    // Only the default lineup exists → renaming must still be offered.
    page._lineups = [LINEUPS[0]]
    expect(page._renderLineupManager()).toContain('lineup-slot-rename-btn')
  })

  it('renames the lineup picked in the select and prefills its current name', async () => {
    mountSelect('4')
    const page = new ATeamPage(parentPage())
    await page.load()
    page.update = vi.fn()
    const renamed = [LINEUPS[0], { ...LINEUPS[1], name: 'Derby' }]
    server.renameMyLineup.mockResolvedValue({ lineups: renamed, activeId: 3 })
    let opts
    page._showLineupNameOverlay = vi.fn((o) => { opts = o })

    page.events['(optional).lineup-slot-rename-btn'].click()
    expect(opts.value).toBe('Cup night')

    await opts.onSubmit('Derby')

    expect(server.renameMyLineup).toHaveBeenCalledWith(4, 'Derby')
    expect(page._lineups).toEqual(renamed)
    expect(page.update).toHaveBeenCalled()
  })

  it('renames the seeded default lineup too', async () => {
    mountSelect('3')
    const page = new ATeamPage(parentPage())
    await page.load()
    page.update = vi.fn()
    server.renameMyLineup.mockResolvedValue({ lineups: LINEUPS, activeId: 3 })
    let opts
    page._showLineupNameOverlay = vi.fn((o) => { opts = o })

    page.events['(optional).lineup-slot-rename-btn'].click()
    expect(opts.value).toBe('Lineup 1')

    await opts.onSubmit('Standard')

    expect(server.renameMyLineup).toHaveBeenCalledWith(3, 'Standard')
  })

  it('skips the request when the name is unchanged', async () => {
    mountSelect('3')
    const page = new ATeamPage(parentPage())
    await page.load()
    let opts
    page._showLineupNameOverlay = vi.fn((o) => { opts = o })

    page.events['(optional).lineup-slot-rename-btn'].click()
    await opts.onSubmit('Lineup 1')

    expect(server.renameMyLineup).not.toHaveBeenCalled()
  })

  it('falls back to the active lineup when the select is not in the DOM', async () => {
    document.body.innerHTML = ''
    const page = new ATeamPage(parentPage())
    await page.load()
    let opts
    page._showLineupNameOverlay = vi.fn((o) => { opts = o })

    page.events['(optional).lineup-slot-rename-btn'].click()

    expect(opts.value).toBe('Lineup 1')
  })

  it('does not open the overlay when no lineups are loaded', async () => {
    document.body.innerHTML = ''
    server.getMyLineups.mockRejectedValue(new Error('boom'))
    const page = new ATeamPage(parentPage())
    await page.load()
    page._showLineupNameOverlay = vi.fn()

    page.events['(optional).lineup-slot-rename-btn'].click()

    expect(page._showLineupNameOverlay).not.toHaveBeenCalled()
  })
})
