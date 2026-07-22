import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testData } from '../setup.js'

// Use the real i18n module so player-name interpolation in translated strings
// is exercised the same way users see it.

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class { toString () { return '<div class="player-list-stub"></div>' } }
}))

// The action-card section lives in its own UIElement (ActionCardGiver) now —
// stub it here and test the card behaviour in actionCardGiver.test.js.
vi.mock('../../partials/actionCardGiver.js', () => ({
  ActionCardGiver: class {
    constructor (player) {
      this.player = player
    }

    toString () { return '<div class="action-card-giver-stub"></div>' }
  }
}))

const { SelectPlayerOverlay } = await import('../../partials/selectPlayerOverlay.js')
const { ActionCardGiver } = await import('../../partials/actionCardGiver.js')

describe('SelectPlayerOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wires an ActionCardGiver for the current player', () => {
    const player = testData.player({ id: 42, name: 'Erik Müller', position: 'CD' })
    const overlay = new SelectPlayerOverlay(player, [player], () => {})
    expect(overlay._actionCardGiver).toBeInstanceOf(ActionCardGiver)
    expect(overlay._actionCardGiver.player).toBe(player)
    // The overlay embeds the giver in its template.
    expect(overlay.template).toContain('action-card-giver-stub')
  })

  describe('show-all toggle', () => {
    it('hides the toggle when no all-players list is provided', () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {})
      expect(overlay.template).not.toContain('data-toggle-show-all')
    })

    it('renders the toggle when an all-players list is provided', () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const other = testData.player({ id: 2, position: 'CM' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {}, [player, other])
      expect(overlay.template).toContain('data-toggle-show-all')
      expect(overlay.template).toContain('Show all players')
    })

    it('switches the rendered list to all players when toggled on', async () => {
      const player = testData.player({ id: 1, position: 'CD' })
      const other = testData.player({ id: 2, position: 'CM' })
      const overlay = new SelectPlayerOverlay(player, [player], () => {}, [player, other])
      overlay.showAll = true
      const html = overlay.template
      // When showing all, the matching-only label flips and the warning hint appears.
      expect(html).toContain('Show only matching players')
      expect(html).toContain('outside their natural position')
    })
  })
})
