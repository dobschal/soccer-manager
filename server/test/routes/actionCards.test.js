import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, testData } from '../setup.js'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

vi.mock('../../helper/teamHelper.js', () => ({
  getTeam: vi.fn()
}))

vi.mock('../../helper/actionCardHelper.js', () => ({
  getActionCards: vi.fn(),
  playActionCard: vi.fn(),
  getPendingActionCards: vi.fn(),
  claimActionCard: vi.fn(),
  generateYouthPlayerOptions: vi.fn(),
  YOUTH_PLAYER_CARD_RANGES: {
    NEW_YOUTH_PLAYER_1: { levelMin: 1, levelMax: 5, talentMin: 0.1, talentMax: 0.5 },
    NEW_YOUTH_PLAYER_2: { levelMin: 5, levelMax: 10, talentMin: 0.3, talentMax: 0.75 },
    NEW_YOUTH_PLAYER_3: { levelMin: 10, levelMax: 15, talentMin: 0.5, talentMax: 1.0 }
  }
}))

vi.mock('../../helper/gameDayHelper.js', () => ({
  getGameDayAndSeason: vi.fn().mockResolvedValue({ gameDay: 1, season: 1 })
}))

vi.mock('../../lib/websocket.js', () => ({
  sendToUser: vi.fn().mockReturnValue(true)
}))

