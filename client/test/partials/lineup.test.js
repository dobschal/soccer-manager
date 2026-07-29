import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    saveLineup: vi.fn().mockResolvedValue({ success: true, captainCleared: false }),
    saveBench: vi.fn().mockResolvedValue({ success: true }),
    swapLineupPlayer: vi.fn().mockResolvedValue({ success: true, captainCleared: false }),
    getMyTeam: vi.fn().mockResolvedValue({ players: [] }),
    getCurrentGameday: vi.fn().mockResolvedValue({ season: 8 })
  }
}))

vi.mock('../../partials/toast.js', () => ({
  toast: vi.fn()
}))

vi.mock('../../partials/overlay.js', () => ({
  showOverlay: vi.fn(() => ({ remove: vi.fn() }))
}))

vi.mock('../../partials/playerList.js', () => ({
  PlayerList: class { toString () { return '<div></div>' } }
}))

vi.mock('../../partials/playerImage.js', () => ({
  renderPlayerImage: vi.fn(() => Promise.resolve(''))
}))

vi.mock('../../partials/levelBadge.js', () => ({
  renderLevelBadge: vi.fn(() => '')
}))

vi.mock('../../lib/event.js', () => ({
  fire: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}))

import { Lineup, SquadPlayer } from '../../partials/lineup.js'
import { server } from '../../lib/gateway.js'
import { fire } from '../../lib/event.js'
import { SERVER_EVENTS } from '../../lib/serverEvents.js'
import { setLocale } from '../../i18n/index.js'

