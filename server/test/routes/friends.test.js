import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import handlers from '../../routes/friends.js'

describe('friends routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('addFriend', () => {
    it('inserts a friend row when target user exists', async () => {
      query
        .mockResolvedValueOnce([{ id: 42 }]) // user lookup
        .mockResolvedValueOnce({ affectedRows: 1 }) // insert

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.addFriend(42, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('SELECT id FROM user WHERE id=? LIMIT 1', [42])
      expect(query).toHaveBeenCalledWith(
        'INSERT IGNORE INTO user_friend (user_id, friend_user_id) VALUES (?, ?)',
        [1, 42]
      )
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.addFriend(42, req)).rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('rejects adding self as a friend', async () => {
      const req = createMockRequest({ user: { id: 7, username: 'me' } })
      await expect(handlers.addFriend(7, req)).rejects.toMatchObject({
        message: 'Cannot add yourself as a friend'
      })
    })

    it('rejects invalid ids', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.addFriend(0, req)).rejects.toMatchObject({
        message: 'Invalid friend user id'
      })
    })

    it('rejects when target user does not exist', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      await expect(handlers.addFriend(99, req)).rejects.toMatchObject({
        message: 'User not found'
      })
    })
  })

  describe('removeFriend', () => {
    it('deletes the friend row', async () => {
      query.mockResolvedValueOnce({ affectedRows: 1 })

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.removeFriend(42, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM user_friend WHERE user_id=? AND friend_user_id=?',
        [1, 42]
      )
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.removeFriend(42, req)).rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('isFriend', () => {
    it('returns true when friend row exists', async () => {
      query.mockResolvedValueOnce([{ '1': 1 }])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.isFriend(42, req)

      expect(result).toEqual({ isFriend: true })
    })

    it('returns false when no friend row exists', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.isFriend(42, req)

      expect(result).toEqual({ isFriend: false })
    })

    it('returns false for invalid ids without querying', async () => {
      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.isFriend(0, req)
      expect(result).toEqual({ isFriend: false })
      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('getFriendsLastGameDayGames', () => {
    it('returns empty array when user has no friends', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games: [] })
    })

    it('returns games from the friends most recent league game day', async () => {
      const friendTeams = [
        { id: 10, user_id: 2, level: 1, league: 1 },
        { id: 11, user_id: 3, level: 1, league: 1 }
      ]
      const lastDay = { season: 4, game_day: 17 }
      const games = [
        { id: 100, gameDay: 17, season: 4, goalsTeam1: 2, goalsTeam2: 1, team1: 'A', team2: 'B', team1Id: 10, team2Id: 50 },
        { id: 101, gameDay: 17, season: 4, goalsTeam1: 0, goalsTeam2: 0, team1: 'C', team2: 'D', team1Id: 60, team2Id: 11 }
      ]

      query
        .mockResolvedValueOnce(friendTeams)
        .mockResolvedValueOnce([lastDay])
        .mockResolvedValueOnce(games)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games })
    })

    it('returns empty array when friends have no played league games yet', async () => {
      query
        .mockResolvedValueOnce([{ id: 10, user_id: 2, level: 1, league: 1 }])
        .mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games: [] })
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.getFriendsLastGameDayGames(req)).rejects.toMatchObject({
        message: 'Not authorized'
      })
    })
  })
})
