import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({
  server: { getWikiEntries: vi.fn(), getWikiEntry: vi.fn() },
  showServerError: vi.fn()
}))
vi.mock('../../i18n/index.js', () => ({ t: (k) => k, getLocale: () => 'en' }))
vi.mock('../../lib/html.js', () => ({ el: vi.fn(), generateId: () => 'id' }))
vi.mock('../../lib/linkify.js', () => ({ linkifyHtml: (text, fn) => fn(text) }))

import { WikiPage } from '../../pages/wiki.js'
import { server } from '../../lib/gateway.js'

describe('WikiPage (#441)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads entries and selects the first one by default', async () => {
    server.getWikiEntries.mockResolvedValue({ entries: [{ id: 3, title: 'First' }, { id: 4, title: 'Second' }] })
    server.getWikiEntry.mockResolvedValue({ entry: { id: 3, title: 'First', text: 'Body' } })
    const page = new WikiPage()
    await page.load()
    expect(page._selectedId).toBe(3)
    expect(server.getWikiEntry).toHaveBeenCalledWith(3)
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
})
