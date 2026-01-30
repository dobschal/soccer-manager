import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../test/setup.js'

vi.mock('../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../helper/actionCardHelper.js', () => ({
  getActionCards: vi.fn(),
  playActionCard: vi.fn()
}))

import { query } from '../lib/database.js'
import { getTeam } from '../helper/teamHelper.js'
import { getActionCards, playActionCard } from '../helper/actionCardHelper.js'
import handlers from './actionCards.js'

describe('actionCards routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getActionCards', () => {
    it('returns action cards for user', async () => {
      const team = testData.team()
      const actionCards = [testData.actionCard(), testData.actionCard({ id: 2 })]

      getTeam.mockResolvedValue(team)
      getActionCards.mockResolvedValue(actionCards)

      const req = createMockRequest()
      const result = await handlers.getActionCards(req)

      expect(result).toEqual({ success: true, actionCards })
    })

    it('throws error when not authenticated', async () => {
      const req = { user: null, body: {}, headers: {} }

      await expect(handlers.getActionCards(req))
        .rejects.toMatchObject({ message: 'Missing user' })
    })
  })

  describe('mergeCards', () => {
    it('merges two LEVEL_UP_PLAYER_4 cards into LEVEL_UP_PLAYER_7', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_4' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_4' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.mergeCards(card1, card2, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [1])
      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [2])
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        team_id: team.id,
        action: 'LEVEL_UP_PLAYER_7',
        played: 0
      }))
    })

    it('merges two LEVEL_UP_PLAYER_7 cards into LEVEL_UP_PLAYER_9', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_7' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_7' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      const result = await handlers.mergeCards(card1, card2, req)

      expect(result).toEqual({ success: true })
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        action: 'LEVEL_UP_PLAYER_9'
      }))
    })

    it('throws error when merging different card types', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ action: 'LEVEL_UP_PLAYER_4' })
      const card2 = testData.actionCard({ action: 'FRESHNESS_10' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'You can only merge cards of the same type' })
    })

    it('throws error when merging non-mergeable cards', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ action: 'FRESHNESS_10' })
      const card2 = testData.actionCard({ action: 'FRESHNESS_10' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Cannot merge' })
    })
  })

  describe('useActionCard', () => {
    it('uses valid action card', async () => {
      const team = testData.team()
      const actionCard = testData.actionCard()
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([actionCard])
      playActionCard.mockResolvedValue()

      const req = createMockRequest()
      const result = await handlers.useActionCard(actionCard, player, null, req)

      expect(result).toEqual({ success: true })
      expect(playActionCard).toHaveBeenCalledWith(
        { actionCard, player, position: null },
        team
      )
    })

    it('throws error when card does not exist', async () => {
      const team = testData.team()
      const actionCard = testData.actionCard({ id: 999 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()

      await expect(handlers.useActionCard(actionCard, null, null, req))
        .rejects.toMatchObject({ message: 'Action card does not exist' })
    })
  })
})
