import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({ query: vi.fn() }))

import { query } from '../../lib/database.js'
import handlers from '../../routes/wiki.js'

const admin = { user: { is_admin: 1 } }
const nonAdmin = { user: { is_admin: 0 } }

describe('wiki routes (#441)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('getWikiEntries', () => {
    it('returns entries for the requested locale', async () => {
      const rows = [{ id: 1, title: 'A', subtitle: null }]
      query.mockResolvedValueOnce(rows)
      const result = await handlers.getWikiEntries('de')
      expect(result).toEqual({ entries: rows })
      expect(query.mock.calls[0][1]).toEqual(['de'])
    })

    it('falls back to English when the locale has no entries', async () => {
      query
        .mockResolvedValueOnce([]) // de empty
        .mockResolvedValueOnce([{ id: 2, title: 'B', subtitle: null }]) // en fallback
      const result = await handlers.getWikiEntries('de')
      expect(result.entries).toHaveLength(1)
      expect(query.mock.calls[1][1]).toEqual(['en'])
    })

    it('normalises an unsupported locale to English', async () => {
      query.mockResolvedValueOnce([])
      await handlers.getWikiEntries('fr')
      expect(query.mock.calls[0][1]).toEqual(['en'])
    })
  })

  describe('getWikiEntry', () => {
    it('decodes the images JSON column', async () => {
      query.mockResolvedValueOnce([{ id: 1, title: 'A', images: '["a.png","b.png"]' }])
      const result = await handlers.getWikiEntry(1)
      expect(result.entry.images).toEqual(['a.png', 'b.png'])
    })

    it('returns null entry when not found', async () => {
      query.mockResolvedValueOnce([])
      const result = await handlers.getWikiEntry(99)
      expect(result.entry).toBeNull()
    })

    it('rejects an invalid id', async () => {
      await expect(handlers.getWikiEntry(0)).rejects.toMatchObject({ message: 'Invalid wiki entry id' })
    })
  })

  describe('admin guards', () => {
    it('getAllWikiEntries rejects non-admins', async () => {
      await expect(handlers.getAllWikiEntries(nonAdmin)).rejects.toMatchObject({ message: 'This action is only available for admins' })
    })

    it('createWikiEntry rejects non-admins', async () => {
      await expect(handlers.createWikiEntry('en', 'T', '', 'Body', '', 0, nonAdmin))
        .rejects.toMatchObject({ message: 'This action is only available for admins' })
    })
  })

  describe('createWikiEntry', () => {
    it('requires a title and text', async () => {
      await expect(handlers.createWikiEntry('en', '  ', '', 'Body', '', 0, admin))
        .rejects.toMatchObject({ message: 'Title is required' })
      await expect(handlers.createWikiEntry('en', 'T', '', '  ', '', 0, admin))
        .rejects.toMatchObject({ message: 'Text is required' })
    })

    it('keeps existing image filenames and strips any path prefix', async () => {
      query.mockResolvedValueOnce({ insertId: 7 })
      const result = await handlers.createWikiEntry('fr', 'Title', 'Sub', 'Body', ['a.png', 'x/y/b.png'], 3, admin)
      expect(result).toEqual({ id: 7 })
      const inserted = query.mock.calls[0][1]
      expect(inserted.locale).toBe('en') // fr -> en
      expect(inserted.images).toBe('["a.png","b.png"]')
      expect(inserted.sort_order).toBe(3)
    })
  })

  describe('updateWikiEntry / deleteWikiEntry', () => {
    it('updates an entry and keeps existing image filenames', async () => {
      query
        .mockResolvedValueOnce([{ images: '["x.png"]' }]) // SELECT existing images
        .mockResolvedValueOnce({}) // UPDATE
      const result = await handlers.updateWikiEntry(5, 'de', 'T', 'S', 'Body', ['x.png'], 1, admin)
      expect(result).toEqual({ success: true })
      const updateCall = query.mock.calls[1]
      expect(updateCall[0]).toContain('UPDATE wiki_entry')
      expect(updateCall[1][4]).toBe('["x.png"]') // images JSON
    })

    it('rejects deleting with an invalid id', async () => {
      await expect(handlers.deleteWikiEntry(0, admin)).rejects.toMatchObject({ message: 'Invalid wiki entry id' })
    })

    it('deletes an entry', async () => {
      query
        .mockResolvedValueOnce([{ images: '[]' }]) // SELECT existing images
        .mockResolvedValueOnce({}) // DELETE
      const result = await handlers.deleteWikiEntry(5, admin)
      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('DELETE FROM wiki_entry WHERE id=?', [5])
    })
  })
})
