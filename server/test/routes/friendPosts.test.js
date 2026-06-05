import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/badWordsFilter.js', () => ({
  maskBadWords: (text) => text
}))

vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    unlinkSync: vi.fn()
  }
}))

vi.mock('crypto', () => ({
  default: {
    randomUUID: () => 'uuid-stub'
  }
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/friendPosts.js'

describe('friendPosts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createFriendPost', () => {
    it('inserts a post with text only', async () => {
      query.mockResolvedValueOnce({ insertId: 42 })
      const req = createMockRequest({ user: { id: 1, username: 'me' } })

      const result = await handlers.createFriendPost('Hello world', null, req)

      expect(result).toEqual({ postId: 42 })
      const [sql, payload] = query.mock.calls[0]
      expect(sql).toMatch(/INSERT INTO friend_post SET/)
      expect(payload).toEqual({
        user_id: 1,
        text: 'Hello world',
        image_filename: null
      })
    })

    it('stores the image when one is provided', async () => {
      query.mockResolvedValueOnce({ insertId: 7 })
      const req = createMockRequest({ user: { id: 1, username: 'me' } })

      const result = await handlers.createFriendPost(
        'with image',
        { data: 'data:image/png;base64,aGVsbG8=', type: 'image/png' },
        req
      )

      expect(result).toEqual({ postId: 7 })
      const [, payload] = query.mock.calls[0]
      expect(payload.image_filename).toBe('uuid-stub.png')
    })

    it('rejects unauthenticated calls', async () => {
      await expect(handlers.createFriendPost('hi', null, { user: null }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects empty text', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.createFriendPost('   ', null, req))
        .rejects.toMatchObject({ message: 'Text cannot be empty' })
    })

    it('rejects unsupported image types', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.createFriendPost(
        'hi',
        { data: 'data:image/bmp;base64,aGVsbG8=', type: 'image/bmp' },
        req
      )).rejects.toMatchObject({ message: 'Unsupported image type' })
    })
  })

  describe('getFriendPosts', () => {
    it('returns posts authored by the user and their outgoing friends, ordered by date', async () => {
      // 1) friend ids lookup
      query.mockResolvedValueOnce([
        { friend_user_id: 2 }, { friend_user_id: 3 }
      ])
      // 2) total count
      query.mockResolvedValueOnce([{ total: 25 }])
      // 3) page rows
      const dbRows = [
        {
          id: 100, userId: 2, text: 'Hello', imageFilename: null, createdAt: '2026-01-01',
          username: 'alice', avatar: null, teamId: 10, teamName: 'FC Alice', teamShortName: 'ALI',
          teamEmblem: 'em', teamColor: '#fff', likeCount: 3, likedByMe: 1, commentCount: 2
        },
        {
          id: 99, userId: 1, text: 'My post', imageFilename: 'img.png', createdAt: '2025-12-31',
          username: 'me', avatar: null, teamId: 7, teamName: 'My FC', teamShortName: 'MYC',
          teamEmblem: 'em', teamColor: '#000', likeCount: 0, likedByMe: 0, commentCount: 0
        }
      ]
      query.mockResolvedValueOnce(dbRows)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendPosts(1, req)

      expect(result.page).toBe(1)
      expect(result.total).toBe(25)
      expect(result.totalPages).toBe(3) // ceil(25 / 10)
      expect(result.posts).toHaveLength(2)
      expect(result.posts[0].likedByMe).toBe(true)
      expect(result.posts[0].likeCount).toBe(3)
      expect(result.posts[0].commentCount).toBe(2)
      expect(result.posts[1].likedByMe).toBe(false)

      // Visibility includes self id (1) and outgoing friend ids (2, 3)
      const fetchSql = query.mock.calls[2][0]
      expect(fetchSql).toMatch(/WHERE p\.user_id IN \(\?,\?,\?\)/)
      // params: [self.id for likedByMe subquery, ...authorIds, limit, offset]
      const fetchParams = query.mock.calls[2][1]
      expect(fetchParams).toEqual([1, 1, 2, 3, 10, 0])
    })

    it('paginates using LIMIT and OFFSET', async () => {
      query.mockResolvedValueOnce([]) // no friends
      query.mockResolvedValueOnce([{ total: 30 }])
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 5, username: 'lonely' } })
      const result = await handlers.getFriendPosts(2, req)

      expect(result.page).toBe(2)
      expect(result.totalPages).toBe(3)
      const fetchParams = query.mock.calls[2][1]
      // [likedByMe self, author id self, limit, offset]
      expect(fetchParams).toEqual([5, 5, 10, 10])
    })

    it('rejects unauthenticated calls', async () => {
      await expect(handlers.getFriendPosts(1, { user: null }))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('toggleFriendPostLike', () => {
    it('inserts a like row when not yet liked and returns the new count', async () => {
      // post lookup
      query.mockResolvedValueOnce([{ user_id: 2 }])
      // friend ids: user has friend 2
      query.mockResolvedValueOnce([{ friend_user_id: 2 }])
      // existing like check
      query.mockResolvedValueOnce([])
      // insert
      query.mockResolvedValueOnce({ insertId: 1 })
      // count
      query.mockResolvedValueOnce([{ count: 4 }])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.toggleFriendPostLike(100, req)

      expect(result).toEqual({ liked: true, likeCount: 4 })
    })

    it('removes an existing like row and returns the new count', async () => {
      query.mockResolvedValueOnce([{ user_id: 2 }])
      query.mockResolvedValueOnce([{ friend_user_id: 2 }])
      query.mockResolvedValueOnce([{ id: 11 }])
      query.mockResolvedValueOnce({ affectedRows: 1 })
      query.mockResolvedValueOnce([{ count: 2 }])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.toggleFriendPostLike(100, req)

      expect(result).toEqual({ liked: false, likeCount: 2 })
    })

    it('rejects when the post is not visible to the user', async () => {
      query.mockResolvedValueOnce([{ user_id: 9 }])
      query.mockResolvedValueOnce([]) // user has no friends

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.toggleFriendPostLike(100, req))
        .rejects.toMatchObject({ message: 'Post not visible' })
    })

    it('rejects when the post does not exist', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.toggleFriendPostLike(100, req))
        .rejects.toMatchObject({ message: 'Post not found' })
    })
  })

  describe('getFriendPostComments', () => {
    it('returns comments for a visible post', async () => {
      const comments = [
        { id: 1, userId: 2, text: 'Nice', createdAt: 'x', username: 'alice', avatar: null, teamId: 10, teamName: 'FC' }
      ]
      query.mockResolvedValueOnce([{ user_id: 2 }])
      query.mockResolvedValueOnce([{ friend_user_id: 2 }])
      query.mockResolvedValueOnce(comments)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendPostComments(50, req)

      expect(result).toEqual({ comments })
    })

    it('rejects when the post belongs to a non-friend', async () => {
      query.mockResolvedValueOnce([{ user_id: 9 }])
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.getFriendPostComments(50, req))
        .rejects.toMatchObject({ message: 'Post not visible' })
    })
  })

  describe('addFriendPostComment', () => {
    it('inserts and returns the new comment for a visible post', async () => {
      query.mockResolvedValueOnce([{ user_id: 2 }])
      query.mockResolvedValueOnce([{ friend_user_id: 2 }])
      query.mockResolvedValueOnce({ insertId: 7 })
      query.mockResolvedValueOnce([{
        id: 7, userId: 1, text: 'Nice', createdAt: 'x',
        username: 'me', avatar: null, teamId: 1, teamName: 'Me FC'
      }])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.addFriendPostComment(50, 'Nice', req)

      expect(result.comment.id).toBe(7)
      expect(result.comment.username).toBe('me')
    })

    it('rejects empty text', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.addFriendPostComment(50, '   ', req))
        .rejects.toMatchObject({ message: 'Comment text cannot be empty' })
    })
  })

  describe('deleteFriendPost', () => {
    it('lets the author delete their own post', async () => {
      query.mockResolvedValueOnce([{ user_id: 1, image_filename: null }])
      query.mockResolvedValueOnce({ affectedRows: 0 }) // delete likes
      query.mockResolvedValueOnce({ affectedRows: 0 }) // delete comments
      query.mockResolvedValueOnce({ affectedRows: 1 }) // delete post

      const req = createMockRequest({ user: { id: 1, username: 'me', is_admin: false } })
      const result = await handlers.deleteFriendPost(50, req)

      expect(result).toEqual({ success: true })
    })

    it('lets an admin delete any post', async () => {
      query.mockResolvedValueOnce([{ user_id: 9, image_filename: null }])
      query.mockResolvedValueOnce({ affectedRows: 0 })
      query.mockResolvedValueOnce({ affectedRows: 0 })
      query.mockResolvedValueOnce({ affectedRows: 1 })

      const req = createMockRequest({ user: { id: 1, username: 'me', is_admin: true } })
      const result = await handlers.deleteFriendPost(50, req)

      expect(result).toEqual({ success: true })
    })

    it('rejects when a non-admin tries to delete another user\'s post', async () => {
      query.mockResolvedValueOnce([{ user_id: 9, image_filename: null }])

      const req = createMockRequest({ user: { id: 1, username: 'me', is_admin: false } })
      await expect(handlers.deleteFriendPost(50, req))
        .rejects.toMatchObject({ message: 'You can only delete your own posts' })
    })
  })
})
