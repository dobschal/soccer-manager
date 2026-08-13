import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player, season) => 18 + season - player.birth_season),
  getSalary: vi.fn((level) => Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))),
  calculateMarketValue: vi.fn((level, age) => {
    let price = 40_000_000
    for (let a = 22; a < age; a++) price *= 0.85
    for (let l = 100; l > level; l--) price *= 0.9330329915368074
    return Math.floor(price)
  }),
  willRetireNextSeason: vi.fn((player, season) => player.carrier_end_season <= season)
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: { format: vi.fn((val) => `€${val}`) }
}))

vi.mock('../../partials/levelBadge.js', () => ({
  renderLevelBadge: vi.fn((level) => {
    const tier = level > 70 ? 'gold' : level > 40 ? 'silver' : 'bronze'
    return `<span class="level-badge level-badge--sm level-badge--${tier}">${level}</span>`
  })
}))

import { PlayerListItem } from '../../partials/playerListItem.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'

describe('PlayerListItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('template rendering', () => {
    it('renders player name and position', () => {
      const player = testData.player({ name: 'John Doe', position: 'CM' })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).toContain('John Doe')
      expect(html).toContain('CM')
    })

    it('shows player level with badge', () => {
      const player = testData.player({ level: 70 })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).toContain('level-badge--silver')
      expect(html).toContain('>70<')
    })

    it('shows sell offer indicator when player has offer', () => {
      const player = testData.player({ id: 5 })
      const sellOfferPlayerIds = new Set([5])
      const item = new PlayerListItem(player, 1, sellOfferPlayerIds)

      const html = item.template
      expect(html).toContain('💰')
    })

    it('does not show sell offer indicator when no offer', () => {
      const player = testData.player({ id: 5 })
      const sellOfferPlayerIds = new Set([99])
      const item = new PlayerListItem(player, 1, sellOfferPlayerIds)

      const html = item.template
      expect(html).not.toContain('💰')
    })

    it('shows suspended indicator for suspended player', () => {
      const player = testData.player({ is_suspended: true })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).toContain('🚫')
      expect(html).toContain('table-danger')
    })

    it('shows table-info class for players in lineup', () => {
      const player = testData.player({ in_game_position: 'CM', is_suspended: false })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).toContain('table-info')
    })

    it('shows table-warning class for bench players', () => {
      const player = testData.player({ in_game_position: '', is_suspended: false, bench_position: 'BENCH_MID' })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).toContain('table-warning')
    })

    it('shows no row class for players not in lineup and not on bench', () => {
      const player = testData.player({ in_game_position: '', is_suspended: false, bench_position: null })
      const item = new PlayerListItem(player, 1)

      const html = item.template
      expect(html).not.toContain('table-warning')
      expect(html).not.toContain('table-info')
      expect(html).not.toContain('table-danger')
    })
  })

  describe('cells', () => {
    it('returns one entry per visible column', () => {
      const player = testData.player({ name: 'John Doe', position: 'CM' })
      const item = new PlayerListItem(player, 1)

      const cells = item.cells
      // Name, Pos, Fit, Lvl, Age, Salary, Value, Goals, Games
      expect(cells).toHaveLength(9)
      expect(cells[0]).toContain('John Doe')
      expect(cells[1]).toContain('CM')
    })

    it('inlines the progress-bar HTML for the fitness cell so a row re-render does not briefly show an empty placeholder', () => {
      const player = testData.player({ freshness: 0.9 })
      const item = new PlayerListItem(player, 1)

      // Rendered synchronously (no <template id=...> placeholder), because the
      // PLAYER_UPDATED handler drives a full row re-render — a placeholder here
      // would cause a one-frame flicker in the Fit cell.
      expect(item.cells[2]).not.toContain('<template id=')
      expect(item.cells[2]).toContain('class="progress progress--custom"')
      expect(item.cells[2]).toContain('90%')
    })
  })

  describe('rowClass', () => {
    it('returns table-danger for injured players', () => {
      const player = testData.player({ is_injured: true })
      expect(new PlayerListItem(player, 1).rowClass).toBe('table-danger')
    })

    it('returns table-info for lineup players', () => {
      const player = testData.player({ in_game_position: 'CM', is_suspended: false, is_injured: false })
      expect(new PlayerListItem(player, 1).rowClass).toBe('table-info')
    })

    it('returns empty string for benched-off players', () => {
      const player = testData.player({ in_game_position: '', is_suspended: false, is_injured: false, bench_position: null })
      expect(new PlayerListItem(player, 1).rowClass).toBe('')
    })
  })

  describe('position cell', () => {
    it('shows the natural position when the player is not in the lineup', () => {
      const player = testData.player({ position: 'CD', in_game_position: '' })
      const cells = new PlayerListItem(player, 1).cells
      expect(cells[1]).toContain('>CD<')
      expect(cells[1]).not.toContain('is-wrong-position')
    })

    it('shows the natural position when the player is in their matching slot', () => {
      const player = testData.player({ position: 'CD', in_game_position: 'CD' })
      const cells = new PlayerListItem(player, 1).cells
      expect(cells[1]).toContain('>CD<')
      expect(cells[1]).not.toContain('is-wrong-position')
    })

    it('shows the in_game_position with a wrong-position ring when fielded out of position', () => {
      const player = testData.player({ position: 'CD', in_game_position: 'OM' })
      const cells = new PlayerListItem(player, 1).cells
      expect(cells[1]).toContain('>OM<')
      expect(cells[1]).toContain('is-wrong-position')
    })

    it('also shows the natural position as a dimmed hint when fielded out of position', () => {
      const player = testData.player({ position: 'CD', in_game_position: 'OM' })
      const cells = new PlayerListItem(player, 1).cells
      expect(cells[1]).toContain('>CD<')
      expect(cells[1]).toContain('is-dimmed')
      // The dimmed hint must NOT carry the red-ring class.
      const dimmedBadge = cells[1].slice(cells[1].indexOf('is-dimmed'))
      expect(dimmedBadge).not.toContain('is-wrong-position')
    })

    it('does not render the dimmed hint when player is in their natural slot', () => {
      const player = testData.player({ position: 'CM', in_game_position: 'CM' })
      const cells = new PlayerListItem(player, 1).cells
      expect(cells[1]).not.toContain('is-dimmed')
    })
  })

  describe('cards display', () => {
    it('shows yellow cards count', () => {
      const player = testData.player({ yellow_cards: 3, red_cards: 0 })
      const item = new PlayerListItem(player, 1)

      const html = item._renderCards(3, 0)
      expect(html).toContain('card-badge--yellow') // Yellow card CSS class
      expect(html).toContain('3')
      expect(html).toContain('3 yellow card(s)')
    })

    it('shows red card indicator', () => {
      const player = testData.player({ yellow_cards: 0, red_cards: 1 })
      const item = new PlayerListItem(player, 1)

      const html = item._renderCards(0, 1)
      expect(html).toContain('card-badge--red') // Red card CSS class
      expect(html).toContain('Red card')
    })

    it('shows both yellow and red cards', () => {
      const player = testData.player({ yellow_cards: 2, red_cards: 1 })
      const item = new PlayerListItem(player, 1)

      const html = item._renderCards(2, 1)
      expect(html).toContain('card-badge--yellow')
      expect(html).toContain('card-badge--red')
    })

    it('shows empty string when no cards', () => {
      const player = testData.player({ yellow_cards: 0, red_cards: 0 })
      const item = new PlayerListItem(player, 1)

      const html = item._renderCards(0, 0)
      expect(html).toBe('')
    })
  })

  describe('NEW_SELL_TRADE_OFFER server event', () => {
    it('updates only when the event payload matches the row\'s player id', () => {
      const player = testData.player({ id: 42 })
      const sellOfferPlayerIds = new Set()
      const item = new PlayerListItem(player, 1, sellOfferPlayerIds)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.NEW_SELL_TRADE_OFFER.name]

      // A different player's event must be ignored — no update, no set mutation.
      handler({ playerId: 999 })
      expect(updateSpy).not.toHaveBeenCalled()
      expect(sellOfferPlayerIds.has(42)).toBe(false)

      // Own-player event: mutates the shared set and calls update() (non-reload,
      // because we already know the row now has an offer).
      handler({ playerId: 42 })
      expect(sellOfferPlayerIds.has(42)).toBe(true)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores payloads without a playerId', () => {
      const player = testData.player({ id: 42 })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.NEW_SELL_TRADE_OFFER.name]
      handler(null)
      handler({})
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('REMOVE_SELL_TRADE_OFFER server event', () => {
    it('drops the row\'s player from the shared set and re-renders on match', () => {
      const player = testData.player({ id: 42 })
      const sellOfferPlayerIds = new Set([42, 99])
      const item = new PlayerListItem(player, 1, sellOfferPlayerIds)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.REMOVE_SELL_TRADE_OFFER.name]

      // Event for a different player — no-op.
      handler({ playerId: 99 })
      expect(updateSpy).not.toHaveBeenCalled()
      expect(sellOfferPlayerIds.has(42)).toBe(true)

      // Own-player event — icon must disappear.
      handler({ playerId: 42 })
      expect(sellOfferPlayerIds.has(42)).toBe(false)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('does not re-render when the player never had a sell offer', () => {
      const player = testData.player({ id: 42 })
      const sellOfferPlayerIds = new Set() // no offer currently tracked
      const item = new PlayerListItem(player, 1, sellOfferPlayerIds)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.REMOVE_SELL_TRADE_OFFER.name]
      handler({ playerId: 42 })
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('ignores payloads without a playerId', () => {
      const player = testData.player({ id: 42 })
      const item = new PlayerListItem(player, 1, new Set([42]))
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.REMOVE_SELL_TRADE_OFFER.name]
      handler(null)
      handler({})
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('CAPTAIN_CHANGED server event', () => {
    it('re-renders the outgoing captain\'s row so the (C) marker disappears', () => {
      const player = testData.player({ id: 42 })
      // This row is the current captain.
      const item = new PlayerListItem(player, 1, new Set(), 42)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]
      handler({ captainId: 99 })

      expect(item.captainId).toBe(99)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('re-renders the incoming captain\'s row so the (C) marker appears', () => {
      const player = testData.player({ id: 42 })
      // Row currently not captain — captainId is someone else.
      const item = new PlayerListItem(player, 1, new Set(), 99)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]
      handler({ captainId: 42 })

      expect(item.captainId).toBe(42)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for uninvolved rows (captain swap between two other players)', () => {
      const player = testData.player({ id: 42 })
      const item = new PlayerListItem(player, 1, new Set(), 99)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]
      handler({ captainId: 100 }) // neither the old nor new captain is me

      // captainId still tracked so a subsequent template render is consistent,
      // but no re-render for this row.
      expect(item.captainId).toBe(100)
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('handles captain being cleared (captainId: null)', () => {
      const player = testData.player({ id: 42 })
      const item = new PlayerListItem(player, 1, new Set(), 42)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      const handler = item.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]
      handler({ captainId: null })

      expect(item.captainId).toBeNull()
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('BENCH_CHANGED server event', () => {
    it('updates the incoming bench player row (bench_position + vacated lineup)', () => {
      const player = testData.player({ id: 42, in_game_position: 'CM', bench_position: null })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42 }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(item.player.bench_position).toBe('BENCH_MID')
      expect(item.player.in_game_position).toBe('')
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('clears bench_position on the displaced player row', () => {
      const player = testData.player({ id: 55, bench_position: 'BENCH_MID' })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42 }),
        displacedPlayerId: 55,
        vacatedLineupPosition: null
      })

      expect(item.player.bench_position).toBeNull()
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for uninvolved rows', () => {
      const player = testData.player({ id: 100 })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42 }),
        displacedPlayerId: 55,
        vacatedLineupPosition: 'CM'
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('LINEUP_PLAYER_CHANGED server event', () => {
    it('sets in_game_position and clears bench_position when this player moved into the lineup', () => {
      const player = testData.player({ id: 42, in_game_position: '', bench_position: 'BENCH_MID' })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 42 }) },
        ejectedPlayerId: null,
        emptiedSlot: null,
        freedBenchPosition: 'BENCH_MID'
      })

      expect(item.player.in_game_position).toBe('CM')
      expect(item.player.bench_position).toBeNull()
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('clears in_game_position when this player was ejected from the lineup', () => {
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 99 }) },
        ejectedPlayerId: 42,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(item.player.in_game_position).toBe('')
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for uninvolved rows', () => {
      const player = testData.player({ id: 42 })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 99 }) },
        ejectedPlayerId: null,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('PLAYER_UPDATED server event (action-card stat changes)', () => {
    it('patches level/freshness and re-renders the row when the event targets this player', () => {
      const player = testData.player({ id: 42, level: 50, freshness: 0.2 })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 42, level: 51, freshness: 1.0 })
      })

      expect(item.player.level).toBe(51)
      expect(item.player.freshness).toBe(1.0)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for other rows', () => {
      const player = testData.player({ id: 42, level: 50 })
      const item = new PlayerListItem(player, 1)
      const updateSpy = vi.spyOn(item, 'update').mockImplementation(() => {})

      item.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 99, level: 80 })
      })

      expect(item.player.level).toBe(50)
      expect(updateSpy).not.toHaveBeenCalled()
    })
  })
})
