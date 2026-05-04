import { query } from '../lib/database.js'

/**
 * Mark a game as seen by a team.
 * Idempotent: re-marking is a no-op thanks to the unique key.
 * @param {number} teamId
 * @param {number} gameId
 * @returns {Promise<void>}
 */
export async function markGameAsSeen (teamId, gameId) {
  if (!teamId || !gameId) return
  await query(
    'INSERT IGNORE INTO seen_game (team_id, game_id) VALUES (?, ?)',
    [teamId, gameId]
  )
}

/**
 * Get the set of game IDs that the given team has already seen
 * out of the provided list.
 * @param {number} teamId
 * @param {number[]} gameIds
 * @returns {Promise<Set<number>>}
 */
export async function getSeenGameIds (teamId, gameIds) {
  if (!teamId || !gameIds || gameIds.length === 0) return new Set()
  const rows = await query(
    'SELECT game_id FROM seen_game WHERE team_id = ? AND game_id IN (?)',
    [teamId, gameIds]
  )
  return new Set(rows.map(r => r.game_id))
}
