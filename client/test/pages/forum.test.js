import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/gateway.js', () => ({ server: {} }))
vi.mock('../../lib/router.js', () => ({
  getQueryParams: vi.fn().mockReturnValue({}),
  setQueryParams: vi.fn()
}))

import { ForumPage } from '../../pages/forum.js'

describe('ForumPage today highlight (#437)', () => {
  let page
  const today = new Date().toISOString()
  const older = '2000-01-01T10:00:00.000Z'

  beforeEach(() => {
    page = new ForumPage()
    page._currentUserId = 999
    page._isAdmin = false
    page._params = { category: 'general' }
    page._editingPostId = null
    page._editingCommentId = null
  })

  it('adds bg-info-subtle to a post created today and its today comments only', () => {
    page._post = { id: 1, title: 'Hi', text: 'body', username: 'u', created_at: today, like_count: 0 }
    page._comments = [
      { id: 11, text: 'fresh', username: 'a', created_at: today },
      { id: 12, text: 'stale', username: 'b', created_at: older }
    ]
    const html = page._renderPostDetail()
    // post card highlighted
    expect(html).toMatch(/card mb-3[^"]*bg-info-subtle/)
    // exactly one comment highlighted (the today one)
    const highlightedComments = html.match(/forum-comment[^"]*bg-info-subtle/g) || []
    expect(highlightedComments).toHaveLength(1)
  })

  it('does not highlight a post created on an older day', () => {
    page._post = { id: 1, title: 'Hi', text: 'body', username: 'u', created_at: older, like_count: 0 }
    page._comments = []
    const html = page._renderPostDetail()
    expect(html).not.toMatch(/card mb-3[^"]*bg-info-subtle/)
  })
})
