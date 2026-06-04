import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/pushNotification.js', () => ({
  sendPushNotifications: vi.fn()
}))

import { query } from '../../lib/database.js'
import { sendPushNotifications } from '../../lib/pushNotification.js'
import {
  extractMentionUsernames,
  recordForumMentions
} from '../../helper/forumMentionHelper.js'

describe('extractMentionUsernames', () => {
  it('returns an empty list for empty/non-string input', () => {
    expect(extractMentionUsernames('')).toEqual([])
    expect(extractMentionUsernames(null)).toEqual([])
    expect(extractMentionUsernames(undefined)).toEqual([])
  })

  it('extracts a single @-mention from the start of the text', () => {
    expect(extractMentionUsernames('@alice hey')).toEqual(['alice'])
  })

  it('extracts an @-mention preceded by whitespace', () => {
    expect(extractMentionUsernames('hello @bob, how are you?')).toEqual(['bob'])
  })

  it('extracts multiple distinct @-mentions and dedupes', () => {
    expect(extractMentionUsernames('@alice met @bob, then @alice came back')).toEqual(['alice', 'bob'])
  })

  it('supports usernames with underscores, dots, and dashes', () => {
    expect(extractMentionUsernames('@user_one @alice.smith @big-coach')).toEqual(['user_one', 'alice.smith', 'big-coach'])
  })

  it('ignores @ inside email addresses', () => {
    expect(extractMentionUsernames('write to alice@example.com please')).toEqual([])
  })

  it('ignores @ that immediately follows another word character', () => {
    expect(extractMentionUsernames('foo@bar should not match')).toEqual([])
  })

  it('ignores @@ double-at to avoid matching escaped sequences', () => {
    expect(extractMentionUsernames('@@nothere @real')).toEqual(['real'])
  })

  it('respects the 2-character minimum username length', () => {
    expect(extractMentionUsernames('hi @a yo')).toEqual([])
    expect(extractMentionUsernames('hi @ab yo')).toEqual(['ab'])
  })
})

describe('recordForumMentions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when text contains no mentions', async () => {
    await recordForumMentions({
      text: 'plain text without mentions',
      authorUserId: 1,
      authorUsername: 'admin',
      postId: 99,
      postTitle: 'hello'
    })
    expect(query).not.toHaveBeenCalled()
    expect(sendPushNotifications).not.toHaveBeenCalled()
  })

  it('inserts a mention row and sends a push when a known user is mentioned', async () => {
    query
      // resolveMentionedUsers
      .mockResolvedValueOnce([{ id: 7, username: 'bob', language: 'en' }])
      // insert
      .mockResolvedValueOnce({})

    await recordForumMentions({
      text: 'Hey @bob check this',
      authorUserId: 1,
      authorUsername: 'alice',
      postId: 42,
      postTitle: 'Title'
    })

    expect(query.mock.calls[1][0]).toMatch(/INSERT INTO forum_mention/)
    expect(query.mock.calls[1][1]).toMatchObject({
      mentioned_user_id: 7,
      author_user_id: 1,
      post_id: 42,
      comment_id: null
    })
    expect(sendPushNotifications).toHaveBeenCalledTimes(1)
    expect(sendPushNotifications.mock.calls[0][0]).toEqual([7])
  })

  it('does not mention the author themselves', async () => {
    query.mockResolvedValueOnce([{ id: 1, username: 'alice', language: 'en' }])

    await recordForumMentions({
      text: 'I, @alice, am the author',
      authorUserId: 1,
      authorUsername: 'alice',
      postId: 42,
      postTitle: 'Title'
    })

    // Only the resolve query; no INSERT
    expect(query).toHaveBeenCalledTimes(1)
    expect(sendPushNotifications).not.toHaveBeenCalled()
  })

  it('records the comment id when provided', async () => {
    query
      .mockResolvedValueOnce([{ id: 7, username: 'bob', language: 'de' }])
      .mockResolvedValueOnce({})

    await recordForumMentions({
      text: '@bob',
      authorUserId: 1,
      authorUsername: 'alice',
      postId: 42,
      postTitle: 'Title',
      commentId: 1337
    })

    expect(query.mock.calls[1][1]).toMatchObject({ comment_id: 1337 })
  })

  it('groups push notifications by language', async () => {
    query
      .mockResolvedValueOnce([
        { id: 7, username: 'bob', language: 'de' },
        { id: 8, username: 'carol', language: 'en' }
      ])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})

    await recordForumMentions({
      text: '@bob and @carol',
      authorUserId: 1,
      authorUsername: 'alice',
      postId: 42,
      postTitle: 'Title'
    })

    expect(sendPushNotifications).toHaveBeenCalledTimes(2)
  })
})
