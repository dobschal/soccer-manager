import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/badWordsFilter.js', () => ({
  maskBadWords: vi.fn(text => text)
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/forum.js'

describe('forum routes - edit and delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateForumPost', () => {
    it('updates post when author edits within 4h window', async () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
      query
        .mockResolvedValueOnce([{ user_id: 1, created_at: recent }])
        .mockResolvedValueOnce({})

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.updateForumPost(42, 'New title', 'New body', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenLastCalledWith(
        'UPDATE forum_post SET title = ?, text = ? WHERE id = ?',
        ['New title', 'New body', 42]
      )
    })

    it('rejects edit when user is not the author', async () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000)
      query.mockResolvedValueOnce([{ user_id: 99, created_at: recent }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.updateForumPost(42, 'New', 'Body', req))
        .rejects.toThrow(/own posts/)
    })

    it('rejects edit when post is older than 4 hours', async () => {
      const tooOld = new Date(Date.now() - 5 * 60 * 60 * 1000) // 5h ago
      query.mockResolvedValueOnce([{ user_id: 1, created_at: tooOld }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.updateForumPost(42, 'New', 'Body', req))
        .rejects.toThrow(/4 hours/)
    })

    it('rejects edit when admin tries to edit foreign post', async () => {
      const recent = new Date(Date.now() - 30 * 60 * 1000)
      query.mockResolvedValueOnce([{ user_id: 99, created_at: recent }])

      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      await expect(handlers.updateForumPost(42, 'New', 'Body', req))
        .rejects.toThrow(/own posts/)
    })

    it('throws when title is empty', async () => {
      const req = createMockRequest()
      await expect(handlers.updateForumPost(1, '', 'Body', req))
        .rejects.toThrow(/Title cannot be empty/)
    })

    it('throws when text is empty', async () => {
      const req = createMockRequest()
      await expect(handlers.updateForumPost(1, 'Title', '   ', req))
        .rejects.toThrow(/Text cannot be empty/)
    })

    it('throws when post does not exist', async () => {
      query.mockResolvedValueOnce([])
      const req = createMockRequest({ user: { id: 1 } })
      await expect(handlers.updateForumPost(99, 'Title', 'Body', req))
        .rejects.toThrow(/Post not found/)
    })
  })

  describe('updateForumComment', () => {
    it('updates comment when author edits within 4h window', async () => {
      const recent = new Date(Date.now() - 60 * 60 * 1000) // 1h ago
      query
        .mockResolvedValueOnce([{ user_id: 1, created_at: recent }])
        .mockResolvedValueOnce({})

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.updateForumComment(7, 'Updated text', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenLastCalledWith(
        'UPDATE forum_comment SET text = ? WHERE id = ?',
        ['Updated text', 7]
      )
    })

    it('rejects edit when not the author', async () => {
      const recent = new Date(Date.now() - 60 * 60 * 1000)
      query.mockResolvedValueOnce([{ user_id: 2, created_at: recent }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.updateForumComment(7, 'Updated', req))
        .rejects.toThrow(/own comments/)
    })

    it('rejects edit after 4h window', async () => {
      const tooOld = new Date(Date.now() - 4 * 60 * 60 * 1000 - 1000)
      query.mockResolvedValueOnce([{ user_id: 1, created_at: tooOld }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.updateForumComment(7, 'Updated', req))
        .rejects.toThrow(/4 hours/)
    })
  })

  describe('deleteForumPost', () => {
    it('allows author to delete their own post', async () => {
      query
        .mockResolvedValueOnce([{ user_id: 5 }]) // SELECT post
        .mockResolvedValueOnce([]) // SELECT comments
        .mockResolvedValueOnce([]) // SELECT post images
        .mockResolvedValue({}) // remaining DELETEs

      const req = createMockRequest({ user: { id: 5, is_admin: 0 } })
      const result = await handlers.deleteForumPost(10, req)

      expect(result).toEqual({ success: true })
      const deleteCalls = query.mock.calls.filter(c => c[0].startsWith('DELETE'))
      expect(deleteCalls.map(c => c[0])).toEqual(expect.arrayContaining([
        'DELETE FROM forum_post_image WHERE post_id = ?',
        'DELETE FROM forum_comment WHERE post_id = ?',
        'DELETE FROM forum_post_like WHERE post_id = ?',
        'DELETE FROM forum_post WHERE id = ?'
      ]))
    })

    it('allows admin to delete any post', async () => {
      query
        .mockResolvedValueOnce([{ user_id: 999 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValue({})

      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      const result = await handlers.deleteForumPost(10, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects delete from non-author non-admin', async () => {
      query.mockResolvedValueOnce([{ user_id: 999 }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.deleteForumPost(10, req))
        .rejects.toThrow(/own posts/)
    })

    it('cascades comments when deleting post', async () => {
      query
        .mockResolvedValueOnce([{ user_id: 5 }])
        .mockResolvedValueOnce([{ id: 11 }, { id: 12 }]) // comments
        .mockResolvedValueOnce([]) // comment images
        .mockResolvedValueOnce({}) // DELETE forum_comment_image
        .mockResolvedValueOnce([]) // post images
        .mockResolvedValue({}) // remaining deletes

      const req = createMockRequest({ user: { id: 5, is_admin: 0 } })
      await handlers.deleteForumPost(10, req)

      const calls = query.mock.calls.map(c => c[0])
      expect(calls).toContain('DELETE FROM forum_comment WHERE post_id = ?')
    })
  })

  describe('deleteForumComment', () => {
    it('allows author to delete their own comment', async () => {
      query
        .mockResolvedValueOnce([{ user_id: 5 }]) // SELECT comment
        .mockResolvedValueOnce([]) // SELECT images
        .mockResolvedValue({})

      const req = createMockRequest({ user: { id: 5, is_admin: 0 } })
      const result = await handlers.deleteForumComment(7, req)

      expect(result).toEqual({ success: true })
    })

    it('allows admin to delete any comment', async () => {
      query
        .mockResolvedValueOnce([{ user_id: 999 }])
        .mockResolvedValueOnce([])
        .mockResolvedValue({})

      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      const result = await handlers.deleteForumComment(7, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects delete from non-author non-admin', async () => {
      query.mockResolvedValueOnce([{ user_id: 999 }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.deleteForumComment(7, req))
        .rejects.toThrow(/own comments/)
    })
  })

  describe('getForumPosts with badge filter', () => {
    it('queries posts without filter when no badge is given', async () => {
      query
        .mockResolvedValueOnce([{ id: 3, name: 'General' }]) // category
        .mockResolvedValueOnce([{ total: 2 }]) // count
        .mockResolvedValueOnce([{ archived_total: 0 }]) // archived count
        .mockResolvedValueOnce([{ badge_text: 'Bug', badge_color: '#dc3545' }]) // available
        .mockResolvedValueOnce([{ id: 1, liked: 0 }, { id: 2, liked: 0 }]) // posts

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.getForumPosts(3, 1, null, false, req)

      expect(result.badgeFilter).toBeNull()
      expect(result.posts).toHaveLength(2)
      const countCall = query.mock.calls[1]
      expect(countCall[0]).not.toMatch(/badge_text = \?/)
    })

    it('filters posts by badge text when filter is given', async () => {
      query
        .mockResolvedValueOnce([{ id: 3, name: 'General' }])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ archived_total: 0 }])
        .mockResolvedValueOnce([{ badge_text: 'Bug', badge_color: '#dc3545' }])
        .mockResolvedValueOnce([{ id: 1, liked: 0 }])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.getForumPosts(3, 1, 'Bug', false, req)

      expect(result.badgeFilter).toBe('Bug')
      const countCall = query.mock.calls[1]
      expect(countCall[0]).toMatch(/badge_text = \?/)
      expect(countCall[1]).toEqual([3, 'Bug'])
    })

    it('returns availableBadges for the category', async () => {
      query
        .mockResolvedValueOnce([{ id: 3, name: 'General' }])
        .mockResolvedValueOnce([{ total: 0 }])
        .mockResolvedValueOnce([{ archived_total: 0 }])
        .mockResolvedValueOnce([
          { badge_text: 'Bug', badge_color: '#dc3545' },
          { badge_text: 'Feature', badge_color: '#28a745' }
        ])
        .mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.getForumPosts(3, 1, null, false, req)

      expect(result.availableBadges).toEqual([
        { badge_text: 'Bug', badge_color: '#dc3545' },
        { badge_text: 'Feature', badge_color: '#28a745' }
      ])
    })
  })

  describe('setForumPostBadge', () => {
    it('saves badge when an allowed color is used', async () => {
      query.mockResolvedValueOnce({})
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      const result = await handlers.setForumPostBadge(7, 'News', '#0d6efd', req)
      expect(result).toEqual({ success: true })
    })

    it('rejects arbitrary hex colors not in the allowed list', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      await expect(handlers.setForumPostBadge(7, 'News', '#abcdef', req))
        .rejects.toThrow(/badge color/i)
    })

    it('rejects malformed color strings', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      await expect(handlers.setForumPostBadge(7, 'News', 'red', req))
        .rejects.toThrow(/badge color/i)
    })

    it('rejects non-admin users', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.setForumPostBadge(7, 'News', '#0d6efd', req))
        .rejects.toThrow(/admin/i)
    })
  })

  describe('setForumPostArchived', () => {
    it('archives a post when admin requests it', async () => {
      query
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce({})
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      const result = await handlers.setForumPostArchived(7, true, req)
      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenLastCalledWith(
        'UPDATE forum_post SET is_archived = ? WHERE id = ?',
        [1, 7]
      )
    })

    it('unarchives a post when isArchived is false', async () => {
      query
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce({})
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      await handlers.setForumPostArchived(7, false, req)
      expect(query).toHaveBeenLastCalledWith(
        'UPDATE forum_post SET is_archived = ? WHERE id = ?',
        [0, 7]
      )
    })

    it('rejects non-admin users', async () => {
      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      await expect(handlers.setForumPostArchived(7, true, req))
        .rejects.toThrow(/admin/i)
    })

    it('rejects when post not found', async () => {
      query.mockResolvedValueOnce([])
      const req = createMockRequest({ user: { id: 1, is_admin: 1 } })
      await expect(handlers.setForumPostArchived(7, true, req))
        .rejects.toThrow(/not found/i)
    })
  })

  describe('getForumPosts archived filtering', () => {
    it('excludes archived posts by default', async () => {
      query
        .mockResolvedValueOnce([{ id: 3, name: 'General' }])
        .mockResolvedValueOnce([{ total: 1 }])
        .mockResolvedValueOnce([{ archived_total: 2 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.getForumPosts(3, 1, null, false, req)
      expect(result.archivedCount).toBe(2)
      expect(result.includeArchived).toBe(false)
      const countCall = query.mock.calls[1]
      expect(countCall[0]).toMatch(/is_archived = 0/)
    })

    it('includes archived posts when includeArchived is true', async () => {
      query
        .mockResolvedValueOnce([{ id: 3, name: 'General' }])
        .mockResolvedValueOnce([{ total: 3 }])
        .mockResolvedValueOnce([{ archived_total: 2 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, is_admin: 0 } })
      const result = await handlers.getForumPosts(3, 1, null, true, req)
      expect(result.includeArchived).toBe(true)
      const countCall = query.mock.calls[1]
      expect(countCall[0]).not.toMatch(/is_archived = 0/)
    })
  })
})
