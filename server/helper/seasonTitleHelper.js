import { query } from '../lib/database.js'

const CUP_LEVEL_SENTINEL = -1
const CUP_LEAGUE_SENTINEL = -1

/**
 * Check whether the league season is "complete" — i.e. every league game with
 * the lowest existing level is played. Mirrors the season-detection rule used
 * by the Hall of Fame UI.
 * @param {number} season
 * @returns {Promise<boolean>}
 */
async function _isLeagueSeasonComplete (season) {
  const [row] = await query(
    `SELECT COUNT(*) AS total, SUM(played) AS played
     FROM game
     WHERE season=? AND (game_type='league' OR game_type IS NULL) AND level=1`,
    [season]
  )
  if (!row || row.total === 0) return false
  return Number(row.total) === Number(row.played)
}

/**
 * Record the champion of every (level, league) standing for a completed season.
 * Reads user_id from the standing_cache snapshot (frozen at the time the cache
 * was written) so that a later bot takeover does not retroactively assign the
 * title to the new owner.
 * Idempotent: existing rows are left untouched.
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function recordLeagueChampionsForSeason (season) {
  if (!(await _isLeagueSeasonComplete(season))) return

  const levelLeagues = await query(
    'SELECT DISTINCT level, league FROM standing_cache WHERE season=? ORDER BY level ASC, league ASC',
    [season]
  )

  for (const { level, league } of levelLeagues) {
    const [lastGameDay] = await query(
      'SELECT MAX(game_day) AS maxDay FROM standing_cache WHERE season=? AND level=? AND league=?',
      [season, level, league]
    )
    if (lastGameDay?.maxDay == null) continue

    const [cached] = await query(
      'SELECT data FROM standing_cache WHERE season=? AND game_day=? AND level=? AND league=?',
      [season, lastGameDay.maxDay, level, league]
    )
    if (!cached?.data) continue

    let standing
    try { standing = JSON.parse(cached.data) } catch { continue }
    const topTeam = standing[0]
    if (!topTeam?.team?.id) continue

    await query(
      `INSERT IGNORE INTO season_title (season, title_type, level, league, team_id, user_id)
       VALUES (?, 'champion', ?, ?, ?, ?)`,
      [season, level, league, topTeam.team.id, topTeam.team.user_id ?? null]
    )
  }
}

/**
 * Record the cup winner for a season — but only if the cup final (cup_round=1)
 * has been played. user_id is captured from the team table at the moment of
 * this call, which is invoked from the game-day cron immediately after the
 * final game is played, so it reflects the winner at the time of victory.
 * Idempotent: existing rows are left untouched.
 * @param {number} season
 * @returns {Promise<void>}
 */
export async function recordCupWinnerForSeason (season) {
  const [finalGame] = await query(
    `SELECT g.goals_team_1, g.goals_team_2,
            t1.id AS t1Id, t1.user_id AS t1UserId,
            t2.id AS t2Id, t2.user_id AS t2UserId
     FROM game g
     JOIN team t1 ON t1.id = g.team_1_id
     JOIN team t2 ON t2.id = g.team_2_id
     WHERE g.season=? AND g.game_type='cup' AND g.cup_round=1 AND g.played=1`,
    [season]
  )
  if (!finalGame) return

  const team1Won = finalGame.goals_team_1 > finalGame.goals_team_2
  const winnerId = team1Won ? finalGame.t1Id : finalGame.t2Id
  const winnerUserId = team1Won ? finalGame.t1UserId : finalGame.t2UserId

  await query(
    `INSERT IGNORE INTO season_title (season, title_type, level, league, team_id, user_id)
     VALUES (?, 'cup_winner', ?, ?, ?, ?)`,
    [season, CUP_LEVEL_SENTINEL, CUP_LEAGUE_SENTINEL, winnerId, winnerUserId ?? null]
  )
}

/**
 * Sentinel values used to satisfy the NOT NULL unique constraint on
 * (season, title_type, level, league) for cup winners (which have no league).
 */
export const SEASON_TITLE_SENTINEL = {
  level: CUP_LEVEL_SENTINEL,
  league: CUP_LEAGUE_SENTINEL
}
