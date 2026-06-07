// Cup vs. league scheduling E2E. Parametrized over team counts so we can
// prove the schedule generator behaves correctly regardless of how many
// parallel leagues exist. For every scenario:
//   - cup game_days and league game_days must be disjoint,
//   - every cup game_day must fall inside the league window
//     (≤ the highest league game_day),
//   - cup_round 1 (the final) is the latest cup matchday, and the bracket
//     halves cleanly all the way down (later round = bigger game_day).
//
// Each test resets the schema slice it cares about and re-seeds, so the
// scenarios share the test database without interference.

import { beforeEach, describe, expect, it } from 'vitest'
import { query } from '../../lib/database.js'
import { prepareSeason } from '../../prepare-season.js'
import {
  getLatestSeason,
  seedBotTeamsAtLevels,
  TEAMS_PER_LEAGUE,
  wipeSeasonState
} from './helpers/season.js'

const LEAGUE_GAME_DAYS = (TEAMS_PER_LEAGUE - 1) * 2 // 34

/**
 * The cap "passt in den Liga-Betrieb bis zum 34. Spieltag" means: across all
 * cup rounds, the highest cup game_day must still sit within the same
 * actual-game-day window that the league occupies. Concretely, no cup
 * matchday can come after the league's last matchday.
 */
function quotaFor (leagueCount) {
  const result = {}
  let remaining = leagueCount
  for (let level = 0; remaining > 0; level++) {
    const cap = Math.pow(2, level) // L0=1, L1=2, L2=4, L3=8, L4=16, ...
    const take = Math.min(cap, remaining)
    result[level] = take * TEAMS_PER_LEAGUE
    remaining -= take
  }
  return result
}

const SCENARIOS = [
  { name: '3 parallel leagues (54 teams, L0..L1 + partial L2 quota)', quota: { 0: 18, 1: 36 } },
  { name: '7 parallel leagues (126 teams = L0..L2 full)', quota: quotaFor(7) },
  { name: '15 parallel leagues (270 teams = L0..L3 full)', quota: quotaFor(15) },
  { name: '31 parallel leagues (558 teams = L0..L4 full)', quota: quotaFor(31) }
]

describe('cup vs league schedule E2E', () => {
  beforeEach(async () => {
    await wipeSeasonState()
  })

  for (const scenario of SCENARIOS) {
    it(`cup fits within the league window — ${scenario.name}`, async () => {
      await seedBotTeamsAtLevels(scenario.quota)
      await prepareSeason()

      const season = await getLatestSeason()
      expect(season, 'season was scheduled by prepareSeason').not.toBeNull()

      const leagueDays = new Set(
        (await query(
          "SELECT DISTINCT game_day FROM game WHERE season=? AND (game_type='league' OR game_type IS NULL)",
          [season]
        )).map(r => r.game_day)
      )
      const cupDays = new Set(
        (await query(
          "SELECT DISTINCT game_day FROM game WHERE season=? AND game_type='cup'",
          [season]
        )).map(r => r.game_day)
      )

      // Sanity: every league has its 34 matchdays in the DB.
      expect(leagueDays.size).toBe(LEAGUE_GAME_DAYS)
      expect(cupDays.size).toBeGreaterThan(0)

      // 1. Disjointness: no game_day hosts both league and cup matches.
      for (const cupDay of cupDays) {
        expect(leagueDays.has(cupDay), `game_day ${cupDay} is used by both league and cup`).toBe(false)
      }

      // 2. Cup fits within the league window — the final cup day must
      //    not come after the league's last matchday.
      const lastLeagueDay = Math.max(...leagueDays)
      const lastCupDay = Math.max(...cupDays)
      expect(lastCupDay, 'cup runs past the league window').toBeLessThanOrEqual(lastLeagueDay)

      // 3. Bracket order: cup_round halves as the bracket progresses, so the
      //    final (round=1) must sit at the highest cup game_day, and every
      //    smaller round number is on a later/equal game_day.
      const roundRows = await query(
        "SELECT DISTINCT cup_round, game_day FROM game WHERE season=? AND game_type='cup' ORDER BY cup_round DESC",
        [season]
      )
      let previousDay = -1
      let previousRound = Infinity
      for (const { cup_round: round, game_day: day } of roundRows) {
        expect(round).toBeLessThan(previousRound)
        expect(day, `cup_round ${round} game_day ${day} should be >= previous round day ${previousDay}`).toBeGreaterThan(previousDay)
        previousDay = day
        previousRound = round
      }
      // The final (round=1) is the very last cup game_day.
      const finalDay = roundRows[roundRows.length - 1].game_day
      expect(finalDay).toBe(lastCupDay)
    })
  }
})
