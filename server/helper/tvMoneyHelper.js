import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { getCachedStanding } from './standingHelper.js'

const BASE_TV_MONEY_LEVEL_1 = 150000
const TV_MONEY_LEVEL_FACTOR = 0.75
export const LEAGUE_GAME_DAYS_PER_SEASON = 34

/**
 * Base TV money for a given league level. Levels are 0-indexed in the
 * database: level 0 = 1. Liga (150000), and each lower league gets 75% of
 * the level above it (level 1 = 112500, level 2 = 84375, ...).
 * @param {number} level - 0-based league level
 * @returns {number}
 */
export function getTvMoneyBaseForLevel (level) {
  if (level == null || level < 0) return 0
  return Math.round(BASE_TV_MONEY_LEVEL_1 * Math.pow(TV_MONEY_LEVEL_FACTOR, level))
}

/**
 * Payout for a team at position `rank` (1-based) in a league of `totalTeams`
 * teams at the given level. Last place gets the base, second-to-last gets 2x
 * base, ..., first place gets `totalTeams * base`.
 * @param {number} level
 * @param {number} rank - 1-based position in the standing
 * @param {number} totalTeams
 * @returns {number}
 */
export function calculateTvMoneyForRank (level, rank, totalTeams) {
  if (!totalTeams || rank < 1 || rank > totalTeams) return 0
  const base = getTvMoneyBaseForLevel(level)
  const multiplier = totalTeams - rank + 1
  return base * multiplier
}

/**
 * Find a team's 1-based rank in a standing array (sorted from best to worst).
 * Returns null if the team is not in the standing.
 * @param {Array<{team: {id: number}}>} standing
 * @param {number} teamId
 * @returns {number | null}
 */
function _findTeamRank (standing, teamId) {
  if (!Array.isArray(standing)) return null
  const idx = standing.findIndex(entry => entry?.team?.id === teamId)
  return idx < 0 ? null : idx + 1
}

/**
 * Build a live standing for the team's current league using all played league
 * games this season — used to estimate the TV money payout before the season
 * is over.
 * @param {TeamType} team
 * @param {number} season
 * @returns {Promise<{rank: number | null, totalTeams: number}>}
 */
async function _getCurrentLeagueStanding (team, season) {
  const games = await query(
    `SELECT * FROM game
     WHERE season=? AND level=? AND league=? AND played=1
     AND (game_type='league' OR game_type IS NULL)`,
    [season, team.level, team.league]
  )

  const teamIds = new Set()
  for (const g of games) {
    teamIds.add(g.team_1_id)
    teamIds.add(g.team_2_id)
  }
  // Always include the team itself even if no games have been played yet
  teamIds.add(team.id)

  const teams = await query(
    `SELECT * FROM team WHERE id IN (${[...teamIds].map(() => '?').join(',')})`,
    [...teamIds]
  )

  const standing = calculateStanding(games, teams)
  const rank = _findTeamRank(standing, team.id)
  return { rank, totalTeams: teams.length }
}

/**
 * Estimate TV money for a team based on the current standing of its league.
 * @param {TeamType} team
 * @param {number} season
 * @returns {Promise<{base: number, level: number, rank: number | null, totalTeams: number, estimatedValue: number}>}
 */
export async function getEstimatedTvMoney (team, season) {
  const base = getTvMoneyBaseForLevel(team.level)
  const { rank, totalTeams } = await _getCurrentLeagueStanding(team, season)
  const estimatedValue = rank ? calculateTvMoneyForRank(team.level, rank, totalTeams) : 0
  return {
    base,
    level: team.level,
    rank,
    totalTeams,
    estimatedValue
  }
}

/**
 * Check whether the league season is "complete" — i.e. every league game for
 * the season has been played. Used to gate the season-end TV money payout.
 * @param {number} season
 * @returns {Promise<boolean>}
 */
