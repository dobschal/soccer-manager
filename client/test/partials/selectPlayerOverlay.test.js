import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getActionCards: vi.fn(() => Promise.resolve({ actionCards: [] })),
    useActionCard: vi.fn(() => Promise.resolve({ success: true })),
    getCurrentGameday: vi.fn(() => Promise.resolve({ season: 0 })),
    getMySellOfferPlayerIds: vi.fn(() => Promise.resolve({ playerIds: [] }))
  }
}))

vi.mock('../../lib/actionCardSvg.js', () => ({
  preloadAllActionCardSvgs: vi.fn(() => Promise.resolve()),
  renderActionCardSvg: vi.fn(() => '<svg class="action-card-image"></svg>')
}))

// Use the real i18n module so player-name interpolation in translated strings
// (e.g. 'Give {playerName} an Action Card:') is exercised the same way users see it.

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../lib/event.js', () => ({
  fire: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}))

vi.mock('../../lib/delay.js', () => ({
  delay: vi.fn(() => Promise.resolve())
}))

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class { toString () { return '<div class="player-list-stub"></div>' } }
}))

const { SelectPlayerOverlay } = await import('../../partials/selectPlayerOverlay.js')
const { server } = await import('../../lib/gateway.js')
const { fire } = await import('../../lib/event.js')
const { toast } = await import('../../partials/toast.js')

describe('SelectPlayerOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips loading action cards when the slot is empty (fake player)', async () => {
    const fakePlayer = { fake: true, position: 'CD', in_game_position: 'CD', name: '-', level: 0 }
    const overlay = new SelectPlayerOverlay(fakePlayer, [], () => {}, () => {})
    await overlay.load()
    expect(server.getActionCards).not.toHaveBeenCalled()
    expect(overlay.template).not.toContain('selectPlayer.giveActionCard')
  })

  it('renders the give-action-card prompt and only fitness/level-up cards for a real player', async () => {
    server.getActionCards.mockResolvedValueOnce({
      actionCards: [
        { id: 1, action: 'FRESHNESS_10' },
        { id: 2, action: 'LEVEL_UP_PLAYER_40' },
        { id: 3, action: 'BONUS_100K' },
        { id: 4, action: 'STAR_PLAYER' },
        { id: 5, action: 'LEVEL_UP_PLAYER_40' }
      ]
    })
    const player = testData.player({ id: 42, name: 'Erik Müller', position: 'CD' })
    const overlay = new SelectPlayerOverlay(player, [player], () => {}, () => {})
    await overlay.load()

    expect(overlay.cards).toHaveLength(3)
    expect(overlay.cards.map(c => c.action)).toEqual(['FRESHNESS_10', 'LEVEL_UP_PLAYER_40', 'LEVEL_UP_PLAYER_40'])

    const html = overlay.template
    expect(html).toContain('Give Erik Müller an Action Card:')
    // Stack groups by type; two LEVEL_UP_PLAYER_40 cards collapse into one stack with a count badge
    expect(html).toContain('action-card-count')
    expect(html).toContain('data-action-type="FRESHNESS_10"')
    expect(html).toContain('data-action-type="LEVEL_UP_PLAYER_40"')
  })

  it('applies the action card to the current player and notifies the parent', async () => {
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const onApplied = vi.fn()
    const overlay = new SelectPlayerOverlay(player, [player], () => {}, onApplied)
    overlay.cards = [{ id: 99, action: 'FRESHNESS_20' }]
    const stackEl = document.createElement('div')
    stackEl.dataset.actionCardIdx = '0'

    await overlay._useActionCard(overlay.cards[0], 0, stackEl)

    expect(server.useActionCard).toHaveBeenCalledWith(overlay.cards[0], player, null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Hans'), 'success')
    expect(fire).toHaveBeenCalledWith('ACTION_CARDS_CHANGED', overlay._renderId)
    expect(onApplied).toHaveBeenCalled()
  })

  it('shows a placeholder line when the player has no eligible cards', async () => {
    const player = testData.player({ id: 7, name: 'Hans' })
    const overlay = new SelectPlayerOverlay(player, [player], () => {}, () => {})
    overlay.cards = []
    expect(overlay.template).toContain('No matching action cards available.')
  })

  describe('show-all toggle', () => {
    it('hides the toggle when no all-players list is provided', () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {}, () => {})
      expect(overlay.template).not.toContain('data-toggle-show-all')
    })

    it('renders the toggle when an all-players list is provided', () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const other = testData.player({ id: 2, position: 'CM' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {}, () => {}, [player, other])
      expect(overlay.template).toContain('data-toggle-show-all')
      expect(overlay.template).toContain('Show all players')
    })

    it('switches the rendered list to all players when toggled on', async () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const other = testData.player({ id: 2, position: 'CM' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {}, () => {}, [player, other])
      overlay.showAll = true
      const html = overlay.template
      // When showing all, the matching-only label flips and the warning hint appears.
      expect(html).toContain('Show only matching players')
      expect(html).toContain('outside their natural position')
    })
  })
})
