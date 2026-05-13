import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testData } from '../setup.js'

vi.mock('../../lib/gateway.js', () => ({
  server: {
    saveLineup: vi.fn().mockResolvedValue({ success: true, captainCleared: false }),
    saveBench: vi.fn().mockResolvedValue({ success: true })
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

import { Lineup } from '../../partials/lineup.js'
import { server } from '../../lib/gateway.js'
import { fire } from '../../lib/event.js'

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

  it('clears in_game_position when player is in a slot that does not match their natural position', async () => {
    const team = testData.team({ formation: '433' })
    // Both players have natural position LD; only one LD slot exists. The second
    // somehow ended up at a CD slot (in_game_position 'CD'). Visually both render
    // at LD coords because the CSS class is derived from the natural position,
    // so the user sees "two LDs". The misplaced one must be cleared.
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

    const cleaned = lineup.players.find(p => p.id === 99)
    expect(cleaned.in_game_position).toBe('')
    expect(server.saveLineup).toHaveBeenCalledTimes(1)
    // The freed CD slot is filled by a fake placeholder so the user can fix it
    const fakes = lineup.players.filter(p => p.fake)
    expect(fakes.some(f => f.in_game_position === 'CD')).toBe(true)
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
