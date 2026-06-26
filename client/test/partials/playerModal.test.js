import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testData } from '../setup.js'

// Use the real i18n module so translated strings render as users see them.

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getPlayerById: vi.fn(),
    getCurrentGameday: vi.fn(() => Promise.resolve({ season: 0 })),
    getMyTeam: vi.fn(() => Promise.resolve({ team: testData.team({ id: 1 }) })),
    getTeam: vi.fn(() => Promise.resolve({ team: testData.team({ id: 1 }) })),
    getPlayerHistory: vi.fn(() => Promise.resolve([])),
    myOfferForPlayer: vi.fn(() => Promise.resolve({ offer: undefined })),
    hasPlayerSellOffer: vi.fn(() => Promise.resolve({ hasSellOffer: false, sellOfferPrice: null, allowInstantBuy: false })),
    cancelOffer: vi.fn(() => Promise.resolve({ success: true }))
  }
}))

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve('<div class="player-image"></div>'))
}))

vi.mock('../../partials/dialog.js', () => ({
  showDialog: vi.fn(() => Promise.resolve({ ok: true }))
}))

vi.mock('../../partials/currencyInput.js', () => ({
  renderCurrencyInput: vi.fn(() => '<input id="trade-price-input">'),
  setupCurrencyInput: vi.fn()
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ onClose: vi.fn(), remove: vi.fn() }))
}))

vi.mock('../../lib/router.js', () => ({
  goTo: vi.fn(),
  setQueryParams: vi.fn()
}))

// The action-card section is its own UIElement, tested in actionCardGiver.test.js.
vi.mock('../../partials/actionCardGiver.js', () => ({
  ActionCardGiver: class {
    constructor (player, onApplied) {
      this.player = player
      this.onApplied = onApplied
    }

    toString () { return '<div class="action-card-giver-stub"></div>' }
  }
}))

const PlayerModal = (await import('../../partials/playerModal.js')).default
const { ActionCardGiver } = await import('../../partials/actionCardGiver.js')
const { server } = await import('../../lib/gateway.js')
const { showDialog } = await import('../../partials/dialog.js')
const { toast } = await import('../../partials/toast.js')

describe('PlayerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('action cards', () => {
    it('attaches an ActionCardGiver for the user\'s own player', async () => {
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 1 }))
      const modal = new PlayerModal(5)
      await modal.load()
      expect(modal.isMyPlayer).toBe(true)
      expect(modal._actionCardGiver).toBeInstanceOf(ActionCardGiver)
      expect(modal._actionCardGiver.player).toBe(modal.player)
      expect(modal.template).toContain('action-card-giver-stub')
    })

    it('does not attach an ActionCardGiver for another team\'s player', async () => {
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 2 }))
      const modal = new PlayerModal(5)
      await modal.load()
      expect(modal.isMyPlayer).toBe(false)
      expect(modal._actionCardGiver).toBeNull()
      expect(modal.template).not.toContain('action-card-giver-stub')
    })

    it('refreshes the freshness/level stat cards in place after a card is applied', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 50, freshness: 0.2 }))
      const modal = new PlayerModal(5)
      await modal.load()
      // Build the DOM the refresh targets.
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = '<div class="stat-card-value" data-stat="level"></div><div class="stat-card-value" data-stat="freshness"></div>'
      document.body.appendChild(root)

      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 51, freshness: 1.0 }))
      await modal._refreshPlayerStats()

      expect(root.querySelector('[data-stat="level"]').textContent).toBe('51')
      expect(root.querySelector('[data-stat="freshness"]').textContent).toBe('100%')
      root.remove()
    })

    it('dispatches a player-updated event so the page behind the modal can refresh its list', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 50, freshness: 0.2 }))
      const modal = new PlayerModal(5)
      await modal.load()
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      document.body.appendChild(root)

      const handler = vi.fn()
      window.addEventListener('player-updated', handler)
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 51, freshness: 1.0 }))
      await modal._refreshPlayerStats()
      window.removeEventListener('player-updated', handler)

      expect(handler).toHaveBeenCalledTimes(1)
      const player = handler.mock.calls[0][0].detail.player
      expect(player.id).toBe(5)
      expect(player.level).toBe(51)
      expect(player.freshness).toBe(1.0)
      root.remove()
    })
  })

  describe('remove from transfer market', () => {
    it('shows a remove-from-market button for an own player listed on the market', async () => {
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 1 }))
      server.myOfferForPlayer.mockResolvedValue({ offer: { id: 99, type: 'sell', player_id: 5 } })
      server.hasPlayerSellOffer.mockResolvedValue({ hasSellOffer: true, sellOfferPrice: 1000, allowInstantBuy: true })
      const modal = new PlayerModal(5)
      await modal.load()
      expect(modal.template).toContain('remove-offer-btn')
    })

    it('does not show the remove button for another team\'s listed player', async () => {
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 2 }))
      server.hasPlayerSellOffer.mockResolvedValue({ hasSellOffer: true, sellOfferPrice: 1000, allowInstantBuy: true })
      const modal = new PlayerModal(5)
      await modal.load()
      expect(modal.template).not.toContain('remove-offer-btn')
    })

    it('cancels the sell offer when confirming the removal', async () => {
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, name: 'Hans', team_id: 1 }))
      const offer = { id: 99, type: 'sell', player_id: 5 }
      server.myOfferForPlayer.mockResolvedValue({ offer })
      server.hasPlayerSellOffer.mockResolvedValue({ hasSellOffer: true, sellOfferPrice: 1000, allowInstantBuy: true })
      const modal = new PlayerModal(5)
      modal.overlay = { remove: vi.fn(), onClose: vi.fn() }
      await modal.load()

      await modal._onRemoveOffer()

      expect(showDialog).toHaveBeenCalled()
      expect(server.cancelOffer).toHaveBeenCalledWith(offer)
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Hans'), 'success')
      expect(modal.overlay.remove).toHaveBeenCalled()
    })

    it('does not cancel when the user dismisses the confirmation dialog', async () => {
      showDialog.mockResolvedValueOnce({ ok: false })
      server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 1 }))
      const offer = { id: 99, type: 'sell', player_id: 5 }
      server.myOfferForPlayer.mockResolvedValue({ offer })
      const modal = new PlayerModal(5)
      modal.overlay = { remove: vi.fn(), onClose: vi.fn() }
      await modal.load()

      await modal._onRemoveOffer()

      expect(server.cancelOffer).not.toHaveBeenCalled()
      expect(modal.overlay.remove).not.toHaveBeenCalled()
    })
  })
})
