import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { Formation, getPositionsOfFormation } from '../../client/util/formation.js'
import { randomItem, truncateChars } from '../lib/util.js'

/**
 * Maximum number of saved lineups a team may keep. High enough that nobody
 * bumps into it in normal play, low enough that the select stays usable.
 */
export const MAX_TEAM_LINEUPS = 10

/** Maximum length of a user-provided lineup name. */
export const MAX_LINEUP_NAME_LENGTH = 40

/**
 * Trim and length-cap a user-supplied lineup name.
 * @param {string} name
 * @param {string} fallback - used when the input is empty after trimming
 * @returns {string}
 */
export function sanitizeLineupName (name, fallback) {
  const clean = typeof name === 'string' ? name.trim() : ''
  if (!clean) return fallback
  return truncateChars(clean, MAX_LINEUP_NAME_LENGTH)
}

/**
 * All saved lineups of a team, oldest first (creation order), each flagged
 * with whether it is the one currently loaded into the team.
 * @param {number} teamId
 * @returns {Promise<Array<{id: number, name: string, formation: string|null, is_active: number}>>}
 */
export async function getLineups (teamId) {
  return await query(
    'SELECT id, name, formation, is_active FROM team_lineup WHERE team_id=? ORDER BY id ASC',
    [teamId]
  )
}

/**
 * The lineup currently loaded into the team, or null when the team has none
 * yet (e.g. a team created after the seeding migration ran).
 * @param {number} teamId
 * @returns {Promise<object|null>}
 */
export async function getActiveLineup (teamId) {
  const [active] = await query(
    'SELECT * FROM team_lineup WHERE team_id=? AND is_active=1 ORDER BY id ASC LIMIT 1',
    [teamId]
  )
  return active || null
}

/**
 * Make sure the team has at least one lineup, creating one from its current
 * setup if not. Called lazily so teams founded after the migration (or teams
 * taken over from a bot) still get their slot without a dedicated hook.
 * @param {number} teamId
 * @returns {Promise<object>} the active lineup
 */
export async function ensureActiveLineup (teamId) {
  const active = await getActiveLineup(teamId)
  if (active) return active
  const [existing] = await query('SELECT * FROM team_lineup WHERE team_id=? ORDER BY id ASC LIMIT 1', [teamId])
  if (existing) {
    await query('UPDATE team_lineup SET is_active=1 WHERE id=?', [existing.id])
    return { ...existing, is_active: 1 }
  }
  const [team] = await query('SELECT * FROM team WHERE id=? LIMIT 1', [teamId])
  if (!team) throw new BadRequestError('Team not found')
  const result = await query('INSERT INTO team_lineup SET ?', {
    team_id: teamId,
    name: 'Lineup 1',
    formation: team.formation,
    pass_style: team.pass_style,
    play_style: team.play_style,
    attack_mode: team.attack_mode,
    captain_id: team.captain_id,
    is_active: 1
  })
  await syncActiveLineup(teamId)
  const [created] = await query('SELECT * FROM team_lineup WHERE id=?', [result.insertId])
  return created
}

/**
 * Write the team's *current* state (formation, tactics, captain, pitch and
 * bench assignments) back into the active lineup.
 *
 * Snapshotting the whole state instead of applying per-route deltas means
 * every mutating endpoint only has to call this once at the end and the saved
 * lineup can never drift out of sync with what the team actually fields.
 *
 * @param {number} teamId
 * @returns {Promise<void>}
 */
export async function syncActiveLineup (teamId) {
  const active = await getActiveLineup(teamId)
  if (!active) return
  const [team] = await query('SELECT * FROM team WHERE id=? LIMIT 1', [teamId])
  if (!team) return
  await query(
    'UPDATE team_lineup SET formation=?, pass_style=?, play_style=?, attack_mode=?, captain_id=? WHERE id=?',
    [team.formation, team.pass_style, team.play_style, team.attack_mode, team.captain_id, active.id]
  )
  await query('DELETE FROM team_lineup_player WHERE lineup_id=?', [active.id])
  const players = await query(
    `SELECT id, in_game_position, bench_position, bench_substitution_mode
     FROM player
     WHERE team_id=? AND ((in_game_position IS NOT NULL AND in_game_position <> '') OR bench_position IS NOT NULL)`,
    [teamId]
  )
  for (const player of players) {
    await query('INSERT INTO team_lineup_player SET ?', {
      lineup_id: active.id,
      player_id: player.id,
      in_game_position: player.in_game_position || null,
      bench_position: player.bench_position || null,
      bench_substitution_mode: player.bench_substitution_mode || null
    })
  }
}

/**
 * Create a new, empty lineup and make it the active one. Per #481 it starts
 * with a random formation and nobody assigned, so the user fills it from
 * scratch; tactics start at the game defaults.
 * @param {number} teamId
 * @param {string} name
 * @returns {Promise<{id: number}>}
 */
export async function createLineup (teamId, name) {
  const existing = await getLineups(teamId)
  if (existing.length >= MAX_TEAM_LINEUPS) {
    throw new BadRequestError(`You cannot have more than ${MAX_TEAM_LINEUPS} lineups`)
  }
  const safeName = sanitizeLineupName(name, `Lineup ${existing.length + 1}`)
  const formation = randomItem(Object.values(Formation))
  // Persist the current state into the outgoing lineup before switching away,
  // so nothing the user just changed is lost.
  await syncActiveLineup(teamId)
  await query('UPDATE team_lineup SET is_active=0 WHERE team_id=?', [teamId])
  const result = await query('INSERT INTO team_lineup SET ?', {
    team_id: teamId,
    name: safeName,
    formation,
    pass_style: 'mixed',
    play_style: 'normal',
    attack_mode: 'balanced',
    captain_id: null,
    is_active: 1
  })
  await _applyLineupToTeam(teamId, result.insertId)
  return { id: result.insertId }
}

