import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/teamHelper.js', () => ({
  getTeam: vi.fn(),
  getTeamById: vi.fn()
}))

import { query } from '../lib/database.js'
import { getTeam, getTeamById } from '../helper/teamHelper.js'
import handlers from './team.js'

describe('team routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMyTeam', () => {
    it('returns team, players, and user for authenticated user', async () => {
      const team = testData.team()
      const players = [testData.player(), testData.player({ id: 2, name: 'Player 2' })]
      const user = testData.user()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue(players)

      const req = createMockRequest({ user })
      const result = await handlers.getMyTeam(req)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).not.toHaveProperty('password')
    })
  })

  describe('getMyBalance', () => {
    it('returns balance for authenticated user', async () => {
      const team = testData.team({ balance: 123456 })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()
      const result = await handlers.getMyBalance(req)

      expect(result).toEqual({ balance: 123456 })
    })
  })

  describe('updateColor', () => {
    it('updates team color', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.updateColor('#00FF00', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET color=? WHERE id=?', ['#00FF00', team.id])
    })
  })

  describe('getTeam', () => {
    it('returns team and players by team id', async () => {
      const team = testData.team({ user_id: null })
      const players = [testData.player()]

      getTeamById.mockResolvedValue(team)
      query.mockResolvedValue(players)

      const result = await handlers.getTeam(1)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).toBeUndefined()
    })

    it('returns team, players, and user when team has user', async () => {
      const team = testData.team({ user_id: 1 })
      const players = [testData.player()]
      const user = testData.user()

      getTeamById.mockResolvedValue(team)
      query
        .mockResolvedValueOnce(players)
        .mockResolvedValueOnce([user])

      const result = await handlers.getTeam(1)

      expect(result.team).toEqual(team)
      expect(result.players).toEqual(players)
      expect(result.user).not.toHaveProperty('password')
    })
  })

  describe('saveLineup', () => {
    it('updates player positions and formation', async () => {
      const team = testData.team()
      const players = [
        testData.player({ id: 1, in_game_position: 'GK' }),
        testData.player({ id: 2, in_game_position: 'CB' })
      ]
      const updatedPlayers = [
        { id: 1, in_game_position: 'GK' },
        { id: 2, in_game_position: 'LB' }
      ]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)
        .mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.saveLineup(updatedPlayers, '4-3-3', req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('UPDATE team SET formation=? WHERE id=?', ['4-3-3', team.id])
    })

    it('throws error for unknown player', async () => {
      const team = testData.team()
      const players = [testData.player({ id: 1 })]
      const updatedPlayers = [{ id: 999, in_game_position: 'GK' }]

      query
        .mockResolvedValueOnce([team])
        .mockResolvedValueOnce(players)

      const req = createMockRequest()

      await expect(handlers.saveLineup(updatedPlayers, '4-3-3', req))
        .rejects.toMatchObject({ message: 'Unknown player...' })
    })
  })
})
