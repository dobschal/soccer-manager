import { describe, it, expect } from 'vitest'
import { hasRetired, shortenPlayerName, sortByPosition, willRetireNextSeason } from '../../util/player.js'

const p = (overrides = {}) => ({
  position: 'CM',
  in_game_position: '',
  bench_position: null,
  sort_index: 0,
  ...overrides
})

describe('sortByPosition', () => {
  it('places lineup players before bench players, and bench before reserves', () => {
    const players = [
      p({ position: 'CM', bench_position: 'BENCH_MID' }),
      p({ position: 'CM' }),
      p({ position: 'CM', in_game_position: 'CM' })
    ]
    players.sort(sortByPosition)
    expect(players[0].in_game_position).toBe('CM')
    expect(players[1].bench_position).toBe('BENCH_MID')
    expect(players[2].bench_position).toBeNull()
  })

  it('orders the lineup tier by where the player is actually playing', () => {
    // GK, CD (defender), OM (midfielder), CA (attacker) — typical lineup order
    // is GK > defenders > midfielders > attackers.
    const players = [
      p({ position: 'CA', in_game_position: 'CA' }),
      p({ position: 'CD', in_game_position: 'CD' }),
      p({ position: 'GK', in_game_position: 'GK' }),
      p({ position: 'OM', in_game_position: 'OM' })
    ]
    players.sort(sortByPosition)
    expect(players.map(x => x.in_game_position)).toEqual(['GK', 'CD', 'OM', 'CA'])
  })

  it('sorts a CD fielded as OM with the midfielders, not the defenders', () => {
    const players = [
      p({ position: 'CD', in_game_position: 'CD', id: 1 }),
      p({ position: 'CD', in_game_position: 'OM', id: 2 }), // out-of-position
      p({ position: 'OM', in_game_position: 'OM', id: 3 }),
      p({ position: 'CA', in_game_position: 'CA', id: 4 })
    ]
    players.sort(sortByPosition)
    // Expected ordering: defenders (CD) → midfielders (OM, OM) → attackers (CA)
    expect(players.map(x => x.id)).toEqual([1, 2, 3, 4])
  })

  it('keeps natural-position sorting for players not in the lineup', () => {
    const players = [
      p({ position: 'CA' }),
      p({ position: 'GK' }),
      p({ position: 'CM' })
    ]
    players.sort(sortByPosition)
    expect(players.map(x => x.position)).toEqual(['GK', 'CM', 'CA'])
  })
})

describe('willRetireNextSeason', () => {
  // `carrier_end_season` is the last season a player is active, inclusive. The
  // badge has to line up with `_archiveTooOldPlayers`, which retires
  // `carrier_end_season <= season` at the transition out of that same season.
  it('flags a player in their final season', () => {
    expect(willRetireNextSeason({ carrier_end_season: 9 }, 9)).toBe(true)
  })

  it('does not flag a player who still has a season left', () => {
    expect(willRetireNextSeason({ carrier_end_season: 9 }, 8)).toBe(false)
  })

  it('does not flag a player with several seasons left', () => {
    expect(willRetireNextSeason({ carrier_end_season: 14 }, 9)).toBe(false)
  })

  it('flags a player whose career end is already in the past', () => {
    expect(willRetireNextSeason({ carrier_end_season: 6 }, 9)).toBe(true)
  })

  // The hourglass means "this is his last season", so it has no business on a
  // player who is already gone — his modal shows the career-ended notice instead.
  it('does not flag a player who has already retired', () => {
    expect(willRetireNextSeason({ carrier_end_season: 6, is_retired: 1 }, 9)).toBe(false)
    expect(willRetireNextSeason({ carrier_end_season: 9, is_retired: 1 }, 9)).toBe(false)
  })
})

describe('hasRetired', () => {
  // `is_retired` is stamped on at the season transition and never cleared, so it
  // is the only reliable way to tell "final season" from "already gone" (#556).
  it('is true only for a player carrying the flag', () => {
    expect(hasRetired({ is_retired: 1 })).toBe(true)
    expect(hasRetired({ is_retired: 0 })).toBe(false)
  })

  it('treats a player row without the column as active', () => {
    expect(hasRetired({ carrier_end_season: 9 })).toBe(false)
  })
})

describe('shortenPlayerName (#563)', () => {
  it('keeps the surname and abbreviates the given name', () => {
    expect(shortenPlayerName('Luciano Mendes')).toBe('L. Mendes')
  })

  it('drops a middle name', () => {
    expect(shortenPlayerName('Jose Maria Avila')).toBe('J. Avila')
  })

  it('leaves a single-word name alone', () => {
    expect(shortenPlayerName('Ronaldinho')).toBe('Ronaldinho')
  })

  it('copes with extra whitespace', () => {
    expect(shortenPlayerName('  Tim   Wagner  ')).toBe('T. Wagner')
  })

  it('takes a whole character as the initial, not half a surrogate pair', () => {
    expect(shortenPlayerName('🅰️lex Keller')).toBe('🅰. Keller')
  })

  it('returns an empty string for nothing', () => {
    expect(shortenPlayerName('')).toBe('')
    expect(shortenPlayerName(null)).toBe('')
    expect(shortenPlayerName(undefined)).toBe('')
  })
})
