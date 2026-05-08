import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player, season) => 18 + season - player.birth_season),
  getSalary: vi.fn((level) => Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99))),
  calculateMarketValue: vi.fn((level, age) => {
    let price = 40_000_000
    for (let a = 22; a < age; a++) price *= 0.75
    for (let l = 100; l > level; l--) price *= 0.9330329915368074
    return Math.floor(price)
  }),
  willRetireNextSeason: vi.fn((player, season) => player.carrier_end_season <= season + 1)
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
      // Name, Pos, Age, Fit, Lvl, Salary, Value, Goals, Games
      expect(cells).toHaveLength(9)
      expect(cells[0]).toContain('John Doe')
      expect(cells[1]).toContain('CM')
    })

    it('includes ProgressBar placeholder for fitness cell', () => {
      const player = testData.player({ freshness: 0.9 })
      const item = new PlayerListItem(player, 1)

      // ProgressBar is a UIElement, rendered as a <template> placeholder
      expect(item.cells[3]).toContain('<template id=')
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
})
