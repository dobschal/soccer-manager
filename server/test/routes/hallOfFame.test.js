import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../lib/badWordsFilter.js', () => ({
  maskBadWords: vi.fn((text) => text)
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/hallOfFame.js'

describe('hallOfFame routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getHallOfFame', () => {
    it('returns empty when no completed seasons', async () => {
      query.mockResolvedValue([])
      const req = createMockRequest()
      const result = await handlers.getHallOfFame(null, req)
      expect(result.seasons).toEqual([])
      expect(result.champions).toEqual([])
      expect(result.cupWinner).toBeNull()
    })

    it('returns champions from all levels and leagues', async () => {
      query
        .mockResolvedValueOnce([{ season: 1 }, { season: 0 }]) // completed seasons (DISTINCT season FROM season_title)
        .mockResolvedValueOnce([
          { title_type: 'champion', level: 0, league: 0, team_id: 1, user_id: 5, team_name: 'Winner FC', emblem: '{}', color: '#FF0000', username: 'champion_user', avatar: null },
          { title_type: 'champion', level: 1, league: 0, team_id: 2, user_id: 6, team_name: 'Second Div A', emblem: '{}', color: '#00FF00', username: 'second_div_a_user', avatar: null },
          { title_type: 'champion', level: 1, league: 1, team_id: 3, user_id: 7, team_name: 'Second Div B', emblem: '{}', color: '#0000FF', username: 'second_div_b_user', avatar: null }
        ])

      const req = createMockRequest()
      const result = await handlers.getHallOfFame(1, req)

      expect(result.season).toBe(1)
      expect(result.seasons).toEqual([1, 0])
      expect(result.champions).toHaveLength(3)
      expect(result.champions[0].level).toBe(0)
      expect(result.champions[0].league).toBe(0)
      expect(result.champions[0].teamName).toBe('Winner FC')
      expect(result.champions[0].username).toBe('champion_user')
      expect(result.champions[1].level).toBe(1)
      expect(result.champions[1].league).toBe(0)
      expect(result.champions[1].teamName).toBe('Second Div A')
      expect(result.champions[2].level).toBe(1)
      expect(result.champions[2].league).toBe(1)
      expect(result.champions[2].teamName).toBe('Second Div B')
    })

    it('returns cup winner from season_title row', async () => {
      query
        .mockResolvedValueOnce([{ season: 0 }]) // completed seasons
        .mockResolvedValueOnce([
          { title_type: 'cup_winner', level: -1, league: -1, team_id: 10, user_id: 7, team_name: 'Cup Champs', emblem: '{}', color: '#00FF00', username: 'cup_winner', avatar: null }
        ])

      const req = createMockRequest()
      const result = await handlers.getHallOfFame(0, req)

      expect(result.cupWinner.teamName).toBe('Cup Champs')
      expect(result.cupWinner.username).toBe('cup_winner')
    })

    it('returns null username for cup winner when team was a bot at time of victory', async () => {
      query
        .mockResolvedValueOnce([{ season: 0 }])
        .mockResolvedValueOnce([
          { title_type: 'cup_winner', level: -1, league: -1, team_id: 10, user_id: null, team_name: 'Bot FC', emblem: '{}', color: '#00FF00', username: null, avatar: null }
        ])

      const req = createMockRequest()
      const result = await handlers.getHallOfFame(0, req)

      expect(result.cupWinner.teamName).toBe('Bot FC')
      expect(result.cupWinner.username).toBeNull()
    })
  })

  describe('getHallOfFameComments', () => {
    it('returns comments for a season', async () => {
      query.mockResolvedValue([
        { id: 1, season: 0, user_id: 1, text: 'Great season!', created_at: '2025-01-01', username: 'user1', like_count: 3, liked: 1 },
        { id: 2, season: 0, user_id: 2, text: 'Well played!', created_at: '2025-01-02', username: 'user2', like_count: 0, liked: 0 }
      ])

      const req = createMockRequest()
      const result = await handlers.getHallOfFameComments(0, req)

      expect(result.comments).toHaveLength(2)
      expect(result.comments[0].liked).toBe(true)
      expect(result.comments[1].liked).toBe(false)
    })
  })

  describe('addHallOfFameComment', () => {
    it('creates a comment and returns it', async () => {
      query
        .mockResolvedValueOnce({ insertId: 42 }) // INSERT
        .mockResolvedValueOnce([{ id: 42, season: 0, user_id: 1, text: 'Nice!', created_at: '2025-01-01', username: 'testuser' }]) // SELECT

      const req = createMockRequest()
      const result = await handlers.addHallOfFameComment(0, 'Nice!', req)

      expect(result.comment.id).toBe(42)
      expect(result.comment.text).toBe('Nice!')
      expect(result.comment.like_count).toBe(0)
      expect(result.comment.liked).toBe(false)
    })

    it('throws on empty text', async () => {
      const req = createMockRequest()
      await expect(handlers.addHallOfFameComment(0, '', req)).rejects.toThrow('Comment text cannot be empty')
    })

    it('throws on text exceeding 500 chars', async () => {
      const req = createMockRequest()
      const longText = 'a'.repeat(501)
      await expect(handlers.addHallOfFameComment(0, longText, req)).rejects.toThrow('Comment text too long')
    })
  })

  describe('toggleHallOfFameCommentLike', () => {
    it('adds a like when not yet liked', async () => {
      query
        .mockResolvedValueOnce([]) // no existing like
        .mockResolvedValueOnce({ insertId: 1 }) // INSERT
        .mockResolvedValueOnce([{ count: 1 }]) // count

      const req = createMockRequest()
      const result = await handlers.toggleHallOfFameCommentLike(42, req)

      expect(result.liked).toBe(true)
      expect(result.likeCount).toBe(1)
    })

    it('removes a like when already liked', async () => {
      query
        .mockResolvedValueOnce([{ id: 99 }]) // existing like
        .mockResolvedValueOnce({}) // DELETE
        .mockResolvedValueOnce([{ count: 0 }]) // count

      const req = createMockRequest()
      const result = await handlers.toggleHallOfFameCommentLike(42, req)

      expect(result.liked).toBe(false)
      expect(result.likeCount).toBe(0)
    })
  })
})
