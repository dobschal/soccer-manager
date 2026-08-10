import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/database.js', () => ({
  query: vi.fn()
}))

import { query } from '../../lib/database.js'
import {
  activateLineup,
  createLineup,
  deleteLineup,
  ensureActiveLineup,
  MAX_TEAM_LINEUPS,
  renameLineup,
  sanitizeLineupName,
  syncActiveLineup
} from '../../helper/teamLineupHelper.js'

const TEAM = {
  id: 7,
  formation: '442a',
  pass_style: 'short',
  play_style: 'aggressive',
  attack_mode: 'offensive',
  captain_id: 101
}

/**
 * Route queries by SQL fragment. `overrides` wins over the defaults; anything
 * unmatched resolves to an empty array so unrelated writes are no-ops.
 * @param {Record<string, any>} overrides
 * @returns {{calls: Array<{sql: string, params: any}>}}
 */
function mockDb (overrides = {}) {
  const calls = []
  query.mockImplementation(async (sql, params) => {
    const text = String(sql)
    calls.push({ sql: text, params })
    for (const [fragment, value] of Object.entries(overrides)) {
      if (text.includes(fragment)) {
        return typeof value === 'function' ? value(text, params) : value
      }
    }
    if (text.includes('INSERT INTO')) return { insertId: 555 }
    return []
  })
  return { calls }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sanitizeLineupName', () => {
  it('trims the input', () => {
    expect(sanitizeLineupName('  Cup night  ', 'x')).toBe('Cup night')
  })

  it('falls back when the name is empty', () => {
    expect(sanitizeLineupName('   ', 'Lineup 2')).toBe('Lineup 2')
    expect(sanitizeLineupName(null, 'Lineup 2')).toBe('Lineup 2')
  })

  it('caps the length at 40 characters', () => {
    expect(sanitizeLineupName('x'.repeat(80), 'x')).toHaveLength(40)
  })
})

describe('syncActiveLineup', () => {
  it('writes the team state and its pitch/bench assignments into the active lineup', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3, team_id: 7 }],
      'FROM team WHERE id=?': [TEAM],
      'FROM player\n     WHERE team_id=?': [
        { id: 101, in_game_position: 'GK', bench_position: null, bench_substitution_mode: null },
        { id: 102, in_game_position: '', bench_position: 'BENCH_GK', bench_substitution_mode: 'always' }
      ]
    })

    await syncActiveLineup(7)

    const update = calls.find(c => c.sql.includes('UPDATE team_lineup SET formation=?'))
    expect(update.params).toEqual(['442a', 'short', 'aggressive', 'offensive', 101, 3])
    // The snapshot is replaced wholesale, so a removed player cannot linger.
    expect(calls.some(c => c.sql.includes('DELETE FROM team_lineup_player'))).toBe(true)
    const inserts = calls.filter(c => c.sql.includes('INSERT INTO team_lineup_player'))
    expect(inserts).toHaveLength(2)
    expect(inserts[0].params).toMatchObject({ lineup_id: 3, player_id: 101, in_game_position: 'GK' })
    expect(inserts[1].params).toMatchObject({ player_id: 102, bench_position: 'BENCH_GK', bench_substitution_mode: 'always' })
  })

  it('does nothing when the team has no active lineup', async () => {
    const { calls } = mockDb({ 'FROM team_lineup WHERE team_id=? AND is_active=1': [] })

    await syncActiveLineup(7)

    expect(calls.some(c => c.sql.includes('UPDATE team_lineup SET formation=?'))).toBe(false)
  })
})

