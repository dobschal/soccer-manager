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
    cancelOffer: vi.fn(() => Promise.resolve({ success: true })),
    addTradeOffer: vi.fn(() => Promise.resolve({ success: true }))
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
    constructor (player) {
      this.player = player
    }

    toString () { return '<div class="action-card-giver-stub"></div>' }
  }
}))

const PlayerModal = (await import('../../partials/playerModal.js')).default
const { ActionCardGiver } = await import('../../partials/actionCardGiver.js')
const { server } = await import('../../lib/gateway.js')
const { showDialog } = await import('../../partials/dialog.js')
const { toast } = await import('../../partials/toast.js')
const { SERVER_EVENTS } = await import('../../lib/serverEvents.js')

/**
 * Mount a loaded PlayerModal into the DOM with a filled price input, so
 * _onTradeOffer() can read the entered price like it does in the browser.
 * The market value is pinned to 100,000 -> the 75% floor sits at 75,000.
 * @param {{teamId: number, rawValue: string}} options
 * @returns {Promise<PlayerModal>}
 */
async function _mountModalWithPriceInput ({ teamId, rawValue }) {
  server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: teamId }))
  const modal = new PlayerModal(5)
  modal.overlay = { remove: vi.fn(), onClose: vi.fn() }
  await modal.load()
  modal.price = 100000
  document.body.innerHTML = `
    <div data-render_id="${modal._renderId}">
      <input id="trade-price-input" data-raw-value="${rawValue}">
    </div>`
  return modal
}

describe('PlayerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('formats the salary and value stat cards with the shared short format', async () => {
    server.getPlayerById.mockResolvedValue(testData.player({ id: 5, team_id: 1 }))
    const modal = new PlayerModal(5)
    await modal.load()
    modal.price = 2_819_192
    // Shared shortEuroFormat — upper-case unit, space before the euro sign.
    expect(modal.template).toContain('2.8M €')
    expect(modal.template).not.toContain('M€')
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

    it('patches the freshness/level stat cards in place when PLAYER_UPDATED fires for this player', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 50, freshness: 0.2 }))
      const modal = new PlayerModal(5)
      await modal.load()
      // Build the DOM the handler targets.
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = '<div class="stat-card-value" data-stat="level"></div><div class="stat-card-value" data-stat="freshness"></div>'
      document.body.appendChild(root)

      modal.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 5, team_id: 1, level: 51, freshness: 1.0 })
      })

      expect(root.querySelector('[data-stat="level"]').textContent).toBe('51')
      expect(root.querySelector('[data-stat="freshness"]').textContent).toBe('100%')
      expect(modal.player.level).toBe(51)
      expect(modal.player.freshness).toBe(1.0)
      root.remove()
    })

    it('repaints the injury notice when a treatment card shortens the lay-off', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({
        id: 5, team_id: 1, is_injured: 1, injury_type: 'fracture', injury_days_left: 6
      }))
      const modal = new PlayerModal(5)
      await modal.load()
      // The notice is rendered into its own container so the handler can find it.
      expect(modal.template).toContain('data-alert="injury"')

      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = `<div data-alert="injury">${modal._renderInjuryAlert()}</div><div data-alert="star"></div>`
      document.body.appendChild(root)
      expect(root.querySelector('[data-alert="injury"]').textContent).toContain('6')

      modal.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({
          id: 5, team_id: 1, is_injured: 1, injury_type: 'fracture', injury_days_left: 5
        })
      })

      const notice = root.querySelector('[data-alert="injury"]')
      expect(notice.textContent).toContain('5')
      expect(notice.textContent).not.toContain('6')
      root.remove()
    })

    it('clears the injury notice once the treatment ends the injury', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({
        id: 5, team_id: 1, is_injured: 1, injury_type: 'bruise', injury_days_left: 1
      }))
      const modal = new PlayerModal(5)
      await modal.load()
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = `<div data-alert="injury">${modal._renderInjuryAlert()}</div><div data-alert="star"></div>`
      document.body.appendChild(root)
      expect(root.querySelector('.alert-danger')).not.toBeNull()

      modal.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 5, team_id: 1, is_injured: 0, injury_type: null, injury_days_left: 0 })
      })

      expect(root.querySelector('.alert-danger')).toBeNull()
      root.remove()
    })

    it('shows the star notice as soon as a star card promotes the player', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, name: 'Hans' }))
      const modal = new PlayerModal(5)
      await modal.load()
      const overlay = document.createElement('div')
      overlay.classList.add('overlay')
      overlay.innerHTML = '<div class="card-title">Hans</div>'
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = '<div data-alert="injury"></div><div data-alert="star"></div>'
      overlay.appendChild(root)
      document.body.appendChild(overlay)

      modal.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 5, team_id: 1, name: 'Hans', is_star_player: 1 })
      })

      expect(root.querySelector('.alert-warning')).not.toBeNull()
      // …and the star lands in the title too, which only `onMounted` used to set.
      expect(overlay.querySelector('.card-title').textContent).toBe('Hans ⭐')
      overlay.remove()
    })

    it('ignores PLAYER_UPDATED events for other players', async () => {
      server.getPlayerById.mockResolvedValueOnce(testData.player({ id: 5, team_id: 1, level: 50, freshness: 0.2 }))
      const modal = new PlayerModal(5)
      await modal.load()
      const root = document.createElement('div')
      root.setAttribute('data-render_id', modal._renderId)
      root.innerHTML = '<div class="stat-card-value" data-stat="level">50</div>'
      document.body.appendChild(root)

      modal.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 99, team_id: 1, level: 80, freshness: 1.0 })
      })

      expect(root.querySelector('[data-stat="level"]').textContent).toBe('50')
      expect(modal.player.level).toBe(50)
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

  describe('#446 minimum offer price', () => {
    it('blocks a sell offer below 75% of the market value', async () => {
      const modal = await _mountModalWithPriceInput({ teamId: 1, rawValue: '74999' })

      await modal._onTradeOffer()

      expect(server.addTradeOffer).not.toHaveBeenCalled()
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('75%'), 'error')
    })

    it('blocks a buy offer below 75% of the market value', async () => {
      const modal = await _mountModalWithPriceInput({ teamId: 2, rawValue: '74999' })

      await modal._onTradeOffer()

      expect(server.addTradeOffer).not.toHaveBeenCalled()
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('75%'), 'error')
    })

    it('sends an offer at exactly 75% of the market value', async () => {
      const modal = await _mountModalWithPriceInput({ teamId: 2, rawValue: '75000' })

      await modal._onTradeOffer()

      expect(server.addTradeOffer).toHaveBeenCalledWith(modal.player, 75000, 'buy', true)
    })
  })
})
