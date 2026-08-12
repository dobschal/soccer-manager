import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/html.js', () => ({
  el: vi.fn(),
  generateId: vi.fn().mockReturnValue('test-id')
}))

vi.mock('../../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../../partials/progressBar.js', () => ({
  ProgressBar: vi.fn().mockImplementation(function (value) {
    this.value = value
    this.toString = () => `<progress data-v="${value}"></progress>`
  })
}))

vi.mock('../../../partials/positionBadge.js', () => ({
  renderPositionBadge: vi.fn((pos) => `<span class="position-badge ${pos}">${pos}</span>`)
}))

import { YouthPlayerRow } from '../../../pages/my-team/youthPlayerRow.js'
import { SERVER_EVENTS } from '../../../lib/serverEvents.js'

describe('YouthPlayerRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makePage () {
    return {
      _getTrainingModeLabel: vi.fn((mode) => `label:${mode}`),
      _handlePlayerModeChange: vi.fn(),
      _showPromoteConfirm: vi.fn(),
      _showSellConfirm: vi.fn()
    }
  }

  describe('template', () => {
    it('renders name, position, promote / sell buttons and the mode select', () => {
      const player = {
        id: 5, name: 'Zeb', position: 'CM', age: 17, level: 15, moral: 0.6, fitness: 0.4, training_mode: 'rest'
      }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template
      expect(html).toContain('Zeb')
      expect(html).toContain('position-badge CM')
      expect(html).toContain('youthTeam.promote')
      expect(html).toContain('youthTeam.sell')
      expect(html).toContain('youth-mode-inline-select')
      expect(html).toContain('data-youth-player-id="5"')
    })

    it('#524 no longer renders a fire button', () => {
      const player = {
        id: 5, name: 'Zeb', position: 'CM', age: 17, level: 15, moral: 0.6, fitness: 0.4, training_mode: 'rest'
      }
      const html = new YouthPlayerRow(player, makePage()).template
      expect(html).not.toContain('youth-row-fire-btn')
      expect(html).not.toContain('youthTeam.fire')
    })

    it('#465 renders the current training_mode as the pre-selected option', () => {
      const player = { id: 1, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'training' }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template
      expect(html).toMatch(/<option value="training"[^>]*selected/)
      expect(html).not.toMatch(/<option value="rest"[^>]*selected/)
    })

    it('renders the unassigned option as selected when training_mode is falsy', () => {
      const player = { id: 1, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: null }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template
      expect(html).toMatch(/<option value=""[^>]*selected/)
    })

    it('disables the promote button when the player is under 16', () => {
      const player = { id: 1, name: 'Kid', position: 'CM', age: 15, level: 10, moral: 0.5, fitness: 0.5, training_mode: 'rest' }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template
      expect(html).toContain('disabled')
      expect(html).toContain('youthTeam.playerTooYoung')
    })

    it('does not disable the promote button at age 16+', () => {
      const player = { id: 1, name: 'Ready', position: 'CM', age: 16, level: 10, moral: 0.5, fitness: 0.5, training_mode: 'rest' }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template
      expect(html).not.toMatch(/disabled[^>]*youth-row-promote/i)
    })

    it('produces a single <tr> as the root element (Table rowElement contract)', () => {
      const player = { id: 1, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'rest' }
      const row = new YouthPlayerRow(player, makePage())
      const html = row.template.trim()
      expect(html.startsWith('<tr')).toBe(true)
      expect(html.endsWith('</tr>')).toBe(true)
    })
  })

  describe('server events', () => {
    it('subscribes to YOUTH_PLAYER_TRAINING_MODE_CHANGED and updates itself when its player matches', () => {
      const player = { id: 5, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'rest' }
      const row = new YouthPlayerRow(player, makePage())
      row.update = vi.fn()

      const handler = row.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]
      expect(handler).toBeTypeOf('function')

      handler({ youthPlayerId: 5, previousMode: 'rest', newMode: 'training' })
      expect(player.training_mode).toBe('training')
      expect(row.update).toHaveBeenCalledTimes(1)
    })

    it('ignores events for other players', () => {
      const player = { id: 5, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'rest' }
      const row = new YouthPlayerRow(player, makePage())
      row.update = vi.fn()

      const handler = row.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]
      handler({ youthPlayerId: 99, previousMode: 'rest', newMode: 'training' })
      expect(player.training_mode).toBe('rest')
      expect(row.update).not.toHaveBeenCalled()
    })

    it('skips update when the mode is already the target (idempotent)', () => {
      const player = { id: 5, name: 'A', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'training' }
      const row = new YouthPlayerRow(player, makePage())
      row.update = vi.fn()

      const handler = row.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]
      handler({ youthPlayerId: 5, previousMode: 'training', newMode: 'training' })
      expect(row.update).not.toHaveBeenCalled()
    })

    it('re-renders the select even when a sibling handler already mutated the shared player object (freed-slot select stayed stale)', () => {
      // Reproduces the bug: assigning a player to a full mode from the list
      // frees the last occupant. The page-level handler for the same server
      // event shares this player object and mounts first, so it flips
      // `training_mode` to the new value BEFORE the row's own handler runs. An
      // object-based guard would then see "nothing changed" and skip the
      // re-render, leaving the freed player's `<select>` showing the old mode.
      const player = { id: 7, name: 'Bravo', position: 'CM', age: 17, level: 15, moral: 0.5, fitness: 0.5, training_mode: 'training' }
      const row = new YouthPlayerRow(player, makePage())
      row.update = vi.fn()

      const handler = row.serverEvents[SERVER_EVENTS.YOUTH_PLAYER_TRAINING_MODE_CHANGED.name]

      // Page-level handler runs first on the shared object and empties the slot.
      player.training_mode = null

      handler({ youthPlayerId: 7, previousMode: 'training', newMode: null })

      expect(row.update).toHaveBeenCalledTimes(1)
    })
  })
})
