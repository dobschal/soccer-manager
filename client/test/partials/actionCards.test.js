import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../../lib/gateway.js', () => ({
  server: {
    getActionCards: vi.fn(),
    getMyTeam: vi.fn(),
    useActionCard: vi.fn(),
    mergeCards: vi.fn()
  }
}))

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../partials/dialog.js', () => ({
  showDialog: vi.fn(() => Promise.resolve({ ok: false, value: undefined }))
}))

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class {
    constructor () {}
    toString () { return '<div class="player-list"></div>' }
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/delay.js', () => ({
  delay: vi.fn(() => Promise.resolve())
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

import { ActionCards } from '../../partials/actionCards.js'
import { server } from '../../lib/gateway.js'
import { toast } from '../../partials/toast.js'

describe('ActionCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('template', () => {
    it('renders title and subtitle', async () => {
      server.getActionCards.mockResolvedValue({ actionCards: [] })

      const cards = new ActionCards()
      await cards.load()

      const html = cards.template
      expect(html).toContain('actionCards.title')
      expect(html).toContain('actionCards.subtitle')
    })

    it('shows no cards message when empty', async () => {
      server.getActionCards.mockResolvedValue({ actionCards: [] })

      const cards = new ActionCards()
      await cards.load()

      const html = cards.template
      expect(html).toContain('actionCards.noCards')
    })

    it('renders cards container when cards exist', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'LEVEL_UP_PLAYER_4' }]
      })

      const cards = new ActionCards()
      await cards.load()

      const html = cards.template
      expect(html).toContain('action-cards-scroll')
      expect(html).not.toContain('actionCards.noCards')
    })
  })

  describe('load', () => {
    it('fetches action cards from server', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_4' },
        { id: 2, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      expect(cards.cards).toEqual(mockCards)
    })
  })

  describe('_renderGroupedCards', () => {
    it('groups cards by action type', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_4' },
        { id: 2, action: 'LEVEL_UP_PLAYER_4' },
        { id: 3, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      // Should have action card stacks
      expect(html).toContain('action-card-stack')
    })

    it('shows merge badge for multiple LEVEL_UP_PLAYER_4 cards', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_4' },
        { id: 2, action: 'LEVEL_UP_PLAYER_4' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="true"')
      expect(html).toContain('action-card-merge-badge')
    })

    it('shows merge badge for multiple LEVEL_UP_PLAYER_7 cards', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_7' },
        { id: 2, action: 'LEVEL_UP_PLAYER_7' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="true"')
    })

    it('does not show merge badge for single card', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_4' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="false"')
    })

    it('does not show merge badge for non-mergeable cards', async () => {
      const mockCards = [
        { id: 1, action: 'BONUS_100K' },
        { id: 2, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="false"')
    })

    it('shows count badge for multiple cards', async () => {
      const mockCards = [
        { id: 1, action: 'BONUS_100K' },
        { id: 2, action: 'BONUS_100K' },
        { id: 3, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('action-card-count')
      expect(html).toContain('>3<')
    })
  })

  describe('_useActionCard', () => {
    it('handles BONUS_100K card', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'BONUS_100K' }]
      })
      server.useActionCard.mockResolvedValue({})

      const cards = new ActionCards()
      await cards.load()
      cards._animateAndRemoveCard = vi.fn()

      await cards._useActionCard(cards.cards[0], 0)

      expect(server.useActionCard).toHaveBeenCalledWith(cards.cards[0], null, null)
      expect(toast).toHaveBeenCalledWith('actionCards.bonusReceived', 'success')
    })

    it('handles NEW_YOUTH_PLAYER card', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'NEW_YOUTH_PLAYER' }]
      })
      server.useActionCard.mockResolvedValue({})

      const cards = new ActionCards()
      await cards.load()
      cards._animateAndRemoveCard = vi.fn()

      await cards._useActionCard(cards.cards[0], 0)

      expect(server.useActionCard).toHaveBeenCalledWith(cards.cards[0], null, null)
      expect(toast).toHaveBeenCalledWith('actionCards.newPlayer', 'success')
    })

    it('shows error toast on failure', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'BONUS_100K' }]
      })
      server.useActionCard.mockRejectedValue(new Error('Server error'))

      const cards = new ActionCards()
      await cards.load()

      await cards._useActionCard(cards.cards[0], 0)

      expect(toast).toHaveBeenCalledWith('Server error', 'error')
    })

    it('shows toast for unknown card type', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'UNKNOWN_ACTION' }]
      })

      const cards = new ActionCards()
      await cards.load()

      await cards._useActionCard(cards.cards[0], 0)

      expect(toast).toHaveBeenCalledWith('actionCards.notImplemented')
    })
  })

  describe('events', () => {
    it('registers click event on container', () => {
      const cards = new ActionCards()

      const events = cards.events
      expect(events['.action-cards-container']).toBeDefined()
      expect(events['.action-cards-container'].click).toBeDefined()
    })
  })
})