import { query } from '../../lib/database.js'
import { getTeam } from '../../helper/teamHelper.js'
import { getActionCards, playActionCard, getPendingActionCards, claimActionCard, generateYouthPlayerOptions } from '../../helper/actionCardHelper.js'
import { sendToUser } from '../../lib/websocket.js'
import { SERVER_EVENTS } from '../../../client/lib/serverEvents.js'
import handlers from '../../routes/actionCards.js'

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
      const req = { user: null, body: {}, headers: {}, locale: 'en' }

      await expect(handlers.getActionCards(req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('mergeCards', () => {
    it('merges two LEVEL_UP_PLAYER_40 cards into LEVEL_UP_PLAYER_70', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_40' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_40' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({ insertId: 99 })

      const req = createMockRequest()
      const result = await handlers.mergeCards(card1, card2, req)

      expect(result).toEqual({ success: true, actionCard: { id: 99, action: 'LEVEL_UP_PLAYER_70' } })
      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [1])
      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [2])
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        team_id: team.id,
        action: 'LEVEL_UP_PLAYER_70',
        played: 0,
        state: 'received'
      }))
    })

    it('emits ACTION_CARDS_CHANGED after a successful merge', async () => {
      const team = testData.team({ user_id: 77 })
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_40' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_40' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({ insertId: 99 })

      await handlers.mergeCards(card1, card2, createMockRequest())

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
    })

    it('merges two LEVEL_UP_PLAYER_70 cards into LEVEL_UP_PLAYER_100', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_70' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_70' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({ insertId: 100 })

      const req = createMockRequest()
      const result = await handlers.mergeCards(card1, card2, req)

      expect(result).toEqual({ success: true, actionCard: { id: 100, action: 'LEVEL_UP_PLAYER_100' } })
      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        action: 'LEVEL_UP_PLAYER_100'
      }))
    })

    it('throws error when merging different card types', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })
      const card2 = testData.actionCard({ action: 'FRESHNESS_10' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Cannot merge these cards' })
    })

    it('throws error when merging non-mergeable cards', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ action: 'FRESHNESS_10' })
      const card2 = testData.actionCard({ action: 'FRESHNESS_10' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Cannot merge these cards' })
    })

    it('throws error when trying to merge LEVEL_UP_PLAYER_100 cards (already max tier)', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_100' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_100' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Cannot merge these cards' })
    })

    it('throws error when trying to merge NEW_YOUTH_PLAYER_1 cards', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 1, action: 'NEW_YOUTH_PLAYER_1' })
      const card2 = testData.actionCard({ id: 2, action: 'NEW_YOUTH_PLAYER_1' })

      getTeam.mockResolvedValue(team)

      const req = createMockRequest()

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Cannot merge these cards' })
    })

    it('deletes both original cards when merging', async () => {
      const team = testData.team()
      const card1 = testData.actionCard({ id: 10, action: 'LEVEL_UP_PLAYER_40' })
      const card2 = testData.actionCard({ id: 20, action: 'LEVEL_UP_PLAYER_40' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.mergeCards(card1, card2, req)

      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [10])
      expect(query).toHaveBeenCalledWith('DELETE FROM action_card WHERE id=?', [20])
    })

    it('creates new card with correct team_id when merging', async () => {
      const team = testData.team({ id: 42 })
      const card1 = testData.actionCard({ id: 1, action: 'LEVEL_UP_PLAYER_70' })
      const card2 = testData.actionCard({ id: 2, action: 'LEVEL_UP_PLAYER_70' })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue({})

      const req = createMockRequest()
      await handlers.mergeCards(card1, card2, req)

      expect(query).toHaveBeenCalledWith('INSERT INTO action_card SET ?', expect.objectContaining({
        team_id: 42,
        action: 'LEVEL_UP_PLAYER_100',
        played: 0,
        state: 'received'
      }))
    })

    it('throws error when not authenticated', async () => {
      const card1 = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })
      const card2 = testData.actionCard({ action: 'LEVEL_UP_PLAYER_40' })

      const req = { user: null, body: {}, headers: {}, locale: 'en' }

      await expect(handlers.mergeCards(card1, card2, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
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
        team,
        'en'
      )
    })

    it('emits ACTION_CARDS_CHANGED to the team owner so the dashboard view refetches', async () => {
      const team = testData.team({ user_id: 77 })
      const actionCard = testData.actionCard()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([actionCard])
      playActionCard.mockResolvedValue()

      await handlers.useActionCard(actionCard, testData.player(), null, createMockRequest())

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
    })

    it('skips the websocket for teams without a user (bot teams)', async () => {
      const team = testData.team({ user_id: null })
      const actionCard = testData.actionCard()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([actionCard])
      playActionCard.mockResolvedValue()

      await handlers.useActionCard(actionCard, testData.player(), null, createMockRequest())

      expect(sendToUser).not.toHaveBeenCalled()
    })

    it('queries with state=received filter', async () => {
      const team = testData.team()
      const actionCard = testData.actionCard({ id: 5 })
      const player = testData.player()

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([actionCard])
      playActionCard.mockResolvedValue()

      const req = createMockRequest()
      await handlers.useActionCard(actionCard, player, null, req)

      expect(query).toHaveBeenCalledWith(
        "SELECT * FROM action_card WHERE id=? AND team_id=? AND played=0 AND state='received'",
        [5, team.id]
      )
    })

    it('throws error when card does not exist', async () => {
      const team = testData.team()
      const actionCard = testData.actionCard({ id: 999 })

      getTeam.mockResolvedValue(team)
      query.mockResolvedValue([])

      const req = createMockRequest()

      await expect(handlers.useActionCard(actionCard, null, null, req))
        .rejects.toMatchObject({ message: 'Action card not found' })
    })
  })

  describe('getPendingActionCards', () => {
    it('returns pending cards for user', async () => {
      const team = testData.team()
      const pendingCards = [
        testData.actionCard({ id: 1, state: 'pending' }),
        testData.actionCard({ id: 2, state: 'pending' })
      ]

      getTeam.mockResolvedValue(team)
      getPendingActionCards.mockResolvedValue(pendingCards)

      const req = createMockRequest()
      const result = await handlers.getPendingActionCards(req)

      expect(result).toEqual({ success: true, pendingCards })
      expect(getPendingActionCards).toHaveBeenCalledWith(team)
    })

    it('returns empty array when no pending cards', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      getPendingActionCards.mockResolvedValue([])

      const req = createMockRequest()
      const result = await handlers.getPendingActionCards(req)

      expect(result).toEqual({ success: true, pendingCards: [] })
    })

    it('throws error when not authenticated', async () => {
      const req = { user: null, body: {}, headers: {}, locale: 'en' }

      await expect(handlers.getPendingActionCards(req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })

  describe('claimActionCard', () => {
    it('claims a pending card', async () => {
      const team = testData.team()
      const claimedCard = testData.actionCard({ id: 10, state: 'received' })

      getTeam.mockResolvedValue(team)
      claimActionCard.mockResolvedValue(claimedCard)

      const req = createMockRequest()
      const result = await handlers.claimActionCard(10, req)

      expect(result).toEqual({ success: true, card: claimedCard })
      expect(claimActionCard).toHaveBeenCalledWith(10, team.id, 'en')
    })

    it('emits ACTION_CARDS_CHANGED so the dashboard view refetches after the pending → received flip', async () => {
      const team = testData.team({ user_id: 77 })

      getTeam.mockResolvedValue(team)
      claimActionCard.mockResolvedValue(testData.actionCard({ id: 10, state: 'received' }))

      await handlers.claimActionCard(10, createMockRequest())

      expect(sendToUser).toHaveBeenCalledWith(77, SERVER_EVENTS.ACTION_CARDS_CHANGED.name)
    })

    it('throws error when not authenticated', async () => {
      const req = { user: null, body: {}, headers: {}, locale: 'en' }

      await expect(handlers.claimActionCard(10, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })

    it('propagates error when card not found', async () => {
      const team = testData.team()

      getTeam.mockResolvedValue(team)
      claimActionCard.mockRejectedValue(new Error('Card not found or already claimed'))

      const req = createMockRequest()

      await expect(handlers.claimActionCard(999, req))
        .rejects.toMatchObject({ message: 'Card not found or already claimed' })
    })
  })

  describe('getYouthPlayerOptions', () => {
    it('generates and persists options on first call, returns cached on subsequent calls', async () => {
      const team = testData.team()
      const generated = [
        { name: 'A', position: 'CF', level: 3, talent: 0.3, hair_color: 1, skin_color: 1 },
        { name: 'B', position: 'CD', level: 4, talent: 0.4, hair_color: 2, skin_color: 2 },
        { name: 'C', position: 'GK', level: 2, talent: 0.2, hair_color: 0, skin_color: 0 }
      ]

      getTeam.mockResolvedValue(team)
      generateYouthPlayerOptions.mockResolvedValue(generated)

      // First call: card has no cached options
      query.mockResolvedValueOnce([{ id: 7, team_id: team.id, action: 'NEW_YOUTH_PLAYER_1', played: 0, state: 'received', youth_options: null }])
      query.mockResolvedValueOnce({ affectedRows: 1 })

      const req = createMockRequest()
      const first = await handlers.getYouthPlayerOptions(7, req)
      expect(first).toEqual({ success: true, options: generated })
      expect(generateYouthPlayerOptions).toHaveBeenCalledTimes(1)
      expect(query).toHaveBeenCalledWith('UPDATE action_card SET youth_options=? WHERE id=?', [JSON.stringify(generated), 7])

      // Second call: card returns cached options
      query.mockResolvedValueOnce([{ id: 7, team_id: team.id, action: 'NEW_YOUTH_PLAYER_1', played: 0, state: 'received', youth_options: JSON.stringify(generated) }])

      const second = await handlers.getYouthPlayerOptions(7, req)
      expect(second).toEqual({ success: true, options: generated })
      expect(generateYouthPlayerOptions).toHaveBeenCalledTimes(1)
    })

    it('regenerates options when cached JSON is corrupt', async () => {
      const team = testData.team()
      const generated = [
        { name: 'A', position: 'CF', level: 3, talent: 0.3, hair_color: 1, skin_color: 1 },
        { name: 'B', position: 'CD', level: 4, talent: 0.4, hair_color: 2, skin_color: 2 },
        { name: 'C', position: 'GK', level: 2, talent: 0.2, hair_color: 0, skin_color: 0 }
      ]

      getTeam.mockResolvedValue(team)
      generateYouthPlayerOptions.mockResolvedValue(generated)
      query.mockResolvedValueOnce([{ id: 8, team_id: team.id, action: 'NEW_YOUTH_PLAYER_2', played: 0, state: 'received', youth_options: 'not json{{' }])
      query.mockResolvedValueOnce({ affectedRows: 1 })

      const req = createMockRequest()
      const result = await handlers.getYouthPlayerOptions(8, req)
      expect(result).toEqual({ success: true, options: generated })
    })

    it('throws when card is not a youth card', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([{ id: 9, team_id: team.id, action: 'BONUS_100K', played: 0, state: 'received', youth_options: null }])

      const req = createMockRequest()
      await expect(handlers.getYouthPlayerOptions(9, req))
        .rejects.toMatchObject({ message: 'Invalid card action' })
    })

    it('throws when card not found', async () => {
      const team = testData.team()
      getTeam.mockResolvedValue(team)
      query.mockResolvedValueOnce([])

      const req = createMockRequest()
      await expect(handlers.getYouthPlayerOptions(123, req))
        .rejects.toMatchObject({ message: 'Action card not found' })
    })

    it('throws when not authenticated', async () => {
      const req = { user: null, body: {}, headers: {}, locale: 'en' }
      await expect(handlers.getYouthPlayerOptions(1, req))
        .rejects.toMatchObject({ message: 'Not authorized' })
    })
  })
})
