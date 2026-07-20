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

vi.mock('../../lib/delay.js', () => ({
  delay: vi.fn(() => Promise.resolve())
}))

const { ActionCardGiver } = await import('../../partials/actionCardGiver.js')
const { server } = await import('../../lib/gateway.js')
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
    // tiles, open modal) react to the PLAYER_UPDATED server event, and the
    // dashboard ActionCards view refetches off ACTION_CARDS_CHANGED — both
    // emitted by useActionCard on the server. The giver only needs to drop
    // the consumed card from its own list so the stack count updates.
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const giver = new ActionCardGiver(player)
    giver.cards = [{ id: 99, action: 'FRESHNESS_20' }]
    const stackEl = document.createElement('div')
    stackEl.dataset.actionCardIdx = '0'

    const usedCard = giver.cards[0]
    await giver._useActionCard(usedCard, 0, stackEl)

    expect(server.useActionCard).toHaveBeenCalledWith(usedCard, player, null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Hans'), 'success')
    expect(giver.cards).toHaveLength(0)
  })

  it('animates only the affected stack when other cards of the same type remain (peer stacks untouched)', async () => {
    // Mount a fake DOM that matches the shape `_renderGroupedCards` builds:
    // one FRESHNESS_10 stack with 3 wrappers + count badge, and one peer
    // LEVEL_UP_PLAYER_40 stack. After using one FRESHNESS_10 card the peer
    // stack must not be touched, and the remaining two wrappers must slide
    // one slot forward via their --stack-index.
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const giver = new ActionCardGiver(player)
    giver.cards = [
      { id: 1, action: 'FRESHNESS_10' },
      { id: 2, action: 'FRESHNESS_10' },
      { id: 3, action: 'FRESHNESS_10' },
      { id: 4, action: 'LEVEL_UP_PLAYER_40' }
    ]
    const root = document.createElement('div')
    root.dataset.render_id = giver._renderId
    root.classList.add('action-card-giver')
    root.innerHTML = `
      <div class="action-card-stack" data-action-card-idx="0" data-action-type="FRESHNESS_10">
        <div class="action-card-wrapper" style="--stack-index: 0;"></div>
        <div class="action-card-wrapper" style="--stack-index: 1;"></div>
        <div class="action-card-wrapper" style="--stack-index: 2;"></div>
        <span class="action-card-count">3</span>
      </div>
      <div class="action-card-stack" data-action-card-idx="3" data-action-type="LEVEL_UP_PLAYER_40">
        <div class="action-card-wrapper" style="--stack-index: 0;"></div>
      </div>
    `
    document.body.innerHTML = ''
    document.body.appendChild(root)
    const freshnessStack = root.querySelector('[data-action-type="FRESHNESS_10"]')
    const levelStack = root.querySelector('[data-action-type="LEVEL_UP_PLAYER_40"]')
    const peerWrapper = levelStack.querySelector('.action-card-wrapper')

    await giver._useActionCard(giver.cards[0], 0, freshnessStack)

    // Consumed wrapper is gone; the other two slid one slot forward.
    const remaining = freshnessStack.querySelectorAll('.action-card-wrapper')
    expect(remaining).toHaveLength(2)
    expect(remaining[0].style.getPropertyValue('--stack-index')).toBe('0')
    expect(remaining[1].style.getPropertyValue('--stack-index')).toBe('1')
    // Count badge dropped from 3 → 2.
    expect(freshnessStack.querySelector('.action-card-count').textContent).toBe('2')
    // The peer stack's wrapper wasn't re-created, only its click-target index
    // was rewritten (3 → 2 after the splice).
    expect(levelStack.querySelector('.action-card-wrapper')).toBe(peerWrapper)
    expect(levelStack.dataset.actionCardIdx).toBe('2')
  })

  it('drops the count badge and keeps the surviving wrapper when the stack shrinks to a single card', async () => {
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const giver = new ActionCardGiver(player)
    giver.cards = [
      { id: 1, action: 'FRESHNESS_10' },
      { id: 2, action: 'FRESHNESS_10' }
    ]
    const root = document.createElement('div')
    root.dataset.render_id = giver._renderId
    root.classList.add('action-card-giver')
    root.innerHTML = `
      <div class="action-card-stack" data-action-card-idx="0" data-action-type="FRESHNESS_10">
        <div class="action-card-wrapper" style="--stack-index: 0;"></div>
        <div class="action-card-wrapper" style="--stack-index: 1;"></div>
        <span class="action-card-count">2</span>
      </div>
    `
    document.body.innerHTML = ''
    document.body.appendChild(root)
    const freshnessStack = root.querySelector('[data-action-type="FRESHNESS_10"]')

    await giver._useActionCard(giver.cards[0], 0, freshnessStack)

    expect(freshnessStack.querySelectorAll('.action-card-wrapper')).toHaveLength(1)
    expect(freshnessStack.querySelector('.action-card-count')).toBeNull()
  })

  it('falls back to a full refresh when the last card of a type is used so peer stacks reflow', async () => {
    const player = testData.player({ id: 7, name: 'Hans', position: 'GK' })
    const giver = new ActionCardGiver(player)
    giver.cards = [
      { id: 1, action: 'FRESHNESS_10' },
      { id: 2, action: 'LEVEL_UP_PLAYER_40' }
    ]
    const root = document.createElement('div')
    root.dataset.render_id = giver._renderId
    root.classList.add('action-card-giver')
    root.innerHTML = `
      <div class="action-card-stack" data-action-card-idx="0" data-action-type="FRESHNESS_10">
        <div class="action-card-wrapper" style="--stack-index: 0;"></div>
      </div>
      <div class="action-card-stack" data-action-card-idx="1" data-action-type="LEVEL_UP_PLAYER_40">
        <div class="action-card-wrapper" style="--stack-index: 0;"></div>
      </div>
    `
    document.body.innerHTML = ''
    document.body.appendChild(root)
    const freshnessStack = root.querySelector('[data-action-type="FRESHNESS_10"]')

    await giver._useActionCard(giver.cards[0], 0, freshnessStack)

    // Full re-render kicks in: the emptied FRESHNESS_10 stack is gone, and
    // the surviving LEVEL_UP_PLAYER_40 stack's click target is back at 0.
    expect(root.querySelector('[data-action-type="FRESHNESS_10"]')).toBeNull()
    const surviving = root.querySelector('[data-action-type="LEVEL_UP_PLAYER_40"]')
    expect(surviving).not.toBeNull()
    expect(surviving.dataset.actionCardIdx).toBe('0')
  })

  it('shows a placeholder line when the player has no eligible cards', async () => {
    const player = testData.player({ id: 7, name: 'Hans' })
    const giver = new ActionCardGiver(player)
    giver.cards = []
    expect(giver.template).toContain('No matching action cards available.')
  })
})
