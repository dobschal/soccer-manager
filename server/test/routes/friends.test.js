import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/cupHelper.js', () => ({
  getTotalRoundsForSeason: vi.fn()
}))

vi.mock('../../helper/standingHelper.js', () => ({
  getCachedStanding: vi.fn()
}))

import { query } from '../../lib/database.js'
import { getTotalRoundsForSeason } from '../../helper/cupHelper.js'
import { getCachedStanding } from '../../helper/standingHelper.js'
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

  describe('getFriends', () => {
    it('returns the list of friends with their team info', async () => {
      const friends = [
        { id: 2, username: 'alice', avatar: 'a.jpg', teamId: 10, teamName: 'FC Alice', teamLevel: 5 },
        { id: 3, username: 'bob', avatar: null, teamId: 11, teamName: 'Bob United', teamLevel: 3 }
      ]
      query.mockResolvedValueOnce(friends)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriends(req)

      expect(result).toEqual({ friends })
      const sql = query.mock.calls[0][0]
      expect(sql).toMatch(/FROM user_friend uf/)
      expect(sql).toMatch(/JOIN user u ON u\.id = uf\.friend_user_id/)
      expect(sql).toMatch(/LEFT JOIN team t ON t\.user_id = u\.id/)
      expect(query.mock.calls[0][1]).toEqual([1])
    })

    it('returns an empty list when the user has no friends', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriends(req)

      expect(result).toEqual({ friends: [] })
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.getFriends(req)).rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('getFriendsOverview', () => {
    it('returns mutual friends with team, position and last game', async () => {
      const rows = [{
        userId: 2,
        username: 'alice',
        avatar: 'a.jpg',
        teamId: 10,
        teamName: 'FC Alice',
        teamShortName: 'ALI',
        teamEmblem: 'em',
        teamColor: '#fff',
        teamLevel: 1,
        teamLeague: 0,
        isOutgoing: 1,
        isIncoming: 1
      }]
      const lastGame = {
        id: 99, gameDay: 5, season: 3, goalsTeam1: 2, goalsTeam2: 1,
        gameType: 'league', team1Id: 10, team2Id: 20,
        team1Name: 'FC Alice', team1ShortName: 'ALI', team1Emblem: 'em', team1Color: '#fff',
        team2Name: 'FC Bob', team2ShortName: 'BOB', team2Emblem: 'em2', team2Color: '#000'
      }
      query
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ lastDay: 5, season: 3 }])
        .mockResolvedValueOnce([lastGame])
      getCachedStanding.mockResolvedValueOnce([
        { team: { id: 7 } }, { team: { id: 10 } }, { team: { id: 11 } }
      ])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsOverview(req)

      expect(result.entries).toHaveLength(1)
      const entry = result.entries[0]
      expect(entry.userId).toBe(2)
      expect(entry.username).toBe('alice')
      expect(entry.status).toBe('mutual')
      expect(entry.team).toEqual({
        id: 10, name: 'FC Alice', shortName: 'ALI', emblem: 'em',
        color: '#fff', level: 1, league: 0
      })
      expect(entry.position).toBe(2)
      expect(entry.lastGame).toEqual(lastGame)
    })

    it('marks incoming-only requests with status incoming', async () => {
      const rows = [{
        userId: 3,
        username: 'bob',
        avatar: null,
        teamId: null,
        teamName: null,
        teamShortName: null,
        teamEmblem: null,
        teamColor: null,
        teamLevel: null,
        teamLeague: null,
        isOutgoing: 0,
        isIncoming: 1
      }]
      query.mockResolvedValueOnce(rows)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsOverview(req)

      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].status).toBe('incoming')
      expect(result.entries[0].team).toBeNull()
      expect(result.entries[0].position).toBeNull()
      expect(result.entries[0].lastGame).toBeNull()
    })

    it('returns position null when standing cache is missing', async () => {
      const rows = [{
        userId: 2,
        username: 'alice',
        avatar: null,
        teamId: 10,
        teamName: 'FC Alice',
        teamShortName: 'ALI',
        teamEmblem: 'em',
        teamColor: '#fff',
        teamLevel: 1,
        teamLeague: 0,
        isOutgoing: 1,
        isIncoming: 0
      }]
      query
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ lastDay: 5, season: 3 }])
        .mockResolvedValueOnce([])
      getCachedStanding.mockResolvedValueOnce(null)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsOverview(req)

      expect(result.entries[0].position).toBeNull()
      expect(result.entries[0].status).toBe('outgoing')
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.getFriendsOverview(req)).rejects.toMatchObject({
        message: 'Not authorized'
      })
    })
  })

  describe('getFriendsLastGameDayGames', () => {
    it('returns empty result when user has no friends', async () => {
      query.mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games: [], totalRounds: 0 })
    })

    it('returns league games from the friends most recent game day', async () => {
      const friendTeams = [
        { id: 10, user_id: 2, level: 1, league: 1 },
        { id: 11, user_id: 3, level: 1, league: 1 }
      ]
      const lastDay = { season: 4, game_day: 17 }
      const games = [
        { id: 100, gameDay: 17, season: 4, goalsTeam1: 2, goalsTeam2: 1, gameType: 'league', cupRound: null, team1: 'A', team2: 'B', team1Id: 10, team2Id: 50 },
        { id: 101, gameDay: 17, season: 4, goalsTeam1: 0, goalsTeam2: 0, gameType: 'league', cupRound: null, team1: 'C', team2: 'D', team1Id: 60, team2Id: 11 }
      ]

      query
        .mockResolvedValueOnce(friendTeams)
        .mockResolvedValueOnce([lastDay])
        .mockResolvedValueOnce(games)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games, totalRounds: 0 })
      expect(getTotalRoundsForSeason).not.toHaveBeenCalled()
    })

    it('includes cup games alongside league games for the last game day', async () => {
      const friendTeams = [
        { id: 10, user_id: 2, level: 1, league: 1 },
        { id: 11, user_id: 3, level: 1, league: 1 }
      ]
      const lastDay = { season: 4, game_day: 17 }
      const games = [
        { id: 100, gameDay: 17, season: 4, goalsTeam1: 2, goalsTeam2: 1, gameType: 'league', cupRound: null, team1: 'A', team2: 'B', team1Id: 10, team2Id: 50 },
        { id: 200, gameDay: 17, season: 4, goalsTeam1: 3, goalsTeam2: 0, gameType: 'cup', cupRound: 2, team1: 'X', team2: 'Y', team1Id: 11, team2Id: 70 }
      ]

      query
        .mockResolvedValueOnce(friendTeams)
        .mockResolvedValueOnce([lastDay])
        .mockResolvedValueOnce(games)
      getTotalRoundsForSeason.mockResolvedValueOnce(5)

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games, totalRounds: 5 })
      expect(getTotalRoundsForSeason).toHaveBeenCalledWith(4)

      const lastDaySql = query.mock.calls[1][0]
      expect(lastDaySql).toMatch(/game_type = 'cup'/)
      const gamesSql = query.mock.calls[2][0]
      expect(gamesSql).toMatch(/game_type = 'cup'/)
      expect(gamesSql).toMatch(/g\.game_type\s+as gameType/)
      expect(gamesSql).toMatch(/g\.cup_round\s+as cupRound/)
    })

    it('returns empty result when friends have no played league or cup games yet', async () => {
      query
        .mockResolvedValueOnce([{ id: 10, user_id: 2, level: 1, league: 1 }])
        .mockResolvedValueOnce([])

      const req = createMockRequest({ user: { id: 1, username: 'me' } })
      const result = await handlers.getFriendsLastGameDayGames(req)

      expect(result).toEqual({ games: [], totalRounds: 0 })
    })

    it('rejects unauthenticated calls', async () => {
      const req = { user: null }
      await expect(handlers.getFriendsLastGameDayGames(req)).rejects.toMatchObject({
        message: 'Not authorized'
      })
    })
  })
})
