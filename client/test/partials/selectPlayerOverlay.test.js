import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testData } from '../setup.js'

// Use the real i18n module so player-name interpolation in translated strings
// is exercised the same way users see it.

vi.mock('../../partials/playerPicker.js', () => ({
  PlayerPicker: class {
    constructor (players, slot, team, onPlayerSelected, currentPlayerId) {
      this.players = players
      this.slot = slot
      this.team = team
      this.onPlayerSelected = onPlayerSelected
      this.currentPlayerId = currentPlayerId
    }

    toString () { return '<div class="player-picker-stub"></div>' }
  }
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

  it('renders the player strip instead of a table', () => {
    const player = testData.player({ id: 1, position: 'CD', in_game_position: 'CD' })
    const overlay = new SelectPlayerOverlay(player, [player], () => {})
    expect(overlay.template).toContain('player-picker-stub')
  })

  describe('selectable players', () => {
    it('hands the strip the slot and the team of the clicked tile', () => {
      const current = testData.player({ id: 1, position: 'CM', in_game_position: 'CD' })
      const team = testData.team()
      const overlay = new SelectPlayerOverlay(current, [], () => {}, [], team)
      void overlay.template
      expect(overlay._playerPicker.slot).toBe('CD')
      expect(overlay._playerPicker.team).toBe(team)
    })

    it('merges matching and all players into one deduplicated list', () => {
      const current = testData.player({ id: 1, position: 'CD', in_game_position: 'CD' })
      const matching = testData.player({ id: 2, position: 'CD' })
      const other = testData.player({ id: 3, position: 'CM' })
      const overlay = new SelectPlayerOverlay(current, [matching], () => {}, [matching, other])
      expect(overlay._selectablePlayers().map(p => p.id)).toEqual([1, 2, 3])
    })

    it('includes the current occupant even when he is fielded out of position', () => {
      // Neither list from Lineup carries him: availablePlayers filters on the
      // slot's position, allPlayers excludes the clicked tile's player.
      const current = testData.player({ id: 1, position: 'CM', in_game_position: 'CD' })
      const matching = testData.player({ id: 2, position: 'CD' })
      const overlay = new SelectPlayerOverlay(current, [matching], () => {}, [matching])
      void overlay.template
      expect(overlay._selectablePlayers().map(p => p.id)).toEqual([1, 2])
      expect(overlay._playerPicker.currentPlayerId).toBe(1)
    })

    it('drops fake placeholders', () => {
      const current = testData.player({ id: 1, position: 'CD', in_game_position: 'CD' })
      const fake = { fake: true, position: 'CD', in_game_position: 'CD', level: 0, name: '-' }
      const other = testData.player({ id: 2, position: 'CD' })
      const overlay = new SelectPlayerOverlay(current, [current, other, fake], () => {})
      expect(overlay._selectablePlayers().map(p => p.id)).toEqual([1, 2])
    })

    it('has no current player to highlight for an empty slot', () => {
      const fakeCurrent = { fake: true, position: 'CD', in_game_position: 'CD', level: 0, name: '-' }
      const matching = testData.player({ id: 2, position: 'CD' })
      const overlay = new SelectPlayerOverlay(fakeCurrent, [matching], () => {}, [matching])
      void overlay.template
      expect(overlay._selectablePlayers().map(p => p.id)).toEqual([2])
      expect(overlay._playerPicker.currentPlayerId).toBeNull()
    })
  })
})