describe('ensureActiveLineup', () => {
  it('returns the existing active lineup untouched', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3, name: 'Lineup 1', is_active: 1 }]
    })

    const result = await ensureActiveLineup(7)

    expect(result.id).toBe(3)
    expect(calls.some(c => c.sql.includes('INSERT INTO team_lineup '))).toBe(false)
  })

  it('activates the oldest lineup when none is flagged active', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE team_id=? AND is_active=1': [],
      'FROM team_lineup WHERE team_id=? ORDER BY id ASC LIMIT 1': [{ id: 4, name: 'Lineup 1', is_active: 0 }]
    })

    const result = await ensureActiveLineup(7)

    expect(result.id).toBe(4)
    expect(calls.some(c => c.sql.includes('UPDATE team_lineup SET is_active=1 WHERE id=?'))).toBe(true)
  })

  it('creates a first lineup from the current team setup', async () => {
    let created = false
    const { calls } = mockDb({
      'FROM team_lineup WHERE team_id=? AND is_active=1': () => created ? [{ id: 555 }] : [],
      'FROM team_lineup WHERE team_id=? ORDER BY id ASC LIMIT 1': [],
      'FROM team WHERE id=?': [TEAM],
      'INSERT INTO team_lineup ': () => { created = true; return { insertId: 555 } },
      'FROM team_lineup WHERE id=?': [{ id: 555, name: 'Lineup 1' }]
    })

    const result = await ensureActiveLineup(7)

    expect(result.id).toBe(555)
    const insert = calls.find(c => c.sql.includes('INSERT INTO team_lineup '))
    expect(insert.params).toMatchObject({ team_id: 7, formation: '442a', captain_id: 101, is_active: 1 })
  })
})

describe('createLineup', () => {
  it('creates an empty lineup with a random formation and makes it active', async () => {
    const { calls } = mockDb({
      'SELECT id, name, formation, is_active FROM team_lineup': [{ id: 3, is_active: 1 }],
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3 }],
      'FROM team WHERE id=?': [TEAM],
      'FROM team_lineup WHERE id=? AND team_id=?': [{
        id: 555, team_id: 7, formation: '433', pass_style: 'mixed', play_style: 'normal', attack_mode: 'balanced', captain_id: null
      }],
      'FROM team_lineup_player WHERE lineup_id=?': []
    })

    const result = await createLineup(7, '  Cup night  ')

    expect(result.id).toBe(555)
    const insert = calls.find(c => c.sql.includes('INSERT INTO team_lineup '))
    expect(insert.params.name).toBe('Cup night')
    expect(insert.params.captain_id).toBe(null)
    expect(insert.params.is_active).toBe(1)
    expect(typeof insert.params.formation).toBe('string')
    // Everyone is cleared off the pitch — the new slot starts empty (#481).
    expect(calls.some(c => c.sql.includes("UPDATE player SET in_game_position='', bench_position=NULL"))).toBe(true)
  })

  it('refuses to go past the lineup cap', async () => {
    mockDb({
      'SELECT id, name, formation, is_active FROM team_lineup':
        Array.from({ length: MAX_TEAM_LINEUPS }, (_, i) => ({ id: i + 1 }))
    })

    await expect(createLineup(7, 'One more')).rejects.toThrow(/more than/)
  })
})

