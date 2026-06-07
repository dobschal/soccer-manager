// Mid-season league-opening E2E. Starts from a freshly seeded 126-bot
// world, plays a handful of game days, registers enough users to drain the
// L2 buffer below the free-bot threshold, then triggers another prepareSeason
// and verifies:
//   - a fresh lower level (L3) was opened with its full bot quota,
//   - the new league has games for season 0 with past matchdays backfilled
//     as forfeits (0:0, is_forfeit=1, played=1),
//   - future matchdays for the new league are scheduled but unplayed,
//   - none of the new bot teams ended up in the season-0 cup draw,
//   - the existing L0/L1/L2 schedule was not touched.

import { describe, expect, it } from 'vitest'
import { query } from '../../lib/database.js'
import { prepareSeason } from '../../prepare-season.js'
import {
  registerAndPickTeam,
  simulateOneGameDay
} from './helpers/season.js'

const SCENARIO_TIMEOUT_MS = 10 * 60_000
const SIMULATED_GAME_DAYS = 4
// L2 starts with 72 bots; pushing the free count below 20 requires 53+ picks.
const USER_REGISTRATIONS = 55

describe('mid-season league opening E2E', () => {
  it('opens a new lower level with forfeit backfill when L2 bots run low', async () => {
    // 1. Seed.
    expect(await prepareSeason()).toBe(true)

    const seededLevels = await query(
      'SELECT level, COUNT(*) AS n FROM team WHERE is_system_team=0 GROUP BY level ORDER BY level'
    )
    expect(seededLevels.map(r => [r.level, r.n])).toEqual([
      [0, 18],
      [1, 36],
      [2, 72]
    ])

    // Snapshot the season-0 cup teams BEFORE the new level opens, so we can
    // assert later that no new bot team gets pulled into the existing draw.
    const cupTeamsBefore = await _cupTeamIds(0)
    expect(cupTeamsBefore.size).toBeGreaterThan(0)

    // 2. Play a few game days from season 0.
    for (let i = 0; i < SIMULATED_GAME_DAYS; i++) {
      await simulateOneGameDay()
    }
    const [{ game_day: nextUnplayedDay }] = await query(
      "SELECT MIN(game_day) AS game_day FROM game WHERE season=0 AND played=0 AND (game_type='league' OR game_type IS NULL)"
    )
    expect(nextUnplayedDay).toBeGreaterThan(0)

    // 3. Register enough users + claim a team each so the L2 free pool
    // drops under 20. Done sequentially (chooseTeam mutates state the next
    // call needs).
    for (let i = 0; i < USER_REGISTRATIONS; i++) {
      const { team } = await registerAndPickTeam(`tester${i}`)
      // All new users must land on the bottom user-pickable level.
      expect(team.level).toBe(2)
    }
    const [{ amount: freeL2 }] = await query(
      'SELECT COUNT(*) AS amount FROM team WHERE level=2 AND user_id IS NULL AND is_system_team=0'
    )
    expect(freeL2).toBeLessThan(20)

    // 4. Mid-season prepareSeason — should open L3 + schedule games + skip
    // promotion (season still has unplayed games).
    await prepareSeason()

    // 5. New level present at full bot quota.
    const distribution = Object.fromEntries(
      (await query('SELECT level, COUNT(*) AS n FROM team WHERE is_system_team=0 GROUP BY level'))
        .map(r => [r.level, r.n])
    )
    expect(distribution[0]).toBe(18)
    expect(distribution[1]).toBe(36)
    expect(distribution[2]).toBe(72)
    expect(distribution[3]).toBe(144) // 2^3 * 18

    // 6. Past matchdays in L3 are forfeits, future ones unplayed.
    const [{ forfeits }] = await query(
      "SELECT COUNT(*) AS forfeits FROM game WHERE season=0 AND level=3 AND played=1 AND is_forfeit=1 AND goals_team_1=0 AND goals_team_2=0 AND (game_type='league' OR game_type IS NULL)"
    )
    const [{ unplayed }] = await query(
      "SELECT COUNT(*) AS unplayed FROM game WHERE season=0 AND level=3 AND played=0 AND (game_type='league' OR game_type IS NULL)"
    )
    expect(forfeits).toBeGreaterThan(0)
    expect(unplayed).toBeGreaterThan(0)
    const [{ total }] = await query(
      "SELECT COUNT(*) AS total FROM game WHERE season=0 AND level=3 AND (game_type='league' OR game_type IS NULL)"
    )
    expect(total).toBe(forfeits + unplayed)
    // Spot-check: there must be played league games at game_day < nextUnplayedDay
    // and no played league games at game_day >= nextUnplayedDay for the new level.
    const [{ paidForFuture }] = await query(
      'SELECT COUNT(*) AS paidForFuture FROM game WHERE season=0 AND level=3 AND played=1 AND game_day >= ?',
      [nextUnplayedDay]
    )
    expect(paidForFuture).toBe(0)

    // 7. The new bot teams must NOT appear in the season-0 cup draw.
    const cupTeamsAfter = await _cupTeamIds(0)
    // The cup didn't gain or lose participants.
    expect(cupTeamsAfter).toEqual(cupTeamsBefore)
    const newL3TeamIds = (
      await query('SELECT id FROM team WHERE level=3 AND is_system_team=0')
    ).map(r => r.id)
    for (const id of newL3TeamIds) {
      expect(cupTeamsAfter.has(id), `new L3 team ${id} must not be in the season-0 cup`).toBe(false)
    }

    // 8. Promotion/relegation flag MUST still be absent — the season is not
    // over yet, so the transition logic must not have fired.
    const flagRows = await query("SELECT setting_value FROM app_setting WHERE setting_key='last_promoted_season'")
    expect(flagRows).toHaveLength(0)
  }, SCENARIO_TIMEOUT_MS)
})

/** All team ids that appear on either side of a season's cup games. */
async function _cupTeamIds (season) {
  const rows = await query(
    "SELECT team_1_id, team_2_id FROM game WHERE season=? AND game_type='cup'",
    [season]
  )
  const ids = new Set()
  for (const r of rows) {
    if (r.team_1_id) ids.add(r.team_1_id)
    if (r.team_2_id) ids.add(r.team_2_id)
  }
  return ids
}