/**
 * Load a saved lineup into the team so the next match calculation uses it.
 * The outgoing lineup is snapshotted first.
 * @param {number} teamId
 * @param {number} lineupId
 * @returns {Promise<{id: number}>}
 */
export async function activateLineup (teamId, lineupId) {
  const [lineup] = await query('SELECT * FROM team_lineup WHERE id=? AND team_id=? LIMIT 1', [lineupId, teamId])
  if (!lineup) throw new BadRequestError('Lineup not found')
  if (lineup.is_active) return { id: lineup.id }
  await syncActiveLineup(teamId)
  await query('UPDATE team_lineup SET is_active=0 WHERE team_id=?', [teamId])
  await query('UPDATE team_lineup SET is_active=1 WHERE id=?', [lineup.id])
  await _applyLineupToTeam(teamId, lineup.id)
  return { id: lineup.id }
}

/**
 * Rename a saved lineup.
 * @param {number} teamId
 * @param {number} lineupId
 * @param {string} name
 * @returns {Promise<{success: boolean, name: string}>}
 */
export async function renameLineup (teamId, lineupId, name) {
  const [lineup] = await query('SELECT * FROM team_lineup WHERE id=? AND team_id=? LIMIT 1', [lineupId, teamId])
  if (!lineup) throw new BadRequestError('Lineup not found')
  const safeName = sanitizeLineupName(name, lineup.name)
  await query('UPDATE team_lineup SET name=? WHERE id=?', [safeName, lineup.id])
  return { success: true, name: safeName }
}

/**
 * Delete a saved lineup. The last remaining lineup cannot be deleted — a team
 * always has exactly one active setup. Deleting the active one falls back to
 * the oldest remaining lineup.
 * @param {number} teamId
 * @param {number} lineupId
 * @returns {Promise<{success: boolean, activeId: number}>}
 */
export async function deleteLineup (teamId, lineupId) {
  const lineups = await getLineups(teamId)
  if (lineups.length <= 1) throw new BadRequestError('You need at least one lineup')
  const target = lineups.find(l => l.id === Number(lineupId))
  if (!target) throw new BadRequestError('Lineup not found')
  await query('DELETE FROM team_lineup_player WHERE lineup_id=?', [target.id])
  await query('DELETE FROM team_lineup WHERE id=?', [target.id])
  if (target.is_active) {
    const [next] = await query('SELECT * FROM team_lineup WHERE team_id=? ORDER BY id ASC LIMIT 1', [teamId])
    await query('UPDATE team_lineup SET is_active=1 WHERE id=?', [next.id])
    await _applyLineupToTeam(teamId, next.id)
    return { success: true, activeId: next.id }
  }
  const active = await getActiveLineup(teamId)
  return { success: true, activeId: active?.id ?? null }
}

/**
 * Copy a saved lineup onto the live team and player rows.
 *
 * Saved assignments are validated against the squad as it is *now*: players
 * that were sold, players who are away on tour, and slots that no longer exist
 * in the formation are simply dropped. A captain who is no longer in the lineup
 * is cleared, mirroring `setCaptain`'s rule.
 *
 * @param {number} teamId
 * @param {number} lineupId
 * @returns {Promise<void>}
 */
async function _applyLineupToTeam (teamId, lineupId) {
  const [lineup] = await query('SELECT * FROM team_lineup WHERE id=? AND team_id=? LIMIT 1', [lineupId, teamId])
  if (!lineup) return

  await query(
    'UPDATE team SET formation=?, pass_style=?, play_style=?, attack_mode=? WHERE id=?',
    [
      lineup.formation,
      lineup.pass_style || 'mixed',
      lineup.play_style || 'normal',
      lineup.attack_mode || 'balanced',
      teamId
    ]
  )
  await query("UPDATE player SET in_game_position='', bench_position=NULL WHERE team_id=?", [teamId])

  const saved = await query('SELECT * FROM team_lineup_player WHERE lineup_id=?', [lineupId])
  if (saved.length === 0) {
    await query('UPDATE team SET captain_id=NULL WHERE id=?', [teamId])
    return
  }
  const squad = await query('SELECT id, tour_days_left FROM player WHERE team_id=?', [teamId])
  // Travelling players count as "not in the squad" here: their slots were
  // cleared when they left, and a snapshot taken before the trip must not sneak
  // them back onto the pitch or the bench (see TA-TOUR-09).
  const squadIds = new Set(squad.filter(p => !(Number(p.tour_days_left) > 0)).map(p => p.id))

  const openSlots = [...(getPositionsOfFormation(lineup.formation) || [])]
  const takenBench = new Set()
  const placedIds = new Set()

  for (const row of saved) {
    if (!squadIds.has(row.player_id)) continue
    if (row.in_game_position) {
      const idx = openSlots.indexOf(row.in_game_position)
      if (idx === -1) continue
      openSlots.splice(idx, 1)
      await query('UPDATE player SET in_game_position=?, bench_position=NULL WHERE id=?', [row.in_game_position, row.player_id])
      placedIds.add(row.player_id)
    } else if (row.bench_position) {
      if (takenBench.has(row.bench_position)) continue
      takenBench.add(row.bench_position)
      await query(
        "UPDATE player SET bench_position=?, bench_substitution_mode=?, in_game_position='' WHERE id=?",
        [row.bench_position, row.bench_substitution_mode || 'injury_only', row.player_id]
      )
    }
  }

  const captainId = lineup.captain_id
  const captainValid = captainId && placedIds.has(captainId)
  await query('UPDATE team SET captain_id=? WHERE id=?', [captainValid ? captainId : null, teamId])
}
