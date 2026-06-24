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

  it('adds bg-warning-subtle to a post created today and its today comments only', () => {
    page._post = { id: 1, title: 'Hi', text: 'body', username: 'u', created_at: today, like_count: 0 }
    page._comments = [
      { id: 11, text: 'fresh', username: 'a', created_at: today },
      { id: 12, text: 'stale', username: 'b', created_at: older }
    ]
    const html = page._renderPostDetail()
    // post card highlighted
    expect(html).toMatch(/card mb-3[^"]*bg-warning-subtle/)
    // exactly one comment highlighted (the today one)
    const highlightedComments = html.match(/forum-comment[^"]*bg-warning-subtle/g) || []
    expect(highlightedComments).toHaveLength(1)
  })

  it('does not highlight a post created on an older day', () => {
    page._post = { id: 1, title: 'Hi', text: 'body', username: 'u', created_at: older, like_count: 0 }
    page._comments = []
    const html = page._renderPostDetail()
    expect(html).not.toMatch(/card mb-3[^"]*bg-warning-subtle/)
  })

  it('#419 renders both notices and a Discord link by default', () => {
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v }
    })
    const html = page._renderNotices()
    expect(html).toContain('forum-notice-dismiss')
    expect(html).toContain('forum-discord-dismiss')
    expect(html).toContain('discord.com/invite')
    vi.unstubAllGlobals()
  })

  it('#419 hides a notice once its dismissed flag is stored', () => {
    const store = { forum_notice_dismissed: '1' }
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v }
    })
    const html = page._renderNotices()
    expect(html).not.toContain('forum-notice-dismiss')
    // discord box still visible
    expect(html).toContain('forum-discord-dismiss')
    vi.unstubAllGlobals()
  })

  it('highlights today latest posts and comments on the start page', () => {
    page._latestPosts = [
      { id: 1, category_id: 2, title: 'Fresh', text: 'body', username: 'u', created_at: today },
      { id: 2, category_id: 2, title: 'Old', text: 'body', username: 'u', created_at: older }
    ]
    page._latestComments = [
      { post_id: 1, category_id: 2, post_title: 'Fresh', text: 'c', username: 'u', created_at: today },
      { post_id: 2, category_id: 2, post_title: 'Old', text: 'c', username: 'u', created_at: older }
    ]
    const postsHtml = page._renderLatestPosts()
    const commentsHtml = page._renderLatestComments()
    expect((postsHtml.match(/forum-latest-comment-item[^"]*bg-warning-subtle/g) || [])).toHaveLength(1)
    expect((commentsHtml.match(/forum-latest-comment-item[^"]*bg-warning-subtle/g) || [])).toHaveLength(1)
  })
})