describe('Lineup _fillEmptyPositions cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a valid lineup untouched and does not auto-save', async () => {
    const team = testData.team({ formation: '433' })
    // 433: GK, LD, CD, CD, RD, LM, CM, RM, LA, CA, RA
    const players = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'CA', in_game_position: 'CA' }),
      testData.player({ id: 11, position: 'RA', in_game_position: 'RA' })
    ]

    const lineup = new Lineup(players, team)
    await lineup._autoCleanupIfNeeded()

    expect(server.saveLineup).not.toHaveBeenCalled()
    expect(fire).not.toHaveBeenCalled()
    // All 11 still in lineup, no fake placeholders pushed
    expect(lineup.players.filter(p => !p.fake && p.in_game_position)).toHaveLength(11)
    expect(lineup.players.filter(p => p.fake)).toHaveLength(0)
  })

  it('clears in_game_position when the player\'s slot is not in the formation', async () => {
    const team = testData.team({ formation: '433' })
    // Player has in_game_position 'OM' but 433 has no OM slot
    const orphan = testData.player({ id: 99, position: 'CM', in_game_position: 'OM' })
    const players = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'CA', in_game_position: 'CA' }),
      testData.player({ id: 11, position: 'RA', in_game_position: 'RA' }),
      orphan
    ]

    const lineup = new Lineup(players, team)
    await lineup._autoCleanupIfNeeded()

    const cleaned = lineup.players.find(p => p.id === 99)
    expect(cleaned.in_game_position).toBe('')
    expect(server.saveLineup).toHaveBeenCalledTimes(1)
    const [savedPlayers, savedFormation] = server.saveLineup.mock.calls[0]
    expect(savedFormation).toBe('433')
    // Saved players exclude fake placeholders; orphan player still included (with cleared position)
    expect(savedPlayers.find(p => p.id === 99).in_game_position).toBe('')
    expect(fire).toHaveBeenCalledWith('lineup-exchange', expect.any(Array))
  })

  it('keeps a player in a slot that does not match their natural position', async () => {
    // Out-of-position assignments are allowed (with an in-game level penalty).
    // The lineup cleanup must NOT eject such players — only invalid slot
    // references (slot not in formation, duplicates) get cleared.
    const team = testData.team({ formation: '433' })
    const offPosition = testData.player({ id: 99, position: 'LD', in_game_position: 'CD' })
    const players = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD' }),
      offPosition,
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'CA', in_game_position: 'CA' }),
      testData.player({ id: 11, position: 'RA', in_game_position: 'RA' })
    ]

    const lineup = new Lineup(players, team)
    await lineup._autoCleanupIfNeeded()

    const kept = lineup.players.find(p => p.id === 99)
    expect(kept.in_game_position).toBe('CD')
    // Nothing was cleaned, so no autosave was triggered
    expect(server.saveLineup).not.toHaveBeenCalled()
    // No fake placeholder for CD — both CD slots are filled
    const fakes = lineup.players.filter(p => p.fake)
    expect(fakes.some(f => f.in_game_position === 'CD')).toBe(false)
  })

  it('a leftover fake at slot X does not steal slot X from a real player on re-render', async () => {
    // This is the actual mechanism behind the bug the user hit: a Lineup adds
    // a fake placeholder for an unfilled slot, fires 'lineup-exchange' with
    // its own array (including that fake), and the next Lineup re-render
    // gets the fake back in its input. If we left the fake in, depending on
    // array order it could win the slot and silently push a real player out
    // of the lineup. The constructor must strip fakes from input.
    const team = testData.team({ formation: '442a' })
    const inputWithLeftoverFake = [
      // Leftover fake at OM appears BEFORE the real OM player in the array.
      { fake: true, in_game_position: 'OM', position: 'OM', level: 0, name: '-' },
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'DM', in_game_position: 'DM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'RA', in_game_position: 'RA' }),
      // Real player at OM — must keep his slot even though a leftover fake
      // claimed OM earlier in the array.
      testData.player({ id: 11, position: 'CD', in_game_position: 'OM', name: 'B' })
    ]

    const lineup = new Lineup(inputWithLeftoverFake, team)

    const B = lineup.players.find(p => p.id === 11)
    expect(B.in_game_position).toBe('OM')
    // And the leftover fake should be gone — no fake should be claiming OM.
    expect(lineup.players.some(p => p.fake && p.in_game_position === 'OM')).toBe(false)
  })

  it('_exchangePlayer delegates to server.swapLineupPlayer with the clicked slot and the picked player id', async () => {
    // The pre-refactor version did the swap client-side (mutated
    // in_game_position on both players, fired lineup-exchange, called
    // saveLineup + saveBench). That whole dance is now server-side under
    // one atomic route — _exchangePlayer's job is only to make the call
    // and let LINEUP_PLAYER_CHANGED fan out the visual updates.
    const team = testData.team({ formation: '442a' })
    const B = testData.player({ id: 3, position: 'CD', in_game_position: 'CD' })
    const A = testData.player({ id: 11, position: 'CD', in_game_position: 'OM' })

    const lineup = new Lineup([B, A], team)
    const playerB = lineup.players.find(p => p.id === 3)
    const playerA = lineup.players.find(p => p.id === 11)

    await lineup._exchangePlayer(playerB, playerA)

    // Called with the slot of the OLD occupant (the tile the user clicked),
    // the picked player's id, the outgoing player's id (so the server can
    // pick the exact tile even when the slot is shared, e.g. two CDs), and
    // the outgoing fake-slot ordinal (null for real tiles).
    expect(server.swapLineupPlayer).toHaveBeenCalledWith('CD', 11, 3, null)
    // No local mutation, no `fire('lineup-exchange')` — those are gone now
    // because LINEUP_PLAYER_CHANGED handles the fan-out.
    expect(fire).not.toHaveBeenCalledWith('lineup-exchange', expect.anything())
  })

  it('_exchangePlayer short-circuits when the user re-picks the current occupant', async () => {
    const team = testData.team({ formation: '442a' })
    const B = testData.player({ id: 3, position: 'CD', in_game_position: 'CD' })

    const lineup = new Lineup([B], team)
    const playerB = lineup.players.find(p => p.id === 3)

    await lineup._exchangePlayer(playerB, playerB)

    expect(server.swapLineupPlayer).not.toHaveBeenCalled()
  })

  describe('SquadPlayer CAPTAIN_CHANGED handling', () => {
    it('re-renders when this tile becomes the new captain', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 42 })

      expect(tile._isCaptain).toBe(true)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('re-renders when this tile loses the captain badge', () => {
      const team = testData.team({ captain_id: 42 })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 99 })

      expect(tile._isCaptain).toBe(false)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for tiles not involved in the swap', () => {
      const team = testData.team({ captain_id: 99 })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 100 })

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('ignores CAPTAIN_CHANGED for fake placeholder tiles', () => {
      const team = testData.team({ captain_id: null })
      const fake = { fake: true, in_game_position: 'CM', position: 'CM', level: 0, name: '-' }
      const tile = new SquadPlayer(fake, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 42 })

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })

  describe('Lineup CAPTAIN_CHANGED handling', () => {
    it('keeps team.captain_id in sync so subsequent re-renders pick up the change', () => {
      const team = testData.team({ formation: '433', captain_id: 42 })
      const lineup = new Lineup([], team)
      const updateSpy = vi.spyOn(lineup, 'update').mockImplementation(() => {})

      lineup.serverEvents[SERVER_EVENTS.CAPTAIN_CHANGED.name]({ captainId: 99 })

      // Lineup itself must NOT re-render — SquadPlayer tiles handle their own
      // visual updates atomically, and re-rendering Lineup would tear every
      // tile down for nothing.
      expect(updateSpy).not.toHaveBeenCalled()
      expect(team.captain_id).toBe(99)
    })
  })

  describe('SquadPlayer BENCH_CHANGED handling', () => {
    it('turns a real tile into a fake placeholder when its player is moved to bench', () => {
      const team = testData.team()
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42, bench_position: 'BENCH_MID', in_game_position: '' }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(tile.player.fake).toBe(true)
      expect(tile.player.in_game_position).toBe('CM')
      expect(tile._isCaptain).toBe(false)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op when a different player was moved to bench', () => {
      const team = testData.team()
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 99 }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CD'
      })

      expect(tile.player.fake).toBeUndefined()
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('is a no-op when the picked player was already on the bench (no lineup vacancy)', () => {
      const team = testData.team()
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42, bench_position: 'BENCH_MID' }),
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('ignores BENCH_CHANGED on a fake tile', () => {
      const team = testData.team()
      const fake = { fake: true, in_game_position: 'CM', position: 'CM', level: 0, name: '-' }
      const tile = new SquadPlayer(fake, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42 }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('still labels the fake placeholder correctly even when the parent Lineup handler already cleared the shared player.in_game_position', () => {
      // Regression: Lineup's handler mounts (and therefore fires) before the
      // child SquadPlayer's, and it mutates the SAME player object the tile
      // holds. If the tile then read `this.player.in_game_position` for the
      // fake's slot label, it would get '' — rendering an unstyled ghost tile
      // with no position badge. The tile MUST use `data.vacatedLineupPosition`
      // from the event instead.
      const team = testData.team()
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      // Simulate Lineup's handler firing first: it clears in_game_position on
      // the same object the tile holds.
      player.in_game_position = ''

      tile.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 42, in_game_position: '', bench_position: 'BENCH_MID' }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      expect(tile.player.fake).toBe(true)
      expect(tile.player.in_game_position).toBe('CM')
      expect(tile.player.position).toBe('CM')
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('Lineup BENCH_CHANGED handling', () => {
    it('moves the picked player from lineup to bench in this.players and adds a fake for the empty slot', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM' })
      ]
      const lineup = new Lineup(players, team)
      const updateSpy = vi.spyOn(lineup, 'update').mockImplementation(() => {})

      lineup.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 7, position: 'CM' }),
        displacedPlayerId: null,
        vacatedLineupPosition: 'CM'
      })

      // Lineup itself must NOT re-render — SquadPlayer handles the visual
      // change; Lineup only tracks the shape so click routing stays correct.
      expect(updateSpy).not.toHaveBeenCalled()

      const moved = lineup.players.find(p => !p.fake && p.id === 7)
      expect(moved.in_game_position).toBe('')
      expect(moved.bench_position).toBe('BENCH_MID')

      // A fresh fake placeholder should exist for the freshly-vacated CM slot
      // so click routing still resolves.
      const fakes = lineup.players.filter(p => p.fake && p.in_game_position === 'CM')
      expect(fakes.length).toBeGreaterThan(0)
    })

    it('is a no-op when the BENCH_CHANGED did not vacate a lineup slot', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [testData.player({ id: 7, position: 'CM', in_game_position: 'CM' })]
      const lineup = new Lineup(players, team)
      const beforeCount = lineup.players.length

      lineup.serverEvents[SERVER_EVENTS.BENCH_CHANGED.name]({
        benchPosition: 'BENCH_MID',
        player: testData.player({ id: 99 }),
        displacedPlayerId: null,
        vacatedLineupPosition: null
      })

      expect(lineup.players.length).toBe(beforeCount)
    })
  })

  describe('SquadPlayer LINEUP_PLAYER_CHANGED handling', () => {
    it('updates the tile to show the new occupant when the event assigns a player to my slot', () => {
      const team = testData.team({ captain_id: null })
      const oldPlayer = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(oldPlayer, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      const newOccupant = testData.player({ id: 99, in_game_position: 'CM' })
      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: newOccupant },
        replacements: { CM: { previousPlayerId: 42, previousFakeSlotIndex: null } },
        ejectedPlayerId: 42,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: null
      })

      expect(tile.player).toBe(newOccupant)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('sets _isCaptain based on the current team.captain_id when swapping in a new occupant', () => {
      const team = testData.team({ captain_id: 99 })
      const oldPlayer = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(oldPlayer, team)
      vi.spyOn(tile, 'update').mockImplementation(() => {})

      const newOccupant = testData.player({ id: 99, in_game_position: 'CM' })
      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: newOccupant },
        replacements: { CM: { previousPlayerId: 42, previousFakeSlotIndex: null } },
        ejectedPlayerId: 42,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: null
      })

      expect(tile._isCaptain).toBe(true)
    })

    it('turns into a fake placeholder when my slot was emptied by the swap', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      // Rare swap-with-empty case: my player moved to a different lineup
      // slot, no one filled my slot. `emptiedTilePlayerId` pins the vacated
      // tile to my player so a same-slot neighbor doesn't also turn fake.
      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CD: testData.player({ id: 42, in_game_position: 'CD' }) },
        replacements: { CD: { previousPlayerId: null, previousFakeSlotIndex: 0 } },
        ejectedPlayerId: null,
        emptiedSlot: 'CM',
        emptiedTilePlayerId: 42,
        freedBenchPosition: null
      })

      expect(tile.player.fake).toBe(true)
      expect(tile.player.in_game_position).toBe('CM')
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('turns into a fake placeholder when my player was ejected from the lineup', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      // Bring-in-kick where my slot ends up empty is impossible in practice
      // (a new player always fills the clicked slot), but if the event ever
      // arrived that way, the tile should still go fake gracefully.
      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: {},
        ejectedPlayerId: 42,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      expect(tile.player.fake).toBe(true)
      expect(tile.player.in_game_position).toBe('CM')
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('is a no-op for tiles not involved in the swap', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CD: testData.player({ id: 99, in_game_position: 'CD' }) },
        replacements: { CD: { previousPlayerId: 88, previousFakeSlotIndex: null } },
        ejectedPlayerId: null,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: null
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('does not duplicate the picked player onto the other same-slot tile (two CDs, one gets swapped)', () => {
      // Regression: previously `data.slots.CD` was read blindly by every CD
      // tile, so picking a bench player for CD#0 also rendered them on CD#1.
      // Now each tile filters on `replacements[this.slot].previousPlayerId`
      // (or previousFakeSlotIndex for fakes), so the other CD stays put.
      const team = testData.team({ captain_id: null })
      const playerA = testData.player({ id: 42, in_game_position: 'CD' })
      const playerB = testData.player({ id: 88, in_game_position: 'CD' })
      const tileA = new SquadPlayer(playerA, team, '', 0)
      const tileB = new SquadPlayer(playerB, team, '', 1)
      const updateA = vi.spyOn(tileA, 'update').mockImplementation(() => {})
      const updateB = vi.spyOn(tileB, 'update').mockImplementation(() => {})

      // User picked player X (from bench) into CD#0 (playerA's tile).
      const newOccupant = testData.player({ id: 7, in_game_position: 'CD' })
      const event = {
        slots: { CD: newOccupant },
        replacements: { CD: { previousPlayerId: 42, previousFakeSlotIndex: null } },
        ejectedPlayerId: 42,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: 'BENCH_MID'
      }
      tileA.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)
      tileB.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)

      // Only CD#0 (playerA's tile) picks up newOccupant.
      expect(tileA.player).toBe(newOccupant)
      expect(updateA).toHaveBeenCalledTimes(1)
      // CD#1 (playerB) is untouched — no duplicate on the pitch.
      expect(tileB.player).toBe(playerB)
      expect(updateB).not.toHaveBeenCalled()
    })

    it('empties the source tile when a player is moved between two same-slot tiles', () => {
      // Regression: two CM tiles, playerA on ordinal 0, ordinal 1 empty. User
      // picks playerA (already in the lineup) for the empty CM#1. The server
      // keeps A at 'CM' and echoes replacements.CM (target = fake ordinal 1)
      // AND emptiedSlot='CM'/emptiedTilePlayerId=A (source = A's old tile).
      // Both tiles share slot 'CM', so both see `replacement && newOccupant`;
      // the source tile must fall through to the emptied check and turn fake
      // instead of keeping A painted (which showed A twice on the pitch).
      const team = testData.team({ captain_id: null })
      const playerA = testData.player({ id: 42, in_game_position: 'CM' })
      const fakeB = { fake: true, in_game_position: 'CM', position: 'CM', level: 0, name: '-' }
      const tileA = new SquadPlayer(playerA, team, '', 0)
      const tileB = new SquadPlayer(fakeB, team, '', 1)
      const updateA = vi.spyOn(tileA, 'update').mockImplementation(() => {})
      const updateB = vi.spyOn(tileB, 'update').mockImplementation(() => {})

      const freshA = testData.player({ id: 42, in_game_position: 'CM' })
      const event = {
        slots: { CM: freshA },
        replacements: { CM: { previousPlayerId: null, previousFakeSlotIndex: 1 } },
        ejectedPlayerId: null,
        emptiedSlot: 'CM',
        emptiedTilePlayerId: 42,
        freedBenchPosition: null
      }
      tileA.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)
      tileB.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)

      // CM#1 (the clicked empty tile) receives A.
      expect(tileB.player).toBe(freshA)
      expect(updateB).toHaveBeenCalledTimes(1)
      // CM#0 (A's old tile) turns into a fake placeholder — no duplicate A.
      expect(tileA.player.fake).toBe(true)
      expect(updateA).toHaveBeenCalledTimes(1)
    })

    it('fills only the clicked empty CD when two CDs are empty', () => {
      // Two fake CD tiles, one at ordinal 0, one at ordinal 1. User clicks
      // ordinal 1. Server echoes previousFakeSlotIndex=1; only tileB fills.
      const team = testData.team({ captain_id: null })
      const fakeA = { fake: true, in_game_position: 'CD', position: 'CD', level: 0, name: '-' }
      const fakeB = { fake: true, in_game_position: 'CD', position: 'CD', level: 0, name: '-' }
      const tileA = new SquadPlayer(fakeA, team, '', 0)
      const tileB = new SquadPlayer(fakeB, team, '', 1)
      const updateA = vi.spyOn(tileA, 'update').mockImplementation(() => {})
      const updateB = vi.spyOn(tileB, 'update').mockImplementation(() => {})

      const newOccupant = testData.player({ id: 7, in_game_position: 'CD' })
      const event = {
        slots: { CD: newOccupant },
        replacements: { CD: { previousPlayerId: null, previousFakeSlotIndex: 1 } },
        ejectedPlayerId: null,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: null
      }
      tileA.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)
      tileB.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name](event)

      expect(tileA.player).toBe(fakeA)
      expect(updateA).not.toHaveBeenCalled()
      expect(tileB.player).toBe(newOccupant)
      expect(updateB).toHaveBeenCalledTimes(1)
    })

    it('keeps the tile\'s pitch slot stable even when the Lineup handler already mutated player.in_game_position', () => {
      // Same ordering trap as the BENCH_CHANGED bug — the parent Lineup's
      // handler runs first and can mutate the shared player object. The
      // tile MUST anchor to `this.slot` (frozen in constructor), not to
      // `this.player.in_game_position`, otherwise the tile drifts off its
      // physical grid position.
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM' })
      const tile = new SquadPlayer(player, team)
      vi.spyOn(tile, 'update').mockImplementation(() => {})

      // Simulate the parent Lineup handler having already moved the player.
      player.in_game_position = 'CD'

      const newOccupant = testData.player({ id: 99, in_game_position: 'CM' })
      tile.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CM: newOccupant },
        replacements: { CM: { previousPlayerId: 42, previousFakeSlotIndex: null } },
        ejectedPlayerId: null,
        emptiedSlot: null,
        emptiedTilePlayerId: null,
        freedBenchPosition: null
      })

      // Tile picked up the new occupant for its OWN slot, not the drifted one.
      expect(tile.player).toBe(newOccupant)
      expect(tile.slot).toBe('CM')
    })
  })

  describe('Lineup LINEUP_PLAYER_CHANGED handling', () => {
    it('applies slot assignments and rebuilds fakes without re-rendering', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD' })
      ]
      const lineup = new Lineup(players, team)
      const updateSpy = vi.spyOn(lineup, 'update').mockImplementation(() => {})

      // Swap CM ↔ CD.
      lineup.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: {
          CM: testData.player({ id: 8, in_game_position: 'CM' }),
          CD: testData.player({ id: 7, in_game_position: 'CD' })
        },
        ejectedPlayerId: null,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      // No re-render — SquadPlayer tiles handle the visual side.
      expect(updateSpy).not.toHaveBeenCalled()
      // Local players array reflects the new slot assignments.
      expect(lineup.players.find(p => p.id === 7).in_game_position).toBe('CD')
      expect(lineup.players.find(p => p.id === 8).in_game_position).toBe('CM')
    })

    it('ejects players marked as ejected and rebuilds fake placeholders', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM' })
      ]
      const lineup = new Lineup(players, team)

      lineup.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: {}, // no one filled CM — atypical, but tests the ejection branch cleanly
        ejectedPlayerId: 7,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      const ejected = lineup.players.find(p => !p.fake && p.id === 7)
      expect(ejected.in_game_position).toBe('')
      // Fake placeholder now exists for the freed CM slot.
      expect(lineup.players.some(p => p.fake && p.in_game_position === 'CM')).toBe(true)
    })

    it('refreshes the strength + average-age overlay in place after a swap', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      // season 8. Starters 7 (age 21, lvl 50) + 8 (age 19, lvl 40) → avg 20.0, strength 90.
      // Reserve 9 (age 17, lvl 60) will replace 8 → starters 7 + 9 → avg 19.0, strength 110.
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: 3 }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD', level: 40, carrier_start_season: 5 }),
        testData.player({ id: 9, position: 'CD', in_game_position: '', level: 60, carrier_start_season: 7 })
      ]
      const lineup = new Lineup(players, team, 8)
      const updateSpy = vi.spyOn(lineup, 'update').mockImplementation(() => {})

      const root = document.createElement('div')
      root.setAttribute('data-render_id', lineup._renderId)
      root.innerHTML = `<div class="lineup-stats-overlay">${lineup._statsOverlayInner()}</div>`
      document.body.appendChild(root)
      expect(root.querySelector('.lineup-age-overlay').textContent).toBe('⏳20.0')

      // Swap: reserve 9 into CD, player 8 ejected from the lineup.
      lineup.serverEvents[SERVER_EVENTS.LINEUP_PLAYER_CHANGED.name]({
        slots: { CD: testData.player({ id: 9, in_game_position: 'CD' }) },
        ejectedPlayerId: 8,
        emptiedSlot: null,
        freedBenchPosition: null
      })

      // No full re-render — the overlay is patched in place.
      expect(updateSpy).not.toHaveBeenCalled()
      expect(root.querySelector('.lineup-strength-overlay').textContent).toBe('💪110')
      expect(root.querySelector('.lineup-age-overlay').textContent).toBe('⏳19.0')

      root.remove()
    })
  })

  describe('PLAYER_UPDATED handling (action-card driven stat changes)', () => {
    it('SquadPlayer patches its player and re-renders when its tile is targeted', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM', level: 50, freshness: 0.2 })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 42, level: 51, freshness: 1.0 })
      })

      expect(tile.player.level).toBe(51)
      expect(tile.player.freshness).toBe(1.0)
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })

    it('SquadPlayer is a no-op when the event targets a different player', () => {
      const team = testData.team({ captain_id: null })
      const player = testData.player({ id: 42, in_game_position: 'CM', level: 50 })
      const tile = new SquadPlayer(player, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 99, level: 80 })
      })

      expect(tile.player.level).toBe(50)
      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('SquadPlayer ignores PLAYER_UPDATED on a fake tile', () => {
      const team = testData.team({ captain_id: null })
      const fake = { fake: true, in_game_position: 'CM', position: 'CM', level: 0, name: '-' }
      const tile = new SquadPlayer(fake, team)
      const updateSpy = vi.spyOn(tile, 'update').mockImplementation(() => {})

      tile.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 42, level: 80 })
      })

      expect(updateSpy).not.toHaveBeenCalled()
    })

    it('Lineup patches its shared player and updates the strength overlay in place', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50 }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD', level: 40 })
      ]
      const lineup = new Lineup(players, team)
      const updateSpy = vi.spyOn(lineup, 'update').mockImplementation(() => {})

      const root = document.createElement('div')
      root.setAttribute('data-render_id', lineup._renderId)
      root.innerHTML = '<div class="lineup-stats-overlay"><span class="lineup-strength-overlay">💪90</span></div>'
      document.body.appendChild(root)

      lineup.serverEvents[SERVER_EVENTS.PLAYER_UPDATED.name]({
        player: testData.player({ id: 7, in_game_position: 'CM', level: 51 })
      })

      // No full re-render — SquadPlayer handles the tile visuals.
      expect(updateSpy).not.toHaveBeenCalled()
      expect(lineup.players.find(p => p.id === 7).level).toBe(51)
      expect(root.querySelector('.lineup-strength-overlay').textContent).toBe('💪91')

      root.remove()
    })

    it('renders strength and average age overlays with emoji prefixes', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      // season 8: carrier_start_season 3 → age 21, carrier_start_season 5 → age 19, avg 20
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: 3 }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD', level: 40, carrier_start_season: 5 })
      ]
      const lineup = new Lineup(players, team, 8)
      const html = lineup.template
      expect(html).toContain('💪90')
      // Average age is always rendered with one decimal place.
      expect(html).toContain('⏳20.0')
    })

    it('renders the average age with a comma separator when the locale is German', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: 3 }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD', level: 40, carrier_start_season: 5 })
      ]
      const lineup = new Lineup(players, team, 8)
      setLocale('de')
      try {
        expect(lineup.template).toContain('⏳20,0')
      } finally {
        setLocale('en')
      }
    })

    it('fetches the current season via load() when the parent did not provide one', async () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: 3 })
      ]
      const lineup = new Lineup(players, team)
      expect(lineup.season).toBeUndefined()
      await lineup.load()
      // Gateway returns season 8 → age = (8 - 3) + 16 = 21
      expect(server.getCurrentGameday).toHaveBeenCalled()
      expect(lineup.season).toBe(8)
      expect(lineup.template).toContain('⏳21.0')
    })

    it('skips the season fetch when the parent already provided one', async () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: 3 })
      ]
      const lineup = new Lineup(players, team, 8)
      await lineup.load()
      expect(server.getCurrentGameday).not.toHaveBeenCalled()
    })

    it('shows the average age in season 0 (a fresh database starts at season 0)', () => {
      const team = testData.team({ formation: '433', captain_id: null })
      // season 0: carrier_start_season -5 → age (0 - -5) + 16 = 21
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: -5 }),
        testData.player({ id: 8, position: 'CD', in_game_position: 'CD', level: 40, carrier_start_season: -3 })
      ]
      const lineup = new Lineup(players, team, 0)
      const html = lineup.template
      // avg of 21 and 19 = 20 — must not be hidden just because season === 0
      expect(html).toContain('⏳20.0')
    })

    it('keeps a parent-provided season 0 instead of refetching in load()', async () => {
      const team = testData.team({ formation: '433', captain_id: null })
      const players = [
        testData.player({ id: 7, position: 'CM', in_game_position: 'CM', level: 50, carrier_start_season: -5 })
      ]
      const lineup = new Lineup(players, team, 0)
      await lineup.load()
      expect(server.getCurrentGameday).not.toHaveBeenCalled()
      expect(lineup.season).toBe(0)
    })
  })

  it('clears duplicates when two players occupy a slot that only exists once', async () => {
    const team = testData.team({ formation: '433' })
    // 433 has a single CM slot. Two players claim it - the second should be cleared.
    const players = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'CM', in_game_position: 'CM' }),
      testData.player({ id: 12, position: 'CM', in_game_position: 'CM' }), // duplicate
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'CA', in_game_position: 'CA' }),
      testData.player({ id: 11, position: 'RA', in_game_position: 'RA' })
    ]

    const lineup = new Lineup(players, team)
    await lineup._autoCleanupIfNeeded()

    // The first CM player keeps the slot, the duplicate gets cleared
    const first = lineup.players.find(p => p.id === 7)
    const dup = lineup.players.find(p => p.id === 12)
    expect(first.in_game_position).toBe('CM')
    expect(dup.in_game_position).toBe('')
    expect(server.saveLineup).toHaveBeenCalledTimes(1)
  })
})
