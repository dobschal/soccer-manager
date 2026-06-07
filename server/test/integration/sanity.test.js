// Plumbing-only test for the integration-suite scaffolding.
// Verifies that:
//   - a throwaway DB was created and migrations ran (tables exist),
//   - the app's query() actually hits that DB (write + read),
//   - module-level seed data from migrations is in place
//     (the IOC system team is inserted by the migration script).
//
// Does NOT exercise prepareSeason / calculateGames / cup logic — those are
// for the dedicated scenario tests added in Phase B.

import { describe, expect, it } from 'vitest'
import { query } from '../../lib/database.js'

describe('integration test scaffolding', () => {
  it('connects to a fresh test database with the migrated schema', async () => {
    const rows = await query('SELECT DATABASE() AS db')
    expect(rows[0].db).toBe(process.env.DB_NAME)
    expect(rows[0].db).toMatch(/^soccer_test_/)
  })

  it('expected tables exist after migration', async () => {
    const rows = await query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [process.env.DB_NAME]
    )
    const names = new Set(rows.map(r => r.name))
    for (const required of ['team', 'player', 'game', 'stadium', 'building', 'app_setting']) {
      expect(names.has(required), `expected table "${required}" to exist`).toBe(true)
    }
  })

  it('round-trips a row through the real query() implementation', async () => {
    await query("INSERT INTO app_setting (setting_key, setting_value) VALUES ('integration_smoke', 'ok')")
    const rows = await query("SELECT setting_value AS v FROM app_setting WHERE setting_key='integration_smoke'")
    expect(rows[0].v).toBe('ok')
  })

  it('seeds the International Oversea Club via migrations', async () => {
    const rows = await query('SELECT name, is_system_team FROM team WHERE is_system_team = 1')
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('International Oversea Club')
  })
})
