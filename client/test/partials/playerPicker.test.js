import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve('<div class="player-image"></div>'))
}))

const { PlayerPicker } = await import('../../partials/playerPicker.js')

/**
 * @param {object} overrides
 * @returns {object}
 */
function player (overrides) {
  return testData.player(overrides)
}

describe('PlayerPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sorting', () => {
    it('lists players of the matching position before the others', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CM', level: 90 }),
        player({ id: 2, position: 'CD', level: 30 }),
        player({ id: 3, position: 'CM', level: 20 }),
        player({ id: 4, position: 'CD', level: 80 })
      ], 'CD', testData.team(), () => {})
      expect(picker.sortedPlayers().map(p => p.id)).toEqual([4, 2, 1, 3])
    })

    it('sorts each group by the level the player would actually play at', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', level: 40 }),
        player({ id: 2, position: 'CD', level: 70 }),
        // A goalkeeper carries the harshest malus, so a lower-level field
        // player of another line still ranks above him.
        player({ id: 3, position: 'GK', level: 95 }),
        player({ id: 4, position: 'CM', level: 70 })
      ], 'CD', testData.team(), () => {})
      expect(picker.sortedPlayers().map(p => p.id)).toEqual([2, 1, 4, 3])
    })
  })

  describe('template', () => {
    it('dims out-of-position players and spells out their malus', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', level: 50 }),
        player({ id: 2, position: 'CM', level: 50 })
      ], 'CD', testData.team(), () => {})
      document.body.innerHTML = `<div>${picker.template}</div>`
      const matchingCard = document.querySelector('.player-picker__card[data-player-id="1"]')
      const otherCard = document.querySelector('.player-picker__card[data-player-id="2"]')
      expect(matchingCard.classList.contains('is-out-of-position')).toBe(false)
      expect(matchingCard.querySelector('.player-picker__penalty')).toBeNull()
      expect(otherCard.classList.contains('is-out-of-position')).toBe(true)
      // MID → DEF costs 20% of the level.
      expect(otherCard.querySelector('.player-picker__penalty').textContent).toBe('-20%')
    })

    it('renders one card per player inside a horizontal track', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD' }),
        player({ id: 2, position: 'CD' })
      ], 'CD', testData.team(), () => {})
      const html = picker.template
      expect(html).toContain('player-picker__track')
      expect(html.match(/player-picker__card/g)).toHaveLength(2)
    })

    it('separates the out-of-position group with a gap on its first card', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', level: 50 }),
        player({ id: 2, position: 'CD', level: 40 }),
        player({ id: 3, position: 'CM', level: 60 }),
        player({ id: 4, position: 'CM', level: 30 })
      ], 'CD', testData.team(), () => {})
      document.body.innerHTML = `<div>${picker.template}</div>`
      const groupStarts = [...document.querySelectorAll('.player-picker__card.is-group-start')]
      expect(groupStarts.map(cardEl => cardEl.dataset.playerId)).toEqual(['3'])
    })

    it('needs no gap when nobody matches the slot', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CM', level: 50 }),
        player({ id: 2, position: 'CM', level: 40 })
      ], 'CD', testData.team(), () => {})
      document.body.innerHTML = `<div>${picker.template}</div>`
      expect(document.querySelector('.is-group-start')).toBeNull()
    })

    it('highlights the player currently in the slot and never dims him', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', level: 50 }),
        // The current occupant is himself fielded out of position.
        player({ id: 2, position: 'CM', level: 60 })
      ], 'CD', testData.team(), () => {}, 2)
      document.body.innerHTML = `<div>${picker.template}</div>`
      const currentCard = document.querySelector('.player-picker__card[data-player-id="2"]')
      expect(currentCard.classList.contains('is-current')).toBe(true)
      expect(document.querySelector('.player-picker__card[data-player-id="1"]').classList.contains('is-current')).toBe(false)
    })

    it('marks players who already hold a slot in the lineup', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', in_game_position: 'LD' }),
        // On the bench — no slot, so no highlight.
        player({ id: 2, position: 'CD', in_game_position: '' })
      ], 'CD', testData.team(), () => {})
      document.body.innerHTML = `<div>${picker.template}</div>`
      expect(document.querySelector('.player-picker__card[data-player-id="1"]').classList.contains('is-in-lineup')).toBe(true)
      expect(document.querySelector('.player-picker__card[data-player-id="2"]').classList.contains('is-in-lineup')).toBe(false)
    })

    it('marks star players', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', is_star_player: true })
      ], 'CD', testData.team(), () => {})
      expect(picker.template).toContain('is-star')
    })

    it('shows the freshness percentage colour-coded', () => {
      const picker = new PlayerPicker([
        player({ id: 1, position: 'CD', freshness: 0.45 })
      ], 'CD', testData.team(), () => {})
      const html = picker.template
      expect(html).toContain('freshness-orange')
      expect(html).toContain('45%')
    })

    it('renders an empty state when there is nobody to pick', () => {
      const picker = new PlayerPicker([], 'CD', testData.team(), () => {})
      expect(picker.template).toContain('player-picker--empty')
      expect(picker.template).not.toContain('player-picker__card')
    })
  })

  describe('selection', () => {
    it('calls back with the clicked player', () => {
      const onPlayerSelected = vi.fn()
      const players = [
        player({ id: 7, position: 'CD' }),
        player({ id: 8, position: 'CM' })
      ]
      const picker = new PlayerPicker(players, 'CD', testData.team(), onPlayerSelected)
      document.body.innerHTML = `<div>${picker.template}</div>`
      const cardEl = document.querySelector('.player-picker__card[data-player-id="8"]')
      // The handler is delegated on the strip: simulate the click target the
      // browser would hand it.
      picker.events['.player-picker'].click({ target: cardEl })
      expect(onPlayerSelected).toHaveBeenCalledWith(players[1])
    })

    it('ignores clicks that miss a card', () => {
      const onPlayerSelected = vi.fn()
      const picker = new PlayerPicker([player({ id: 7, position: 'CD' })], 'CD', testData.team(), onPlayerSelected)
      document.body.innerHTML = `<div>${picker.template}</div>`
      const trackEl = document.querySelector('.player-picker__track')
      picker.events['.player-picker'].click({ target: trackEl })
      expect(onPlayerSelected).not.toHaveBeenCalled()
    })
  })
})
