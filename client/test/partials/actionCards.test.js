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

import { ActionCards } from '../../pages/dashboard/actionCards.js'
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

    it('shows no cards when empty', async () => {
      server.getActionCards.mockResolvedValue({ actionCards: [] })

      const cards = new ActionCards()
      await cards.load()

      const html = cards.template
      expect(html).toContain('action-cards-scroll')
      expect(html).not.toContain('action-card-stack')
    })

    it('renders cards container when cards exist', async () => {
      server.getActionCards.mockResolvedValue({
        actionCards: [{ id: 1, action: 'LEVEL_UP_PLAYER_40' }]
      })

      const cards = new ActionCards()
      await cards.load()

      const html = cards.template
      expect(html).toContain('action-cards-scroll')
      expect(html).toContain('action-card-stack')
    })
  })

  describe('load', () => {
    it('fetches action cards from server', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_40' },
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
        { id: 1, action: 'LEVEL_UP_PLAYER_40' },
        { id: 2, action: 'LEVEL_UP_PLAYER_40' },
        { id: 3, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      // Should have action card stacks
      expect(html).toContain('action-card-stack')
    })

    it('shows merge badge for multiple LEVEL_UP_PLAYER_40 cards', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_40' },
        { id: 2, action: 'LEVEL_UP_PLAYER_40' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="true"')
      expect(html).toContain('action-card-merge-badge')
    })

    it('shows merge badge for multiple LEVEL_UP_PLAYER_70 cards', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_70' },
        { id: 2, action: 'LEVEL_UP_PLAYER_70' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })

      const cards = new ActionCards()
      await cards.load()

      const html = cards._renderGroupedCards()
      expect(html).toContain('data-can-merge="true"')
    })

    it('does not show merge badge for single card', async () => {
      const mockCards = [
        { id: 1, action: 'LEVEL_UP_PLAYER_40' }
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

  describe('using multiple cards from a stack in sequence', () => {
    function setupDOM (actionCards) {
      // Group cards by type (mirrors _renderGroupedCards logic)
      const grouped = {}
      actionCards.cards.forEach((card, idx) => {
        if (!grouped[card.action]) grouped[card.action] = []
        grouped[card.action].push({ card, idx })
      })

      // Create a root element matching the component's render_id
      const root = document.createElement('div')
      root.dataset.render_id = actionCards._renderId

      const actionCardsContainer = document.createElement('div')
      actionCardsContainer.classList.add('action-cards-container')

      const container = document.createElement('div')
      container.classList.add('action-cards-scroll')

      for (const [actionType, cards] of Object.entries(grouped)) {
        const stackEl = document.createElement('div')
        stackEl.classList.add('action-card-stack')
        stackEl.dataset.actionCard = cards[0].idx
        stackEl.dataset.actionType = actionType
        stackEl.dataset.canMerge = 'false'

        for (let i = 0; i < Math.min(cards.length, 5); i++) {
          const wrapper = document.createElement('div')
          wrapper.classList.add('action-card-wrapper')
          const img = document.createElement('img')
          img.classList.add('action-card-image')
          img.setAttribute('src', `assets/action-cards/${actionType.toLowerCase()}.svg`)
          wrapper.appendChild(img)
          stackEl.appendChild(wrapper)
        }

        if (cards.length > 1) {
          const countBadge = document.createElement('span')
          countBadge.classList.add('action-card-count')
          countBadge.textContent = cards.length
          stackEl.appendChild(countBadge)
        }

        container.appendChild(stackEl)
      }

      actionCardsContainer.appendChild(container)
      root.appendChild(actionCardsContainer)
      document.body.innerHTML = ''
      document.body.appendChild(root)
      return container
    }

    it('uses each card with a unique id when activating multiple BONUS_100K cards', async () => {
      const mockCards = [
        { id: 10, action: 'BONUS_100K' },
        { id: 11, action: 'BONUS_100K' },
        { id: 12, action: 'BONUS_100K' },
        { id: 13, action: 'BONUS_100K' },
        { id: 14, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      const usedIds = []
      for (let i = 0; i < 5; i++) {
        const stackEl = document.querySelector('.action-card-stack')
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        const card = actionCards.cards[idx]

        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(card, idx)

        usedIds.push(server.useActionCard.mock.calls[i][0].id)
      }

      // Each call should have used a different card id
      expect(new Set(usedIds).size).toBe(5)
      expect(usedIds).toEqual([10, 11, 12, 13, 14])
      expect(actionCards.cards.filter(c => c.action === 'BONUS_100K')).toHaveLength(0)
    })

    it('uses each card with a unique id when activating multiple MOTIVATING_SPEECH cards', async () => {
      const mockCards = [
        { id: 20, action: 'MOTIVATING_SPEECH' },
        { id: 21, action: 'MOTIVATING_SPEECH' },
        { id: 22, action: 'MOTIVATING_SPEECH' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      for (let i = 0; i < 3; i++) {
        const stackEl = document.querySelector('.action-card-stack')
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        const card = actionCards.cards[idx]

        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(card, idx)
      }

      const usedIds = server.useActionCard.mock.calls.map(c => c[0].id)
      expect(usedIds).toEqual([20, 21, 22])
      expect(actionCards.cards.filter(c => c.action === 'MOTIVATING_SPEECH')).toHaveLength(0)
    })

    it('correctly updates data-action-card index after each card use', async () => {
      const mockCards = [
        { id: 30, action: 'BONUS_100K' },
        { id: 31, action: 'BONUS_100K' },
        { id: 32, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      // Use first card
      let stackEl = document.querySelector('.action-card-stack')
      let idx = parseInt(stackEl.dataset.actionCard, 10)
      actionCards._currentCardElement = stackEl
      await actionCards._useActionCard(actionCards.cards[idx], idx)

      // After first use, the index should still point to a valid BONUS_100K card
      stackEl = document.querySelector('.action-card-stack')
      idx = parseInt(stackEl.dataset.actionCard, 10)
      expect(actionCards.cards[idx]).toBeDefined()
      expect(actionCards.cards[idx].action).toBe('BONUS_100K')
      expect(actionCards.cards[idx].id).toBe(31)
    })

    it('does not send an already-used card id to the server', async () => {
      const mockCards = [
        { id: 40, action: 'NEW_YOUTH_PLAYER' },
        { id: 41, action: 'NEW_YOUTH_PLAYER' },
        { id: 42, action: 'NEW_YOUTH_PLAYER' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      const seenIds = new Set()
      for (let i = 0; i < 3; i++) {
        const stackEl = document.querySelector('.action-card-stack')
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        const card = actionCards.cards[idx]

        // Verify we never re-send an already used id
        expect(seenIds.has(card.id)).toBe(false)
        seenIds.add(card.id)

        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(card, idx)
      }

      expect(seenIds.size).toBe(3)
    })

    it('removes the stack element when the last card is used', async () => {
      const mockCards = [
        { id: 50, action: 'BONUS_100K' },
        { id: 51, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      expect(document.querySelectorAll('.action-card-stack')).toHaveLength(1)

      for (let i = 0; i < 2; i++) {
        const stackEl = document.querySelector('.action-card-stack')
        if (!stackEl) break
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(actionCards.cards[idx], idx)
      }

      expect(document.querySelectorAll('.action-card-stack')).toHaveLength(0)
    })

    it('works correctly with mixed card types in the array', async () => {
      const mockCards = [
        { id: 60, action: 'BONUS_100K' },
        { id: 61, action: 'FRESHNESS_5' },
        { id: 62, action: 'BONUS_100K' },
        { id: 63, action: 'FRESHNESS_5' },
        { id: 64, action: 'BONUS_100K' }
      ]
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()

      // Create a root element matching the component's render_id
      const root = document.createElement('div')
      root.dataset.render_id = actionCards._renderId

      const actionCardsContainer = document.createElement('div')
      actionCardsContainer.classList.add('action-cards-container')

      const container = document.createElement('div')
      container.classList.add('action-cards-scroll')

      // BONUS_100K stack
      const bonusStack = document.createElement('div')
      bonusStack.classList.add('action-card-stack')
      bonusStack.dataset.actionCard = '0'
      bonusStack.dataset.actionType = 'BONUS_100K'
      bonusStack.dataset.canMerge = 'false'
      for (let i = 0; i < 3; i++) {
        const w = document.createElement('div')
        w.classList.add('action-card-wrapper')
        const img = document.createElement('img')
        img.classList.add('action-card-image')
        img.setAttribute('src', 'assets/action-cards/bonus-100k.svg')
        w.appendChild(img)
        bonusStack.appendChild(w)
      }
      const bonusCount = document.createElement('span')
      bonusCount.classList.add('action-card-count')
      bonusCount.textContent = '3'
      bonusStack.appendChild(bonusCount)
      container.appendChild(bonusStack)

      // FRESHNESS_5 stack
      const freshStack = document.createElement('div')
      freshStack.classList.add('action-card-stack')
      freshStack.dataset.actionCard = '1'
      freshStack.dataset.actionType = 'FRESHNESS_5'
      freshStack.dataset.canMerge = 'false'
      for (let i = 0; i < 2; i++) {
        const w = document.createElement('div')
        w.classList.add('action-card-wrapper')
        const img = document.createElement('img')
        img.classList.add('action-card-image')
        img.setAttribute('src', 'assets/action-cards/freshness-5.svg')
        w.appendChild(img)
        freshStack.appendChild(w)
      }
      const freshCount = document.createElement('span')
      freshCount.classList.add('action-card-count')
      freshCount.textContent = '2'
      freshStack.appendChild(freshCount)
      container.appendChild(freshStack)

      actionCardsContainer.appendChild(container)
      root.appendChild(actionCardsContainer)
      document.body.innerHTML = ''
      document.body.appendChild(root)

      // Use all 3 BONUS_100K cards
      const usedBonusIds = []
      for (let i = 0; i < 3; i++) {
        const stackEl = bonusStack.parentElement ? bonusStack : null
        if (!stackEl) break
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        const card = actionCards.cards[idx]
        expect(card.action).toBe('BONUS_100K')

        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(card, idx)
        usedBonusIds.push(card.id)
      }

      expect(usedBonusIds).toEqual([60, 62, 64])

      // FRESHNESS_5 cards should still be intact
      const remainingFreshness = actionCards.cards.filter(c => c.action === 'FRESHNESS_5')
      expect(remainingFreshness).toHaveLength(2)
      expect(remainingFreshness.map(c => c.id)).toEqual([61, 63])
    })

    it('handles stacks with more than 5 cards by rebuilding wrappers', async () => {
      const mockCards = []
      for (let i = 0; i < 10; i++) {
        mockCards.push({ id: 100 + i, action: 'BONUS_100K' })
      }
      server.getActionCards.mockResolvedValue({ actionCards: mockCards })
      server.useActionCard.mockResolvedValue({})

      const actionCards = new ActionCards()
      await actionCards.load()
      setupDOM(actionCards)

      // Stack should start with 5 visual wrappers (slice(0,5))
      let stackEl = document.querySelector('.action-card-stack')
      expect(stackEl.querySelectorAll('.action-card-wrapper')).toHaveLength(5)

      const usedIds = []
      for (let i = 0; i < 10; i++) {
        stackEl = document.querySelector('.action-card-stack')
        if (!stackEl) break
        const idx = parseInt(stackEl.dataset.actionCard, 10)
        const card = actionCards.cards[idx]
        expect(card).toBeDefined()
        expect(card.action).toBe('BONUS_100K')

        actionCards._currentCardElement = stackEl
        await actionCards._useActionCard(card, idx)
        usedIds.push(card.id)
      }

      // All 10 cards should have been used with unique ids
      expect(usedIds).toHaveLength(10)
      expect(new Set(usedIds).size).toBe(10)
      expect(usedIds).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109])

      // Stack should be removed after all cards used
      expect(document.querySelector('.action-card-stack')).toBeNull()
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
