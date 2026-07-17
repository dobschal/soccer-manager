import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    saveLineup: vi.fn().mockResolvedValue({ success: true, captainCleared: false }),
    saveBench: vi.fn().mockResolvedValue({ success: true }),
    getMyTeam: vi.fn().mockResolvedValue({ players: [] })
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

  it('re-rendering a Lineup after a swap does not drop the displaced real player', async () => {
    // Reproduces a bug: A (CD natural) is fielded as OM. User swaps him into
    // a CD slot held by B. After the swap the *parent* re-creates the Lineup
    // with the array that the Lineup just emitted (which still contains the
    // fake placeholders the old Lineup added for empty slots). The new
    // Lineup's _fillEmptyPositions used to also consume slots for those
    // re-fed fake placeholders, which could push real players (like the
    // newly-displaced B) out of the lineup or out of the array entirely.
    const team = testData.team({ formation: '442a' })
    const initial = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD', name: 'B' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'DM', in_game_position: 'DM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'RA', in_game_position: 'RA' }),
      testData.player({ id: 11, position: 'CD', in_game_position: 'OM', name: 'A' }),
      // A reserve player not in the lineup (no in_game_position). This will
      // cause the original Lineup to add at least one fake when slots are
      // tight, exercising the "fakes survive into the next Lineup" path.
      testData.player({ id: 12, position: 'CA', in_game_position: '' })
    ]

    const firstLineup = new Lineup(initial, team)
    const A = firstLineup.players.find(p => p.id === 11)
    const B = firstLineup.players.find(p => p.id === 3)
    await firstLineup._exchangePlayer(B, A)

    // Simulate what aTeam.js does on 'lineup-exchange': set parent.data.players
    // to the emitted array (which includes fakes) and then re-render Lineup.
    const emitted = fire.mock.calls.find(([event]) => event === 'lineup-exchange')[1]
    const secondLineup = new Lineup(emitted, team)
    const reals = secondLineup.players.filter(p => !p.fake)

    // Every original real player must still be present.
    expect(reals.map(p => p.id).sort((x, y) => x - y))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    // B (id 3) ended up at OM, A (id 11) ended up at CD, both still in the squad.
    expect(secondLineup.players.find(p => p.id === 3).in_game_position).toBe('OM')
    expect(secondLineup.players.find(p => p.id === 11).in_game_position).toBe('CD')
  })

  it('keeps all eleven players after swapping an out-of-position player into a slot already held by another', async () => {
    // Reproduces a bug: A (natural CD) is fielded out of position as OM.
    // The user then swaps A into a CD slot held by B (natural CD). Expected:
    // A ends up at CD, B at OM, all 11 players still present in the lineup
    // data that gets emitted via lineup-exchange.
    // Use 442a — it has 2 CD slots and 1 OM slot, so the swap stays in-formation.
    const team = testData.team({ formation: '442a' })
    const players = [
      testData.player({ id: 1, position: 'GK', in_game_position: 'GK' }),
      testData.player({ id: 2, position: 'LD', in_game_position: 'LD' }),
      // B — natural CD, in CD slot
      testData.player({ id: 3, position: 'CD', in_game_position: 'CD', name: 'B' }),
      testData.player({ id: 4, position: 'CD', in_game_position: 'CD' }),
      testData.player({ id: 5, position: 'RD', in_game_position: 'RD' }),
      testData.player({ id: 6, position: 'LM', in_game_position: 'LM' }),
      testData.player({ id: 7, position: 'DM', in_game_position: 'DM' }),
      testData.player({ id: 8, position: 'RM', in_game_position: 'RM' }),
      testData.player({ id: 9, position: 'LA', in_game_position: 'LA' }),
      testData.player({ id: 10, position: 'RA', in_game_position: 'RA' }),
      // A — natural CD but fielded as OM (out of position)
      testData.player({ id: 11, position: 'CD', in_game_position: 'OM', name: 'A' })
    ]

    const lineup = new Lineup(players, team)
    // No cleanup expected at construction — A is happily out-of-position.
    expect(lineup._needsAutoCleanup).toBe(false)

    const playerB = lineup.players.find(p => p.id === 3)
    const playerA = lineup.players.find(p => p.id === 11)
    await lineup._exchangePlayer(playerB, playerA)

    // After the swap: A at CD (his natural slot), B at OM (A's previous slot).
    expect(lineup.players.find(p => p.id === 11).in_game_position).toBe('CD')
    expect(lineup.players.find(p => p.id === 3).in_game_position).toBe('OM')

    // Most importantly: the array emitted via lineup-exchange must contain
    // every real player (no one disappeared) — that's what the PlayerList
    // outside the lineup is rendered from.
    const emitted = fire.mock.calls.find(([event]) => event === 'lineup-exchange')[1]
    const emittedRealPlayerIds = emitted.filter(p => !p.fake).map(p => p.id).sort((x, y) => x - y)
    expect(emittedRealPlayerIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('keeps the player overlay open after an action card is applied', async () => {
    // The user can chain multiple action cards onto the same lineup player.
    // _refreshAfterActionCard must refetch + re-emit the lineup data without
    // removing the SelectPlayerOverlay sitting on top.
    const team = testData.team({ formation: '433' })
    const lineup = new Lineup([], team)
    const overlayRemove = vi.fn()
    lineup._overlay = { remove: overlayRemove }

    await lineup._refreshAfterActionCard()

    expect(server.getMyTeam).toHaveBeenCalled()
    expect(fire).toHaveBeenCalledWith('lineup-exchange', expect.any(Array))
    expect(overlayRemove).not.toHaveBeenCalled()
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
