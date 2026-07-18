import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getActionCards: vi.fn(() => Promise.resolve({ actionCards: [] })),
    useActionCard: vi.fn(() => Promise.resolve({ success: true }))
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

const { ActionCardGiver } = await import('../../partials/actionCardGiver.js')
const { server } = await import('../../lib/gateway.js')
const { fire } = await import('../../lib/event.js')
const { toast } = await import('../../partials/toast.js')

describe('ActionCardGiver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips loading action cards when given a fake player', async () => {
    const fakePlayer = { fake: true, name: '-', level: 0 }
    const giver = new ActionCardGiver(fakePlayer)
    await giver.load()
    expect(server.getActionCards).not.toHaveBeenCalled()
    expect(giver.template).not.toContain('selectPlayer.giveActionCard')
    expect(giver.template).toContain('action-card-giver')
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
    const giver = new ActionCardGiver(player)
    await giver.load()

    expect(giver.cards).toHaveLength(3)
    expect(giver.cards.map(c => c.action)).toEqual(['FRESHNESS_10', 'LEVEL_UP_PLAYER_40', 'LEVEL_UP_PLAYER_40'])

    const html = giver.template
    expect(html).toContain('Give Erik Müller an Action Card:')
    // Stack groups by type; two LEVEL_UP_PLAYER_40 cards collapse into one stack with a count badge
    expect(html).toContain('action-card-count')
    expect(html).toContain('data-action-type="FRESHNESS_10"')
    expect(html).toContain('data-action-type="LEVEL_UP_PLAYER_40"')
  })

  it('applies the action card to the player and consumes the card locally', async () => {
    // No parent callback anymore — downstream consumers (list rows, pitch
    // tiles, open modal) react to the PLAYER_UPDATED server event that the
    // helper emits after the DB update. The giver only needs to drop the
    // consumed card from its own list so the stack count updates.
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const giver = new ActionCardGiver(player)
    giver.cards = [{ id: 99, action: 'FRESHNESS_20' }]
    const stackEl = document.createElement('div')
    stackEl.dataset.actionCardIdx = '0'

    const usedCard = giver.cards[0]
    await giver._useActionCard(usedCard, 0, stackEl)

    expect(server.useActionCard).toHaveBeenCalledWith(usedCard, player, null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Hans'), 'success')
    expect(fire).toHaveBeenCalledWith('ACTION_CARDS_CHANGED', giver._renderId)
    expect(giver.cards).toHaveLength(0)
  })

  it('shows a placeholder line when the player has no eligible cards', async () => {
    const player = testData.player({ id: 7, name: 'Hans' })
    const giver = new ActionCardGiver(player)
    giver.cards = []
    expect(giver.template).toContain('No matching action cards available.')
  })
})
