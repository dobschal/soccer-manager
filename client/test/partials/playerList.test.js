import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    getCurrentGameday: vi.fn(),
    getMySellOfferPlayerIds: vi.fn(),
    getTeamSellOfferPlayerIds: vi.fn()
  },
  showServerError: vi.fn()
}))

vi.mock('../../i18n/index.js', () => ({
  t: vi.fn((key) => key)
}))

vi.mock('../../partials/levelBadge.js', () => ({
  renderLevelBadge: vi.fn((level) => `<span class="level-badge">${level}</span>`)
}))

vi.mock('../../partials/positionBadge.js', () => ({
  renderPositionBadge: vi.fn((position) => `<span class="position-badge">${position}</span>`)
}))

vi.mock('../../lib/currency.js', () => ({
  euroFormat: { format: vi.fn((val) => `€${val}`) }
}))

vi.mock('../../util/player.js', () => ({
  calculatePlayerAge: vi.fn((player) => player.age ?? 20),
  getSalary: vi.fn((level) => level * 100),
  calculateMarketValue: vi.fn((level, age) => level * 1000 + age),
  willRetireNextSeason: vi.fn(() => false),
  sortByPosition: vi.fn(() => 0),
  // Minimal stub: GK > defender > midfielder > attacker. Sufficient for the
  // column-sort test ("CD before OM").
  positionRank: vi.fn((pos) => {
    if (!pos) return 0
    if (pos.endsWith('K')) return 30
    if (pos.endsWith('D')) return 20
    if (pos.endsWith('M')) return 10
    return 0
  })
}))

import { PlayerList } from '../../partials/playerList.js'
import { server } from '../../lib/gateway.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { sortByPosition } from '../../util/player.js'

