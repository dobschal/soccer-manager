// Runs the real getPlayerHistory query against MySQL.
//
// Regression guard for ER_CANT_AGGREGATE_2COLLATIONS: the transfer-fee
// subquery compares a CAST(... AS CHAR) against the utf8mb4_unicode_ci column
// `player_history.value`. A bare CAST inherits the *connection* collation, so
// the statement only blows up on a real connection — every unit test mocks
// query() and would happily pass.

import { describe, expect, it } from 'vitest'
import { query } from '../../lib/database.js'
import handlers from '../../routes/players.js'

describe('getPlayerHistory against a real database', () => {
  it('joins the transfer fee without a collation clash', async () => {
    const { insertId: teamId } = await query(
      "INSERT INTO team (name, level, league) VALUES ('Collation FC', 1, 1)"
    )
    const { insertId: playerId } = await query(
      'INSERT INTO player (team_id, name, level, position) VALUES (?, ?, 5, ?)',
      [teamId, 'Colin Collation', 'goalkeeper']
    )
    await query(
      'INSERT INTO player_history (player_id, type, value, season, game_day) VALUES (?, ?, ?, 3, 7)',
      [playerId, 'TRANSFER', String(teamId)]
    )
    await query(
      'INSERT INTO trade_history (player_id, from_team_id, to_team_id, price, season, game_day) VALUES (?, NULL, ?, 250000, 3, 7)',
      [playerId, teamId]
    )

    const history = await handlers.getPlayerHistory(playerId)

    expect(history).toHaveLength(1)
    expect(history[0].type).toBe('TRANSFER')
    expect(history[0].price).toBe(250000)
  })

  it('leaves non-transfer entries without a price', async () => {
    const { insertId: playerId } = await query(
      'INSERT INTO player (name, level, position) VALUES (?, 5, ?)',
      ['Lenny Level', 'striker']
    )
    await query(
      'INSERT INTO player_history (player_id, type, value, season, game_day) VALUES (?, ?, ?, 3, 7)',
      [playerId, 'LEVEL_UP', '6']
    )

    const history = await handlers.getPlayerHistory(playerId)

    expect(history).toHaveLength(1)
    expect(history[0].price).toBeNull()
  })

  it('keeps every table on utf8mb4_unicode_ci after migration', async () => {
    const rows = await query(
      `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_TYPE = 'BASE TABLE'
         AND TABLE_COLLATION <> 'utf8mb4_unicode_ci'`
    )
    expect(rows.map(r => `${r.name}: ${r.collation_name}`)).toEqual([])
  })
})
