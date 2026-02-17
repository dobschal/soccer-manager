import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

// Mock dependencies
vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player, season) => 18 + season - player.birth_season),
  getSalary: vi.fn((level) => Math.floor(150 * Math.pow(10308 / 150, (level - 1) / 99)))
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
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('John Doe')
      expect(html).toContain('CM')
    })

    it('shows player level with badge', () => {
      const player = testData.player({ level: 70 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('level-badge--silver')
      expect(html).toContain('>70<')
    })

    it('shows sell offer indicator when player has offer', () => {
      const player = testData.player({ id: 5 })
      const sellOfferPlayerIds = new Set([5])
      const item = new PlayerListItem(player, 1, vi.fn(), sellOfferPlayerIds)

      const html = item.template
      expect(html).toContain('💰')
    })

    it('does not show sell offer indicator when no offer', () => {
      const player = testData.player({ id: 5 })
      const sellOfferPlayerIds = new Set([99])
      const item = new PlayerListItem(player, 1, vi.fn(), sellOfferPlayerIds)

      const html = item.template
      expect(html).not.toContain('💰')
    })

    it('shows suspended indicator for suspended player', () => {
      const player = testData.player({ is_suspended: true })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('🚫')
      expect(html).toContain('table-danger')
    })

    it('shows table-info class for players in lineup', () => {
      const player = testData.player({ in_game_position: 'CM', is_suspended: false })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('table-info')
    })

    it('shows table-warning class for players not in lineup', () => {
      const player = testData.player({ in_game_position: '', is_suspended: false })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('table-warning')
    })
  })

  describe('freshness display', () => {
    it('shows text-success for high freshness', () => {
      const player = testData.player({ freshness: 0.9 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('text-success')
      expect(html).toContain('90%')
    })

    it('shows text-warning for medium freshness', () => {
      const player = testData.player({ freshness: 0.5 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('text-warning')
      expect(html).toContain('50%')
    })

    it('shows text-danger for low freshness', () => {
      const player = testData.player({ freshness: 0.3 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item.template
      expect(html).toContain('text-danger')
      expect(html).toContain('30%')
    })
  })

  describe('cards display', () => {
    it('shows yellow cards count', () => {
      const player = testData.player({ yellow_cards: 3, red_cards: 0 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item._renderCards(3, 0)
      expect(html).toContain('card-badge--yellow') // Yellow card CSS class
      expect(html).toContain('3')
      expect(html).toContain('3 yellow card(s)')
    })

    it('shows red card indicator', () => {
      const player = testData.player({ yellow_cards: 0, red_cards: 1 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item._renderCards(0, 1)
      expect(html).toContain('card-badge--red') // Red card CSS class
      expect(html).toContain('Red card')
    })

    it('shows both yellow and red cards', () => {
      const player = testData.player({ yellow_cards: 2, red_cards: 1 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item._renderCards(2, 1)
      expect(html).toContain('card-badge--yellow')
      expect(html).toContain('card-badge--red')
    })

    it('shows empty string when no cards', () => {
      const player = testData.player({ yellow_cards: 0, red_cards: 0 })
      const item = new PlayerListItem(player, 1, vi.fn())

      const html = item._renderCards(0, 0)
      expect(html).toBe('')
    })
  })

  describe('click handler', () => {
    it('calls click handler with player', () => {
      const player = testData.player({ id: 42 })
      const clickHandler = vi.fn()
      const item = new PlayerListItem(player, 1, clickHandler)

      item.onClickHandler()

      expect(clickHandler).toHaveBeenCalledWith(player)
    })
  })

  describe('events', () => {
    it('registers click event on root element', () => {
      const player = testData.player()
      const clickHandler = vi.fn()
      const item = new PlayerListItem(player, 1, clickHandler)

      const events = item.events
      expect(events['']).toBeDefined()
      expect(events[''].click).toBeDefined()
    })
  })
})
