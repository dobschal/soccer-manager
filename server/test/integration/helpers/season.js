// Shared helpers for the integration-level scenario tests.
//
// All of these hit the **real** lib/database.js#query against the throwaway
// schema set up by ./../setup.js. Nothing is mocked at this layer.

import { query } from '../../../lib/database.js'
import { calculateGames } from '../../../play-game-day.js'
import { calculateStanding } from '../../../lib/util.js'
import authRoute from '../../../routes/auth.js'
import teamChoiceRoute from '../../../routes/teamChoice.js'

/** Minimal request object accepted by routes that read req.user / req.locale. */
export function makeReq ({ userId = null, locale = 'en' } = {}) {
  const req = { locale }
  if (userId !== null) req.user = { id: userId }
  return req
}

/**
 * Register a brand-new account (no email, so no verification dance) and
 * return the resulting user id.
 * @param {string} username
 * @param {string} [password]
 * @returns {Promise<number>}
 */
export async function registerUser (username, password = 'integration1234') {
  await authRoute.createAccount(username, password, null, makeReq())
  const [row] = await query('SELECT id FROM user WHERE username=?', [username])
  if (!row) throw new Error(`registerUser: could not find newly created user ${username}`)
  return row.id
}

/**
 * Pick an arbitrary available choosable bot team for `userId`. Returns the
 * team that was taken over. Mirrors the flow a real new player goes through
 * after signup.
 * @param {number} userId
 * @returns {Promise<{ id: number, level: number, league: number }>}
 */
export async function pickAnyAvailableTeam (userId) {
  const req = makeReq({ userId })
  const { teams } = await teamChoiceRoute.getAvailableTeams(req)
  if (!teams.length) throw new Error(`pickAnyAvailableTeam: no choosable teams for user ${userId}`)
  const target = teams[0]
  await teamChoiceRoute.chooseTeam(target.id, req)
  return { id: target.id, level: target.level, league: target.league }
}

/**
 * Convenience: register and immediately pick a team. Returns the team info
 * so callers can assert which league the user ended up in.
 * @param {string} username
 * @returns {Promise<{ userId: number, team: { id: number, level: number, league: number } }>}
 */
export async function registerAndPickTeam (username) {
  const userId = await registerUser(username)
  const team = await pickAnyAvailableTeam(userId)
  return { userId, team }
}

/**
 * Play exactly one game day via the real calculateGames pipeline.
 * @returns {Promise<void>}
 */
export async function simulateOneGameDay () {
  await calculateGames({ skipPushNotifications: true })
}

/**
 * Simulate game days until every league game in `season` is played. Used
 * by the season-transition E2E test to drive a complete league season.
 * @param {number} season
 * @param {number} [safetyMax]
 * @returns {Promise<number>} number of game days played
 */
export async function simulateUntilSeasonComplete (season, safetyMax = 80) {
  let dayCount = 0
  for (let i = 0; i < safetyMax; i++) {
    const [{ amount }] = await query(
      "SELECT COUNT(*) AS amount FROM game WHERE season=? AND played=0 AND (game_type='league' OR game_type IS NULL)",
      [season]
    )
    if (amount === 0) return dayCount
    await simulateOneGameDay()
    dayCount++
  }
  throw new Error(`simulateUntilSeasonComplete: season ${season} still has unplayed league games after ${safetyMax} game days`)
}

/**
 * Standings for a single (level, league) of one season. Uses the same
 * calculateStanding logic that promotion/relegation reads from.
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<Array<{team: object, points: number}>>}
 */
export async function getLeagueStanding (season, level, league) {
  const games = await query(
    "SELECT * FROM game WHERE season=? AND level=? AND league=? AND (game_type='league' OR game_type IS NULL)",
    [season, level, league]
  )
  // Same filtering as _promotionRelegation: only the teams that actually
  // appear in this league's games, otherwise zero-stat outsiders pollute the
  // bottom positions.
  const leagueTeamIds = new Set()
  for (const g of games) {
    if (g.team_1_id) leagueTeamIds.add(g.team_1_id)
    if (g.team_2_id) leagueTeamIds.add(g.team_2_id)
  }
  // ORDER BY id so we match the order the promotion code sees (it does the
  // same select without ORDER BY, but mysql happens to return ascending by
  // id for this table; making it explicit keeps tie-break behaviour stable
  // across runs).
  const teams = await query(
    `SELECT * FROM team WHERE id IN (${[...leagueTeamIds].join(',') || '0'}) ORDER BY id ASC`
  )
  return calculateStanding(games, teams)
}

/**
 * Capture (level, league) for each non-system team, keyed by team id.
 * Useful to diff "before vs after promotion".
 * @returns {Promise<Map<number, { level: number, league: number }>>}
 */
export async function snapshotTeamLevels () {
  const teams = await query('SELECT id, level, league FROM team WHERE is_system_team = 0')
  return new Map(teams.map(t => [t.id, { level: t.level, league: t.league }]))
}