describe('PlayerList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.getCurrentGameday.mockResolvedValue({ season: 1 })
    server.getMySellOfferPlayerIds.mockResolvedValue({ playerIds: [] })
    server.getTeamSellOfferPlayerIds.mockResolvedValue({ playerIds: [] })
  })

  describe('sell-offer source', () => {
    it('uses the current user sell offers by default', async () => {
      const list = new PlayerList([testData.player({ id: 1 })], true)
      await list.load()

      expect(server.getMySellOfferPlayerIds).toHaveBeenCalled()
      expect(server.getTeamSellOfferPlayerIds).not.toHaveBeenCalled()
    })

    it('uses the given team sell offers when sellOfferTeamId is set (foreign team page)', async () => {
      server.getTeamSellOfferPlayerIds.mockResolvedValue({ playerIds: [1] })
      const list = new PlayerList(
        [testData.player({ id: 1 })], true, vi.fn(), false, false, null, null,
        { sellOfferTeamId: 85 }
      )
      await list.load()

      expect(server.getTeamSellOfferPlayerIds).toHaveBeenCalledWith(85)
      expect(server.getMySellOfferPlayerIds).not.toHaveBeenCalled()
      expect(list.sellOfferPlayerIds.has(1)).toBe(true)
    })
  })

  describe('sortable columns', () => {
    /**
     * Internal helper: build a PlayerList, run load(), and pull the Table
     * config out via _renderTable() so we can assert on column metadata
     * without depending on rendered DOM.
     */
    async function buildTable (players, captainId = null) {
      const list = new PlayerList(players, true, vi.fn(), false, true, null, captainId)
      await list.load()
      return list._renderTable()
    }

    it('marks every header as sortable so column headers trigger sort on click', async () => {
      const table = await buildTable([testData.player()])

      // Each column must declare either a sortKey or a sortFn — otherwise
      // Table.js skips the click handler and the header isn't sortable.
      for (const col of table.config.cols) {
        expect(Boolean(col.sortKey || col.sortFn)).toBe(true)
      }
    })

    it('sorts numerically by level, fitness, age, salary, value, goals, games', async () => {
      const young = testData.player({ id: 1, level: 30, freshness: 0.4, age: 18, season_goals: 1, season_games: 5 })
      const old = testData.player({ id: 2, level: 80, freshness: 0.9, age: 32, season_goals: 12, season_games: 20 })
      const table = await buildTable([young, old])

      const colByName = (name) => table.config.cols.find(c => c.name === name)

      // Sortable by level
      const lvl = colByName('Lvl')
      expect(lvl.sortKey).toBe('level')

      // Sortable by fitness (freshness)
      const fit = colByName('Fit')
      expect(fit.sortKey).toBe('freshness')

      // Age uses sortFn against calculatePlayerAge so birth season is honored
      const age = colByName('Age')
      const ascAge = [young, old].slice().sort((a, b) => age.sortFn(a, b, true))
      expect(ascAge[0].id).toBe(young.id)
      const descAge = [young, old].slice().sort((a, b) => age.sortFn(a, b, false))
      expect(descAge[0].id).toBe(old.id)

      // Salary derives from level
      const salary = colByName('player.salary')
      const ascSalary = [old, young].slice().sort((a, b) => salary.sortFn(a, b, true))
      expect(ascSalary[0].id).toBe(young.id)

      // Value derives from level + age
      const value = colByName('player.value')
      const ascValue = [old, young].slice().sort((a, b) => value.sortFn(a, b, true))
      expect(ascValue[0].id).toBe(young.id)

      // Goals
      const goals = colByName('player.goals')
      const ascGoals = [old, young].slice().sort((a, b) => goals.sortFn(a, b, true))
      expect(ascGoals[0].id).toBe(young.id)
      const descGoals = [old, young].slice().sort((a, b) => goals.sortFn(a, b, false))
      expect(descGoals[0].id).toBe(old.id)

      // Games
      const games = colByName('player.games')
      const ascGames = [old, young].slice().sort((a, b) => games.sortFn(a, b, true))
      expect(ascGames[0].id).toBe(young.id)
    })

    it('sorts alphabetically by name and by natural football position order', async () => {
      // Clear in_game_position so the column sort falls back to the natural
      // position (testData.player defaults in_game_position to 'CM').
      const a = testData.player({ id: 1, name: 'Anna', position: 'CD', in_game_position: '' })
      const b = testData.player({ id: 2, name: 'Zebra', position: 'OM', in_game_position: '' })
      const table = await buildTable([a, b])

      const name = table.config.cols.find(c => c.name === 'Name')
      const sortedAsc = [b, a].slice().sort((x, y) => name.sortFn(x, y, true))
      expect(sortedAsc[0].id).toBe(a.id)
      const sortedDesc = [a, b].slice().sort((x, y) => name.sortFn(x, y, false))
      expect(sortedDesc[0].id).toBe(b.id)

      const pos = table.config.cols.find(c => c.name === 'Pos')
      // Ascending position = natural football order, so defenders before midfielders.
      const posAsc = [b, a].slice().sort((x, y) => pos.sortFn(x, y, true))
      expect(posAsc[0].id).toBe(a.id) // CD before OM
      const posDesc = [a, b].slice().sort((x, y) => pos.sortFn(x, y, false))
      expect(posDesc[0].id).toBe(b.id) // OM before CD when descending
    })

    it('sorts the position column by in_game_position when the player is fielded out of position', async () => {
      // Player a is a CD fielded as OM — should sort with midfielders, not defenders.
      const a = testData.player({ id: 1, name: 'Anna', position: 'CD', in_game_position: 'OM' })
      const b = testData.player({ id: 2, name: 'Zebra', position: 'CD', in_game_position: 'CD' })
      const table = await buildTable([a, b])

      const pos = table.config.cols.find(c => c.name === 'Pos')
      const posAsc = [a, b].slice().sort((x, y) => pos.sortFn(x, y, true))
      // Ascending = football order: defender (b: CD) before midfielder (a: CD-as-OM)
      expect(posAsc[0].id).toBe(b.id)
      expect(posAsc[1].id).toBe(a.id)
    })
  })

  describe('row click', () => {
    it('forwards row clicks to the configured handler', async () => {
      const onClick = vi.fn()
      const player = testData.player({ id: 42 })
      const list = new PlayerList([player], true, onClick)
      await list.load()

      const table = list._renderTable()
      table.config.onClick(player, 0)

      expect(onClick).toHaveBeenCalledWith(player)
    })

    it('does not throw when no click handler is supplied', async () => {
      const player = testData.player({ id: 42 })
      const list = new PlayerList([player], true)
      await list.load()

      const table = list._renderTable()
      expect(() => table.config.onClick(player, 0)).not.toThrow()
    })
  })

  describe('reset sort button', () => {
    it('hides the reset-sort toolbar when no sort is active', async () => {
      window.location.hash = '#my-team'
      const list = new PlayerList([testData.player()], true)
      await list.load()
      const html = list.template
      expect(html).toContain('player-list-toolbar')
      expect(html).toContain('player-list-reset-sort')
      // Toolbar starts with the `hidden` utility class when no sort params are set.
      expect(html).toMatch(/player-list-toolbar mb-2 hidden/)
    })

    it('shows the reset-sort toolbar when sort params are present in the URL', async () => {
      window.location.hash = '#my-team?sort_dir=ASC&col=4'
      const list = new PlayerList([testData.player()], true)
      await list.load()
      const html = list.template
      // No `hidden` class means the toolbar is visible.
      expect(html).toMatch(/player-list-toolbar mb-2 (?!hidden)/)
    })

    it('clicking reset clears sort params and restores default position-based order', async () => {
      window.location.hash = '#my-team?sort_dir=ASC&col=4'
      // Two players are needed so Array.prototype.sort actually invokes the comparator.
      const list = new PlayerList([testData.player({ id: 1 }), testData.player({ id: 2 })], true)
      await list.load()
      // Stub update so we don't drive the full UIElement render lifecycle.
      list.update = vi.fn()
      const { sortByPosition } = await import('../../util/player.js')
      sortByPosition.mockClear()

      const handler = list.events['.player-list-reset-sort'].click
      handler.call(list)

      // Hash no longer carries the sort params (router strips null entries).
      expect(window.location.hash).not.toMatch(/sort_dir/)
      expect(window.location.hash).not.toMatch(/col=/)
      // Default position sorter was reapplied and a re-render was scheduled.
      expect(sortByPosition).toHaveBeenCalled()
      expect(list.update).toHaveBeenCalled()
    })
  })

  describe('server-event driven sort refresh', () => {
    it('re-sorts and reorders `<tr>` nodes in place on LINEUP_PLAYER_CHANGED so the buckets (lineup / bench / reserve) stay right without a flicker-inducing full re-render', async () => {
      const list = new PlayerList([testData.player({ id: 1 }), testData.player({ id: 2 })], true)
      await list.load()
      list.update = vi.fn()
      const reorderSpy = vi.spyOn(list, '_reorderByPosition')
      sortByPosition.mockClear()

      list.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 1, in_game_position: 'CM' }) },
        ejectedPlayerId: 2,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(reorderSpy).toHaveBeenCalledTimes(1)
      expect(sortByPosition).toHaveBeenCalled()
      // The whole point of the in-place reorder is to avoid the full re-render.
      expect(list.update).not.toHaveBeenCalled()
    })

    it('re-sorts and reorders `<tr>` nodes in place on BENCH_CHANGED for the same reason', async () => {
      const list = new PlayerList([testData.player({ id: 1 }), testData.player({ id: 2 })], true)
      await list.load()
      list.update = vi.fn()
      const reorderSpy = vi.spyOn(list, '_reorderByPosition')
      sortByPosition.mockClear()

      list.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 1 }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(reorderSpy).toHaveBeenCalledTimes(1)
      expect(sortByPosition).toHaveBeenCalled()
      expect(list.update).not.toHaveBeenCalled()
    })

    it('skips the sort/reorder when a URL sort is active — the sortable columns are unaffected by a lineup swap, and mutating this.players would clobber the URL-sort order', async () => {
      window.location.hash = '#my-team?sort_dir=ASC&col=4'
      const list = new PlayerList([testData.player({ id: 1 }), testData.player({ id: 2 })], true)
      await list.load()
      list.update = vi.fn()
      sortByPosition.mockClear()

      list.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: testData.player({ id: 1, in_game_position: 'CM' }) },
        ejectedPlayerId: 2,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(sortByPosition).not.toHaveBeenCalled()
      expect(list.update).not.toHaveBeenCalled()
      window.location.hash = ''
    })

    it('keeps this.captainId in sync with CAPTAIN_CHANGED so a later full re-render draws the (C) marker correctly', async () => {
      const list = new PlayerList([testData.player({ id: 1 })], true, vi.fn(), false, false, null, null)
      await list.load()

      list.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 42 })
      expect(list.captainId).toBe(42)

      list.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: null })
      expect(list.captainId).toBeNull()
    })
  })
})
