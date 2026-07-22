import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getWikiEntries: vi.fn(), getWikiEntry: vi.fn() },
  showServerError: vi.fn()
}))
vi.mock('../../i18n/index.js', () => ({ t: (k) => k, getLocale: () => 'en' }))
vi.mock('../../lib/html.js', () => ({ el: vi.fn(), generateId: () => 'id' }))
vi.mock('../../lib/linkify.js', () => ({ linkifyHtml: (text, fn) => fn(text) }))
vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ onClose: vi.fn(), remove: vi.fn() }))
}))
vi.mock('../../lib/router.js', () => ({
  getQueryParams: vi.fn(() => ({})),
  setQueryParams: vi.fn()
}))

import { WikiPage } from '../../pages/wiki.js'
import { server } from '../../lib/gateway.js'
import { showOverlay } from '../../partials/overlay.js'
import { getQueryParams, setQueryParams } from '../../lib/router.js'

function mockViewport (mobile) {
  window.matchMedia = vi.fn((query) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }))
}

describe('WikiPage (#441)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockViewport(false)
    showOverlay.mockImplementation(() => ({ onClose: vi.fn(), remove: vi.fn() }))
    getQueryParams.mockReturnValue({})
    window.location.hash = '#dashboard?sub_page=wiki'
  })

  it('loads entries and selects the first one by default on desktop', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', text: 'Body' } })
    const page = new WikiPage()
    await page.load()
    expect(page._selectedId).toBe(3)
    expect(server.getWikiEntry).toHaveBeenCalledWith(3)
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('renders a sidebar list with links and marks the active entry', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', text: 'Body' } })
    const page = new WikiPage()
    await page.load()
    const html = page.template
    expect(html).toContain('#dashboard?sub_page=wiki&id=3')
    expect(html).toContain('#dashboard?sub_page=wiki&id=4')
    expect(html).toContain('wiki-list-item active')
  })

  it('filters the sidebar list by the search term', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'Stadium' }, { id: 4, title: 'Players' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'Stadium', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    page._filter = 'play'
    const list = page._renderList()
    expect(list).toContain('Players')
    expect(list).not.toContain('Stadium')
  })

  it('renders entry images and text in the content area', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', subtitle: 'Sub', text: 'Hello\nWorld', images: ['pic.png'] } })
    const page = new WikiPage()
    await page.load()
    const content = page._renderContent()
    expect(content).toContain('pic.png')
    expect(content).toContain('class="wiki-image"')
    expect(content).toContain('Hello<br>World')
    expect(content).toContain('Sub')
  })

  it('#441 includes an image lightbox overlay in the template', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    expect(page.template).toContain('wiki-image-overlay')
  })

  it('does not render a custom mobile overlay in the template — uses shared showOverlay instead', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    const html = page.template
    expect(html).not.toContain('wiki-detail-overlay')
  })

  it('does not open the detail overlay on desktop when an entry is selected', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 4, title: 'Second', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    showOverlay.mockClear()
    await page.onQueryChanged({ id: '4' })
    expect(page._selectedId).toBe(4)
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('does NOT pre-select the first entry on mobile so the first tap actually opens it', async () => {
    mockViewport(true)
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    const page = new WikiPage()
    await page.load()
    expect(page._selectedId).toBe(null)
    expect(page._renderList()).not.toContain('wiki-list-item active')
    expect(server.getWikiEntry).not.toHaveBeenCalled()
    expect(showOverlay).not.toHaveBeenCalled()
  })

  it('opens the shared showOverlay on mobile when an entry is selected via the query param', async () => {
    mockViewport(true)
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 4, title: 'Second', subtitle: 'Sub', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    await page.onQueryChanged({ id: '4' })
    expect(page._selectedId).toBe(4)
    expect(showOverlay).toHaveBeenCalledTimes(1)
    expect(showOverlay).toHaveBeenCalledWith('Second', 'Sub', expect.stringContaining('wiki-detail-body'))
  })

  it('opens the shared showOverlay on mobile from a deep-link id param in the URL', async () => {
    mockViewport(true)
    window.location.hash = '#dashboard?sub_page=wiki&id=4'
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 4, title: 'Second', text: 'x' } })
    const page = new WikiPage()
    await page.load()
    expect(page._selectedId).toBe(4)
    expect(showOverlay).toHaveBeenCalledTimes(1)
    expect(showOverlay).toHaveBeenCalledWith('Second', '', expect.any(String))
  })

  it('switching to another entry on mobile closes the old overlay and opens a new one', async () => {
    mockViewport(true)
    const removeSpy = vi.fn()
    const onCloseSpies = []
    showOverlay.mockImplementation(() => {
      const onClose = vi.fn()
      onCloseSpies.push(onClose)
      return { onClose, remove: removeSpy }
    })
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry
      .mockResolvedValueOnce({ entry: { id: 3, title: 'First', text: 'a' } })
      .mockResolvedValueOnce({ entry: { id: 4, title: 'Second', text: 'b' } })
    const page = new WikiPage()
    await page.onQueryChanged({ id: '3' }) // _selectedId is null → not skipped
    expect(showOverlay).toHaveBeenCalledTimes(1)
    await page.onQueryChanged({ id: '4' })
    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(showOverlay).toHaveBeenCalledTimes(2)
  })

  it('clears the id query param when the overlay is closed by the user', async () => {
    mockViewport(true)
    let capturedOnClose = null
    showOverlay.mockImplementation(() => ({
      onClose: (cb) => { capturedOnClose = cb },
      remove: vi.fn()
    }))
    getQueryParams.mockReturnValue({ id: '4' })
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 4, title: 'Second', text: 'x' } })
    const page = new WikiPage()
    await page.onQueryChanged({ id: '4' })
    expect(capturedOnClose).toBeInstanceOf(Function)
    capturedOnClose()
    expect(setQueryParams).toHaveBeenCalledWith({ id: null })
  })

  it('closes the mobile overlay when the query param is cleared', async () => {
    mockViewport(true)
    const removeSpy = vi.fn()
    showOverlay.mockImplementation(() => ({ onClose: vi.fn(), remove: removeSpy }))
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 4, title: 'Second', text: 'x' } })
    const page = new WikiPage()
    await page.onQueryChanged({ id: '4' })
    await page.onQueryChanged({ id: undefined })
    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(page._selectedId).toBe(null)
    expect(page._detailOverlay).toBe(null)
  })
})