describe('activateLineup', () => {
  it('restores pitch, bench, tactics and captain from the snapshot', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE id=? AND team_id=?': [{
        id: 4,
        team_id: 7,
        formation: '442b',
        pass_style: 'long',
        play_style: 'friendly',
        attack_mode: 'defensive',
        captain_id: 201,
        is_active: 0
      }],
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3 }],
      'FROM team WHERE id=?': [TEAM],
      'FROM team_lineup_player WHERE lineup_id=?': [
        { player_id: 201, in_game_position: 'GK', bench_position: null, bench_substitution_mode: null },
        { player_id: 202, in_game_position: null, bench_position: 'BENCH_MID', bench_substitution_mode: 'always' }
      ],
      'SELECT id FROM player WHERE team_id=?': [{ id: 201 }, { id: 202 }]
    })

    const result = await activateLineup(7, 4)

    expect(result.id).toBe(4)
    const teamUpdate = calls.find(c => c.sql.includes('UPDATE team SET formation=?'))
    expect(teamUpdate.params).toEqual(['442b', 'long', 'friendly', 'defensive', 7])
    expect(calls.some(c => c.sql.includes('UPDATE player SET in_game_position=?, bench_position=NULL'))).toBe(true)
    expect(calls.some(c => c.sql.includes('UPDATE player SET bench_position=?, bench_substitution_mode=?'))).toBe(true)
    const captainUpdate = calls.find(c => c.sql.includes('UPDATE team SET captain_id=?'))
    expect(captainUpdate.params).toEqual([201, 7])
  })

  it('drops players that left the squad and clears an orphaned captain', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE id=? AND team_id=?': [{
        id: 4, team_id: 7, formation: '442b', captain_id: 201, is_active: 0
      }],
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3 }],
      'FROM team WHERE id=?': [TEAM],
      'FROM team_lineup_player WHERE lineup_id=?': [
        { player_id: 201, in_game_position: 'GK', bench_position: null, bench_substitution_mode: null }
      ],
      // Player 201 was sold in the meantime.
      'SELECT id FROM player WHERE team_id=?': [{ id: 202 }]
    })

    await activateLineup(7, 4)

    expect(calls.some(c => c.sql.includes('UPDATE player SET in_game_position=?, bench_position=NULL'))).toBe(false)
    const captainUpdate = calls.find(c => c.sql.includes('UPDATE team SET captain_id=?'))
    expect(captainUpdate.params).toEqual([null, 7])
  })

  it('ignores saved slots that the formation no longer has', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE id=? AND team_id=?': [{
        id: 4, team_id: 7, formation: '442b', captain_id: null, is_active: 0
      }],
      'FROM team_lineup WHERE team_id=? AND is_active=1': [{ id: 3 }],
      'FROM team WHERE id=?': [TEAM],
      'FROM team_lineup_player WHERE lineup_id=?': [
        { player_id: 201, in_game_position: 'NOT_A_SLOT', bench_position: null, bench_substitution_mode: null }
      ],
      'SELECT id FROM player WHERE team_id=?': [{ id: 201 }]
    })

    await activateLineup(7, 4)

    expect(calls.some(c => c.sql.includes('UPDATE player SET in_game_position=?, bench_position=NULL'))).toBe(false)
  })

  it('is a no-op when the lineup is already active', async () => {
    const { calls } = mockDb({
      'FROM team_lineup WHERE id=? AND team_id=?': [{ id: 4, team_id: 7, is_active: 1 }]
    })

    const result = await activateLineup(7, 4)

    expect(result.id).toBe(4)
    expect(calls.some(c => c.sql.includes('UPDATE team SET formation=?'))).toBe(false)
  })

  it('rejects a lineup that belongs to another team', async () => {
    mockDb({ 'FROM team_lineup WHERE id=? AND team_id=?': [] })
    await expect(activateLineup(7, 999)).rejects.toThrow('Lineup not found')
  })
})

describe('renameLineup', () => {
  it('stores the trimmed name', async () => {
    const { calls } = mockDb({ 'FROM team_lineup WHERE id=? AND team_id=?': [{ id: 4, name: 'Old' }] })

    const result = await renameLineup(7, 4, '  Away  ')

    expect(result.name).toBe('Away')
    expect(calls.find(c => c.sql.includes('UPDATE team_lineup SET name=?')).params).toEqual(['Away', 4])
  })
})

describe('deleteLineup', () => {
  it('refuses to delete the only lineup', async () => {
    mockDb({ 'SELECT id, name, formation, is_active FROM team_lineup': [{ id: 3, is_active: 1 }] })
    await expect(deleteLineup(7, 3)).rejects.toThrow(/at least one/)
  })

  it('loads the oldest remaining lineup when the active one is deleted', async () => {
    const { calls } = mockDb({
      'SELECT id, name, formation, is_active FROM team_lineup': [
        { id: 3, is_active: 0 },
        { id: 4, is_active: 1 }
      ],
      'FROM team_lineup WHERE team_id=? ORDER BY id ASC LIMIT 1': [{ id: 3 }],
      'FROM team_lineup WHERE id=? AND team_id=?': [{ id: 3, team_id: 7, formation: '433', captain_id: null }],
      'FROM team_lineup_player WHERE lineup_id=?': [],
      'SELECT id FROM player WHERE team_id=?': []
    })

    const result = await deleteLineup(7, 4)

    expect(result.activeId).toBe(3)
    expect(calls.some(c => c.sql.includes('DELETE FROM team_lineup WHERE id=?'))).toBe(true)
    expect(calls.some(c => c.sql.includes('UPDATE team_lineup SET is_active=1 WHERE id=?'))).toBe(true)
  })

  it('rejects a lineup id from another team', async () => {
    mockDb({
      'SELECT id, name, formation, is_active FROM team_lineup': [{ id: 3 }, { id: 4 }]
    })
    await expect(deleteLineup(7, 999)).rejects.toThrow('Lineup not found')
  })
})
