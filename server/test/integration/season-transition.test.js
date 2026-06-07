// Full season-transition E2E. Seeds a fresh schema, lets prepareSeason
// build the initial 126-team / 3-level world, simulates every league
// matchday of season 0 through the real `calculateGames` pipeline, then
// triggers prepareSeason a second time and asserts the promotion /
// relegation outcome against the season-0 standings.
//
// Slow on purpose (real game engine across 34 league match days plus
// interleaved cup days), so the suite-wide testTimeout is bumped in
// vitest.integration.config.js. Run with:
//
//   docker compose up database -d
//   npm run test:integration

import { describe, expect, it } from 'vitest'
import { query } from '../../lib/database.js'
import { prepareSeason } from '../../prepare-season.js'
import {
  getLeagueStanding,
  simulateUntilSeasonComplete,
  snapshotTeamLevels
} from './helpers/season.js'

const SEASON_TIMEOUT_MS = 15 * 60_000

describe('season transition E2E', () => {
  it('promotes top 2 / relegates bottom 4 across every level after a full season', async () => {
    // 1. Seed: prepareSeason on an empty DB creates 126 bots (L0/L1/L2 full),
    // schedules season 0, and creates the cup draw.
    expect(await prepareSeason()).toBe(true)

    const seededLevels = await query(
      'SELECT level, COUNT(*) AS n FROM team WHERE is_system_team=0 GROUP BY level ORDER BY level'
    )
    expect(seededLevels.map(r => [r.level, r.n])).toEqual([
      [0, 18],
      [1, 36],
      [2, 72]
    ])
    expect(await _maxSeason()).toBe(0)

    // 2. Run every season-0 league matchday through the real engine.
    const daysPlayed = await simulateUntilSeasonComplete(0)
    expect(daysPlayed).toBeGreaterThanOrEqual(34)

    // 3. Capture expectations *after* the season is played (standings need
    // games) but *before* prepareSeason shifts the team levels.
    const before = await snapshotTeamLevels()
    const expectations = await _captureExpectedMoves(0, before)

    // After every league game is played, _newGamesNeeded returns true on the
    // next prepareSeason call -> promotion/relegation fires.
    await prepareSeason()

    // 4. Promotion/relegation outcome matches the season-0 standings.
    const after = await snapshotTeamLevels()

    // Idempotency flag for season 0 must be set.
    const [flag] = await query("SELECT setting_value FROM app_setting WHERE setting_key='last_promoted_season'")
    expect(flag?.setting_value).toBe('0')

    // For every (level, league) of season 0, verify the right team-ids moved.
    for (const exp of expectations) {
      for (const teamId of exp.expectedPromoted) {
        const a = after.get(teamId)
        expect(a, `team ${teamId} should be in the new state`).toBeDefined()
        expect(a.level, `team ${teamId} (top-2 in L${exp.level}-LG${exp.league}) should be promoted to ${exp.level - 1}`).toBe(exp.level - 1)
      }
      for (const teamId of exp.expectedRelegated) {
        const a = after.get(teamId)
        expect(a, `team ${teamId} should be in the new state`).toBeDefined()
        expect(a.level, `team ${teamId} (bottom-4 in L${exp.level}-LG${exp.league}) should be relegated to ${exp.level + 1}`).toBe(exp.level + 1)
      }
    }

    // Sanity: counts per level still balance — promotion+relegation must
    // not change the total team count nor any level's quota.
    const afterLevels = await query(
      'SELECT level, COUNT(*) AS n FROM team WHERE is_system_team=0 GROUP BY level ORDER BY level'
    )
    const distribution = Object.fromEntries(afterLevels.map(r => [r.level, r.n]))
    expect(distribution[0]).toBe(18)
    expect(distribution[1]).toBe(36)
    expect(distribution[2]).toBe(72)

    // Season 1 games were scheduled.
    expect(await _maxSeason()).toBe(1)
    const [{ amount: s1Games }] = await query(
      "SELECT COUNT(*) AS amount FROM game WHERE season=1 AND (game_type='league' OR game_type IS NULL)"
    )
    expect(s1Games).toBeGreaterThan(0)
  }, SEASON_TIMEOUT_MS)
})

async function _maxSeason () {
  const rows = await query('SELECT MAX(season) AS s FROM game')
  return rows[0].s
}

/**
 * Capture, BEFORE we trigger the transition, which team ids should be
 * promoted / relegated per (level, league) for season 0 based on the
 * standings computed off the just-played games. The promotion logic in
 * prepare-season.js applies the same `calculateStanding` ordering, so by
 * snapshotting expectations here we can prove the transition produced the
 * exact same outcome.
 */
async function _captureExpectedMoves (season, beforeMap) {
  const rows = await query(
    "SELECT DISTINCT level, league FROM game WHERE season=? AND (game_type='league' OR game_type IS NULL)",
    [season]
  )
  const maxLevel = Math.max(...rows.map(r => r.level))
  const result = []
  for (const { level, league } of rows) {
    const standing = await getLeagueStanding(season, level, league)
    // The promotion code drops both filters separately:
    //   - top 2 only promote if level > 0
    //   - bottom 4 only relegate if level < hightestLevel
    const expectedPromoted = level > 0 ? [standing[0].team.id, standing[1].team.id] : []
    const expectedRelegated = level < maxLevel
      ? [standing[17].team.id, standing[16].team.id, standing[15].team.id, standing[14].team.id]
      : []
    // Sanity: the team must currently sit at `level` in our before-snapshot.
    for (const tid of [...expectedPromoted, ...expectedRelegated]) {
      expect(beforeMap.get(tid)?.level, `team ${tid} should be on level ${level} before transition`).toBe(level)
    }
    result.push({ level, league, expectedPromoted, expectedRelegated })
  }
  return result
}