async function _isLeagueSeasonComplete (season) {
  const [row] = await query(
    `SELECT COUNT(*) AS total, SUM(played) AS played
     FROM game
     WHERE season=? AND (game_type='league' OR game_type IS NULL)`,
    [season]
  )
  if (!row || row.total === 0) return false
  return Number(row.total) === Number(row.played)
}

/**
 * Resolve the final standing for a (season, level, league) using the cached
 * standing from the last game day of that league. Falls back to computing it
 * live if no cache exists.
 * @param {number} season
 * @param {number} level
 * @param {number} league
 * @returns {Promise<Array | null>}
 */
async function _getFinalStanding (season, level, league) {
  const [lastDay] = await query(
    'SELECT MAX(game_day) AS maxDay FROM standing_cache WHERE season=? AND level=? AND league=?',
    [season, level, league]
  )
  if (lastDay?.maxDay != null) {
    const cached = await getCachedStanding(lastDay.maxDay, season, level, league)
    if (cached?.length) return cached
  }

  // Fallback: compute from played games
  const games = await query(
    `SELECT * FROM game
     WHERE season=? AND level=? AND league=? AND played=1
     AND (game_type='league' OR game_type IS NULL)`,
    [season, level, league]
  )
  if (games.length === 0) return null
  const teamIds = new Set()
  for (const g of games) {
    teamIds.add(g.team_1_id)
    teamIds.add(g.team_2_id)
  }
  const teams = await query(
    `SELECT * FROM team WHERE id IN (${[...teamIds].map(() => '?').join(',')})`,
    [...teamIds]
  )
  return calculateStanding(games, teams)
}

/**
 * Pay out TV money to every team based on their final standing. Should be
 * called once at the end of the league season. The caller is responsible for
 * triggering this exactly once per season (we currently call it from the cron
 * after the final league game day is played).
 *
 * Iterates every (level, league) for which a standing exists and credits each
 * team in that standing.
 *
 * @param {number} gameDay - current game day (for the finance_log entry)
 * @param {number} season
 * @param {object} [deps]
 * @param {(team: TeamType, value: number, reason: string, gameDay: number, season: number) => Promise<void>} [deps.updateTeamBalance]
 * @param {(userId: number) => Promise<string>} [deps.getUserLocale]
 * @param {(key: string, params?: object, locale?: string) => string} [deps.t]
 * @returns {Promise<void>}
 */
export async function payOutTvMoneyForSeason (gameDay, season, deps = {}) {
  const {
    updateTeamBalance,
    getUserLocale,
    t
  } = deps

  if (!(await _isLeagueSeasonComplete(season))) return

  const levelLeagues = await query(
    `SELECT DISTINCT level, league FROM game
     WHERE season=? AND (game_type='league' OR game_type IS NULL)
     ORDER BY level ASC, league ASC`,
    [season]
  )

  for (const { level, league } of levelLeagues) {
    const standing = await _getFinalStanding(season, level, league)
    if (!standing?.length) continue
    const totalTeams = standing.length
    for (let i = 0; i < standing.length; i++) {
      const entry = standing[i]
      const team = entry?.team
      if (!team?.id) continue
      const [fullTeam] = await query('SELECT * FROM team WHERE id=?', [team.id])
      if (!fullTeam || fullTeam.is_system_team) continue
      const rank = i + 1
      const value = calculateTvMoneyForRank(level, rank, totalTeams)
      if (!value) continue
      // Idempotency: claim the (season, team) slot before paying. If another
      // run already inserted a row, INSERT IGNORE leaves affectedRows at 0 and
      // we skip the balance update.
      const result = await query(
        `INSERT IGNORE INTO tv_money_payout (season, team_id, level, league, rank_in_league, value)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [season, fullTeam.id, level, league, rank, value]
      )
      if (!result?.affectedRows) continue
      const locale = fullTeam.user_id ? await getUserLocale(fullTeam.user_id) : undefined
      const reason = t('finance.tvMoney', { rank, level: level + 1 }, locale)
      await updateTeamBalance(fullTeam, value, reason, gameDay, season)
    }
  }
}
