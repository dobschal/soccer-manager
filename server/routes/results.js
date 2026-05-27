import { query } from '../lib/database.js'
import { calculateStanding } from '../lib/util.js'
import { BadRequestError } from '../lib/errors.js'
import { getTeam } from '../helper/teamHelper.js'
import { getGameDayAndSeason, getTicksUntilGameDay } from '../helper/gameDayHelper.js'
import { getCachedStanding, saveStandingToCache } from '../helper/standingHelper.js'
import { CACHE_NAMESPACES, cacheKey, getCached } from '../lib/cache.js'
import { getTopScorers as getTopScorersFromCache } from '../helper/playerStatsHelper.js'
import { getTeamStatsFromCache } from '../helper/teamStatsHelper.js'
import { getTotalRoundsForSeason } from '../helper/cupHelper.js'

export default {

  /**
   * Returns the date of the team's next game.
   * @param {Request} [req]
   * @returns {Promise<{date: Date}>}
   */
  async getNextGameDate (req) {
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }

    if (!req?.user) return { date: nextTick }

    try {
      const team = await getTeam(req)
      const { season } = await getGameDayAndSeason()

      const [nextGame] = await query(
        'SELECT game_day FROM game WHERE played=0 AND season=? AND (team_1_id=? OR team_2_id=?) ORDER BY game_day ASC LIMIT 1',
        [season, team.id, team.id]
      )

      if (!nextGame) return { date: nextTick }

      const ticksAway = await getTicksUntilGameDay(season, nextGame.game_day)
      const nextGameDate = new Date(nextTick.getTime() + ticksAway * 12 * 60 * 60 * 1000)
      return { date: nextGameDate }
    } catch {
      return { date: nextTick }
    }
  },

  /**
   * @typedef {object} GameResultType
   * @property {number} id,
   * @property {number} gameDay,
   * @property {number} season,
   * @property {number} goalsTeam1,
   * @property {number} goalsTeam2,
   * @property {string} team1,
   * @property {string} team2,
   * @property {number} team1Id,
   * @property {number} team2Id,
   * @property {string} details,
   * @property {string} created_at
   */

  /**
   * @param {number} season
   * @param {number} tilMatchDay - Inclusive upper bound on match_day (1..N)
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<GameResultType[]>}
   */
  async getSeasonResults (season, tilMatchDay, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const key = cacheKey(CACHE_NAMESPACES.SEASON_RESULTS, season, tilMatchDay, actualLevel, actualLeague)

    return getCached(key, async () => {
      return await query(`
          SELECT g.id           as id,
                 g.game_day     as gameDay,
                 g.match_day    as matchDay,
                 g.season       as season,
                 g.goals_team_1 as goalsTeam1,
                 g.goals_team_2 as goalsTeam2,
                 t1.name        as team1,
                 t2.name        as team2,
                 g.team_1_id    as team1Id,
                 g.team_2_id    as team2Id,
                 g.details      as details,
                 g.created_at   as created_at
          FROM game g
                   JOIN team t1 ON t1.id = g.team_1_id
                   JOIN team t2 ON t2.id = g.team_2_id
          WHERE g.match_day <= ?
            AND g.season = ?
            AND g.level = ?
            AND g.league = ?
            AND played = 1
            AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, [tilMatchDay, season, actualLevel, actualLeague])
    })
  },

  /**
   * Returns valid filter values for the results page selects.
   * - leagues: every (level, league) combination that has league games
   * - seasons: every season that has league games for the given (level, league)
   * - matchDays: every league match day (1..N) that has games for the given (level, league, season)
   * @param {number} [level]
   * @param {number} [league]
   * @param {number} [season]
   * @returns {Promise<{leagues: Array<{level: number, league: number}>, seasons: number[], matchDays: number[]}>}
   */
  async getResultsFilters (level, league, season) {
    const hasLeague = typeof level !== 'undefined' && typeof league !== 'undefined' && level !== null && league !== null
    const hasSeason = hasLeague && typeof season !== 'undefined' && season !== null
    const [leagueRows, seasonRows, matchDayRows] = await Promise.all([
      query("SELECT DISTINCT level, league FROM game WHERE (game_type='league' OR game_type IS NULL) ORDER BY level ASC, league ASC"),
      hasLeague
        ? query("SELECT DISTINCT season FROM game WHERE level=? AND league=? AND (game_type='league' OR game_type IS NULL) ORDER BY season ASC", [level, league])
        : Promise.resolve([]),
      hasSeason
        ? query("SELECT DISTINCT match_day FROM game WHERE level=? AND league=? AND season=? AND (game_type='league' OR game_type IS NULL) AND match_day IS NOT NULL ORDER BY match_day ASC", [level, league, season])
        : Promise.resolve([])
    ])
    return {
      leagues: leagueRows.map(r => ({ level: r.level, league: r.league })),
      seasons: seasonRows.map(r => r.season),
      matchDays: matchDayRows.map(r => r.match_day)
    }
  },

  /**
   * @returns {Promise<{
   *   season: number,
   *   gameDay: number,
   *   lastPlayedLeagueMatchDay?: number,
   *   lastPlayedLeagueSeason?: number,
   *   cupRoundToday: {cupRound: number, totalRounds: number}|null,
   *   userMatchDayToday: number|null,
   *   userNextMatchDay: number|null
   * }>}
   */
  async getCurrentGameday (req) {
    const current = await getGameDayAndSeason()

    // Try to load the user's team — used for the league-specific lookups
    // below. Falls through gracefully when unauthenticated.
    let team = null
    if (req?.user) {
      try { team = await getTeam(req) } catch { /* no team: leave team null */ }
    }

    // Find the last played league game (used as the results page's default
    // match_day). Prefer the user's own league so that, on cup-only ticks
    // where another league happens to have advanced a match_day in the same
    // tick, the user still lands on the latest match_day *they* actually
    // played. Falls back to the global latest for unauthenticated callers.
    const lastPlayedSql = team
      ? "SELECT game_day, match_day, season FROM game WHERE played=1 AND (game_type='league' OR game_type IS NULL) AND level=? AND league=? ORDER BY season DESC, game_day DESC LIMIT 1"
      : "SELECT game_day, match_day, season FROM game WHERE played=1 AND (game_type='league' OR game_type IS NULL) ORDER BY season DESC, game_day DESC LIMIT 1"
    const lastPlayedParams = team ? [team.level, team.league] : []
    const [lastPlayed] = await query(lastPlayedSql, lastPlayedParams)
    if (lastPlayed) {
      current.lastPlayedLeagueMatchDay = lastPlayed.match_day
      current.lastPlayedLeagueSeason = lastPlayed.season
    }

    // Is a cup round scheduled on the current internal game day?
    const [cupToday] = await query(
      "SELECT cup_round FROM game WHERE game_type='cup' AND season=? AND game_day=? LIMIT 1",
      [current.season, current.gameDay]
    )
    if (cupToday) {
      const totalRounds = await getTotalRoundsForSeason(current.season)
      current.cupRoundToday = { cupRound: cupToday.cup_round, totalRounds }
    } else {
      current.cupRoundToday = null
    }

    // Per-user league match day for today, plus their next upcoming match day
    current.userMatchDayToday = null
    current.userNextMatchDay = null
    if (team) {
      const [todayRow] = await query(
        "SELECT match_day FROM game WHERE (game_type='league' OR game_type IS NULL) AND season=? AND level=? AND league=? AND game_day=? LIMIT 1",
        [current.season, team.level, team.league, current.gameDay]
      )
      if (todayRow) current.userMatchDayToday = todayRow.match_day

      const [nextRow] = await query(
        "SELECT match_day FROM game WHERE (game_type='league' OR game_type IS NULL) AND season=? AND level=? AND league=? AND played=0 ORDER BY game_day ASC LIMIT 1",
        [current.season, team.level, team.league]
      )
      if (nextRow) current.userNextMatchDay = nextRow.match_day
    }

    // Season end: no unplayed games left at all. getGameDayAndSeason falls back
    // to the last played game in that case, so the gameDay would be the final
    // day of the season (one beyond the user-facing last match_day after the
    // +1 the label adds). The info bar should show "Saisonende" instead of
    // an out-of-range "Spieltag N+1".
    const [{ unplayedCount }] = await query(
      'SELECT COUNT(*) AS unplayedCount FROM game WHERE played=0'
    )
    current.isSeasonEnd = unplayedCount === 0

    return current
  },

  /**
   * Get recent played games and upcoming games for the user's team (for dashboard slider)
   * @param {number} pastCount - Number of past games to fetch
   * @param {number} upcomingCount - Number of upcoming games to fetch
   * @param {Request} req
   * @returns {Promise<{pastGames: Array, upcomingGames: Array, nextGameDate: Date}>}
   */
  async getGamesForSlider (pastCount, upcomingCount, req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()

    // Get past played games for this team
    const pastGames = await query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.match_day    as matchDay,
               g.season       as season,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               t1.color       as team1Color,
               t1.emblem      as team1Emblem,
               t2.color       as team2Color,
               t2.emblem      as team2Emblem,
               g.created_at   as playedAt
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 1
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type = 'league' OR g.game_type IS NULL)
        ORDER BY g.game_day DESC
        LIMIT ?
    `, [season, team.id, team.id, pastCount])

    // Get upcoming unplayed games for this team
    const upcomingGames = await query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.match_day    as matchDay,
               g.season       as season,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               t1.color       as team1Color,
               t1.emblem      as team1Emblem,
               t2.color       as team2Color,
               t2.emblem      as team2Emblem
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 0
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type = 'league' OR g.game_type IS NULL)
        ORDER BY g.game_day ASC
        LIMIT ?
    `, [season, team.id, team.id, upcomingCount])

    // Calculate next game date (games happen at noon and midnight)
    const nextGameDate = new Date()
    nextGameDate.setHours(12)
    nextGameDate.setMinutes(0)
    nextGameDate.setSeconds(0)
    if (Date.now() > nextGameDate.getTime()) {
      nextGameDate.setHours(23)
      nextGameDate.setMinutes(59)
      nextGameDate.setSeconds(59)
    }

    // Calculate game dates for upcoming games. Each cron tick (12h) plays the
    // lowest unplayed game_day, so the tick-offset of an upcoming game is its
    // ordinal position in the sorted distinct unplayed game_days — not the raw
    // difference from the current game day (which is wrong when earlier
    // game_days were skipped or already played out of order).
    const unplayedDayRows = await query(
      'SELECT DISTINCT game_day FROM game WHERE played=0 AND season=? ORDER BY game_day ASC',
      [season]
    )
    const unplayedDays = unplayedDayRows.map(r => r.game_day)
    const upcomingGamesWithDates = upcomingGames.map((game) => {
      const gameDate = new Date(nextGameDate)
      const idx = unplayedDays.indexOf(game.gameDay)
      const ticksAway = idx < 0 ? 0 : idx
      gameDate.setTime(gameDate.getTime() + ticksAway * 12 * 60 * 60 * 1000)
      return {
        ...game,
        gameDate
      }
    })

    return {
      pastGames: pastGames.reverse(), // Oldest first
      upcomingGames: upcomingGamesWithDates,
      nextGameDate
    }
  },

  /**
   * Get the next upcoming game for the user's team
   * @param {Request} req
   * @returns {Promise<{game: GameResultType|null, nextGameDate: Date, opponent: object|null}>}
   */
  async getNextGame (req) {
    const team = await getTeam(req)
    const { season } = await getGameDayAndSeason()

    // Get the next unplayed game for this team
    const games = await query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.season       as season,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.played = 0
          AND g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
        ORDER BY g.game_day ASC
        LIMIT 1
    `, [season, team.id, team.id])

    if (games.length === 0) {
      return {
        game: null,
        nextGameDate: null,
        opponent: null
      }
    }

    const game = games[0]
    const opponentId = game.team1Id === team.id ? game.team2Id : game.team1Id
    const [opponent] = await query('SELECT * FROM team WHERE id = ?', [opponentId])

    // Calculate next game date based on offset from current game day
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }
    const ticksAway = await getTicksUntilGameDay(season, game.gameDay)
    const nextGameDate = new Date(nextTick.getTime() + ticksAway * 12 * 60 * 60 * 1000)

    return {
      game,
      nextGameDate,
      opponent
    }
  },

  /**
   * @param {number} matchDay - League match day (1..N)
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{results: GameResultType[]}>}
   */
  async getResults (matchDay, season, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    // Resolve the internal game_day for this league match_day to detect adjacent cup games
    const [matchRow] = await query(
      "SELECT game_day FROM game WHERE match_day=? AND season=? AND level=? AND league=? AND (game_type='league' OR game_type IS NULL) LIMIT 1",
      [matchDay, season, actualLevel, actualLeague]
    )
    const internalGameDay = matchRow?.game_day ?? null

    const [results, cupCheck] = await Promise.all([
      query(`
        SELECT g.id           as id,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.game_day     as gameDay,
               g.match_day    as matchDay,
               g.season       as season,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               g.is_forfeit   as isForfeit,
               g.details      as details,
               g.created_at   as created_at
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.match_day = ?
          AND g.season = ?
          AND g.level = ?
          AND g.league = ?
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, [matchDay, season, actualLevel, actualLeague]),
      internalGameDay !== null
        ? query(
          "SELECT cup_round FROM game WHERE game_day = ? AND season = ? AND game_type = 'cup' LIMIT 1",
          [internalGameDay, season]
        )
        : Promise.resolve([])
    ])
    // Extract only needed fields from details to reduce payload size
    return {
      results: results.map(r => {
        const details = r.details ? JSON.parse(r.details) : {}
        return {
          ...r,
          isForfeit: Boolean(r.isForfeit),
          strengthTeamA: details.strengthTeamA,
          strengthTeamB: details.strengthTeamB,
          details: undefined
        }
      }),
      isCupGameDay: cupCheck.length > 0,
      cupRound: cupCheck.length > 0 ? cupCheck[0].cup_round : null
    }
  },

  /**
   * @param {number} gameId
   * @returns {Promise<{result: GameResultType}>}
   */
  async getResult (gameId) {
    const results = await query(`
        SELECT g.id           as id,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.game_day     as gameDay,
               g.season       as season,
               g.is_forfeit   as isForfeit,
               t1.name        as team1,
               t2.name        as team2,
               g.team_1_id    as team1Id,
               g.team_2_id    as team2Id,
               g.details      as details,
               g.created_at   as created_at
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.id = ?
    `, [gameId])
    if (results.length === 0) throw new BadRequestError('Game not found')
    const result = results[0]
    result.isForfeit = Boolean(result.isForfeit)
    return { result }
  },

  /**
   * @param {number} matchDay - League match day (1..N). 0 means "before any games".
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<Array<StandingType>>}
   */
  async getStanding (matchDay, season, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    // Translate match_day → internal game_day (the league game_day for that match_day).
    // The standing cache is keyed by internal game_day from the cron's per-tick caching.
    let internalGameDay = 0
    if (matchDay > 0) {
      const [row] = await query(
        "SELECT game_day FROM game WHERE match_day=? AND season=? AND level=? AND league=? AND (game_type='league' OR game_type IS NULL) LIMIT 1",
        [matchDay, season, actualLevel, actualLeague]
      )
      if (row) internalGameDay = row.game_day
    }

    // The cache only represents finished league game days. If the requested
    // match_day is in the future for this league, bypass the cache entirely:
    // any cached row for that game_day would be a stale snapshot from an
    // earlier request, and writing a new one would just freeze today's state
    // under a future key (the cron only refreshes cache rows for the game day
    // it currently plays). Compute fresh and don't persist.
    const [lastPlayedRow] = await query(
      "SELECT MAX(game_day) AS lastDay FROM game WHERE season=? AND level=? AND league=? AND played=1 AND (game_type='league' OR game_type IS NULL)",
      [season, actualLevel, actualLeague]
    )
    const lastPlayedGameDay = lastPlayedRow?.lastDay ?? -1
    const isFutureMatchDay = internalGameDay > lastPlayedGameDay

    if (!isFutureMatchDay) {
      const cached = await getCachedStanding(internalGameDay, season, actualLevel, actualLeague)
      if (cached) {
        // Refresh team display data (name, emblem, color) from database
        const teamIds = cached.filter(s => s.team?.id).map(s => s.team.id)
        if (teamIds.length > 0) {
          const freshTeams = await query(`SELECT id, name, emblem, color
                                          FROM team
                                          WHERE id IN (${teamIds.join(', ')})`)
          const teamMap = Object.fromEntries(freshTeams.map(t => [t.id, t]))
          for (const entry of cached) {
            const fresh = entry.team?.id ? teamMap[entry.team.id] : null
            if (fresh) {
              entry.team.name = fresh.name
              entry.team.emblem = fresh.emblem
              entry.team.color = fresh.color
            }
          }
        }
        return cached
      }
    }

    // Calculate standing if not cached (for historical data or edge cases)
    const games = await query(
      `
          SELECT *
          FROM game g
          WHERE g.match_day <= ?
            AND g.season = ?
            AND g.level = ?
            AND g.league = ?
            AND g.played = 1
            AND (g.game_type = 'league' OR g.game_type IS NULL)
      `,
      [matchDay, season, actualLevel, actualLeague]
    )
    let teams = []
    if (games.length > 0) {
      const teamIds = new Set()
      games.forEach(game => {
        teamIds.add(game.team_1_id)
        teamIds.add(game.team_2_id)
      })
      teams = await query(`SELECT *
                           FROM team
                           WHERE id IN (${[...teamIds].join(', ')})`)
    } else {
      teams = await query('SELECT * FROM team WHERE level=? AND league=?', [actualLevel, actualLeague])
    }
    const standing = calculateStanding(games, teams)

    // Only cache when the requested match day represents a finished league game day.
    // Caching future match days would freeze a stale snapshot until the next time
    // someone explicitly requests that key (the cron never touches it).
    if (games.length > 0 && !isFutureMatchDay) {
      await saveStandingToCache(internalGameDay, season, actualLevel, actualLeague, standing)
    }

    return standing
  },

  /**
   * Get top scorers for a league from cached stats
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {number} limit
   * @param {Request} [req]
   * @returns {Promise<{topScorers: Array}>}
   */
  async getTopScorers (season, level, league, limit = 10, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const topScorers = await getTopScorersFromCache(season, actualLevel, actualLeague, limit)
    return { topScorers }
  },

  /**
   * Get suspended players for a league
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{suspendedPlayers: Array}>}
   */
  /**
   * Get team statistics for all teams in a league on a given league match day
   * @param {number} matchDay - League match day (1..N)
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{teamStats: Array}>}
   */
  async getTeamStats (matchDay, season, level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    // team_stats_cache is keyed by internal game_day. Translate.
    let internalGameDay = 0
    if (matchDay > 0) {
      const [row] = await query(
        "SELECT game_day FROM game WHERE match_day=? AND season=? AND level=? AND league=? AND (game_type='league' OR game_type IS NULL) LIMIT 1",
        [matchDay, season, actualLevel, actualLeague]
      )
      if (row) internalGameDay = row.game_day
    }
    const stats = await getTeamStatsFromCache(internalGameDay, season, actualLevel, actualLeague)
    return { teamStats: stats }
  },

  /**
   * Get stadium info (name + size) for all teams in a league.
   * @param {number} level
   * @param {number} league
   * @param {Request} [req]
   * @returns {Promise<{stadiums: Array}>}
   */
  async getLeagueStadiums (level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league
    const rows = await query(`
      SELECT t.id AS team_id, t.name AS team_name, t.emblem, t.color, t.user_id,
             s.name AS stadium_name,
             COALESCE(s.north_stand_size, 0) + COALESCE(s.south_stand_size, 0)
               + COALESCE(s.east_stand_size, 0) + COALESCE(s.west_stand_size, 0) AS stadium_size
      FROM team t
      LEFT JOIN stadium s ON s.team_id = t.id
      WHERE t.level = ? AND t.league = ?
      ORDER BY t.name
    `, [actualLevel, actualLeague])
    return { stadiums: rows }
  },

  async getInjuredPlayers (level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const injuredPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE t.level = ?
          AND t.league = ?
          AND p.is_injured = 1
        ORDER BY t.name, p.name
    `, [actualLevel, actualLeague])

    return {
      injuredPlayers: injuredPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  },

  /**
   * Full season schedule (league + cup) for the user's team.
   * Includes every cup round in the season as a placeholder row when the team
   * does not (or no longer) has a game in that round, so the user can still see
   * upcoming/past cup rounds where their participation is unknown.
   *
   * @param {Request} req
   * @returns {Promise<{
   *   season: number,
   *   currentGameDay: number,
   *   nextGameDate: string,
   *   tickMs: number,
   *   totalCupRounds: number,
   *   schedule: Array<object>
   * }>}
   */
  async getMySchedule (req) {
    const team = await getTeam(req)
    const current = await getGameDayAndSeason()
    const actualSeason = current.season

    const [leagueGames, cupGames, cupRoundsRows, unplayedDayRows, totalRoundsRow] = await Promise.all([
      query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.match_day    as matchDay,
               g.season       as season,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.is_forfeit   as isForfeit,
               g.played       as played,
               t1.id          as team1Id,
               t1.name        as team1,
               t1.color       as team1Color,
               t1.emblem      as team1Emblem,
               t1.user_id     as team1UserId,
               t2.id          as team2Id,
               t2.name        as team2,
               t2.color       as team2Color,
               t2.emblem      as team2Emblem,
               t2.user_id     as team2UserId
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.season = ?
          AND (g.team_1_id = ? OR g.team_2_id = ?)
          AND (g.game_type = 'league' OR g.game_type IS NULL)
        ORDER BY g.game_day ASC
      `, [actualSeason, team.id, team.id]),
      query(`
        SELECT g.id           as id,
               g.game_day     as gameDay,
               g.season       as season,
               g.cup_round    as cupRound,
               g.goals_team_1 as goalsTeam1,
               g.goals_team_2 as goalsTeam2,
               g.played       as played,
               t1.id          as team1Id,
               t1.name        as team1,
               t1.color       as team1Color,
               t1.emblem      as team1Emblem,
               t1.user_id     as team1UserId,
               t2.id          as team2Id,
               t2.name        as team2,
               t2.color       as team2Color,
               t2.emblem      as team2Emblem,
               t2.user_id     as team2UserId
        FROM game g
                 JOIN team t1 ON t1.id = g.team_1_id
                 LEFT JOIN team t2 ON t2.id = g.team_2_id
        WHERE g.season = ?
          AND g.game_type = 'cup'
          AND (g.team_1_id = ? OR g.team_2_id = ?)
        ORDER BY g.game_day ASC
      `, [actualSeason, team.id, team.id]),
      query(`
        SELECT cup_round    as cupRound,
               MIN(game_day) as gameDay,
               MIN(played) = 1 AND MAX(played) = 1 as allPlayed
        FROM game
        WHERE game_type = 'cup' AND season = ?
        GROUP BY cup_round
        ORDER BY MIN(game_day) ASC
      `, [actualSeason]),
      query(
        'SELECT DISTINCT game_day FROM game WHERE played=0 AND season=? ORDER BY game_day ASC',
        [actualSeason]
      ),
      query(
        "SELECT MAX(cup_round) as maxRound FROM game WHERE game_type='cup' AND season=?",
        [actualSeason]
      )
    ])

    const totalCupRounds = totalRoundsRow[0]?.maxRound
      ? Math.log2(totalRoundsRow[0].maxRound) + 1
      : 0

    const unplayedDays = unplayedDayRows.map(r => r.game_day)
    const tickMs = 12 * 60 * 60 * 1000
    const nextTick = new Date()
    nextTick.setHours(12)
    nextTick.setMinutes(0)
    nextTick.setSeconds(0)
    nextTick.setMilliseconds(0)
    if (Date.now() > nextTick.getTime()) {
      nextTick.setHours(23)
      nextTick.setMinutes(59)
      nextTick.setSeconds(59)
    }

    const computeGameDate = (gameDay) => {
      const idx = unplayedDays.indexOf(gameDay)
      if (idx < 0) return null
      const d = new Date(nextTick.getTime() + idx * tickMs)
      return d.toISOString()
    }

    const cupRoundsByGameDay = new Map()
    for (const r of cupRoundsRows) {
      cupRoundsByGameDay.set(r.gameDay, { cupRound: r.cupRound, allPlayed: r.allPlayed === 1 })
    }

    const cupGameDaysWithMyGame = new Set(cupGames.map(g => g.gameDay))

    const entries = []

    for (const g of leagueGames) {
      entries.push({
        type: 'league',
        gameDay: g.gameDay,
        matchDay: g.matchDay,
        played: g.played === 1,
        gameDate: g.played === 1 ? null : computeGameDate(g.gameDay),
        game: {
          ...g,
          isForfeit: Boolean(g.isForfeit),
          played: g.played === 1
        }
      })
    }

    for (const g of cupGames) {
      const isBye = g.team2Id == null
      entries.push({
        type: 'cup',
        gameDay: g.gameDay,
        cupRound: g.cupRound,
        played: g.played === 1,
        isBye,
        gameDate: g.played === 1 ? null : computeGameDate(g.gameDay),
        game: {
          ...g,
          played: g.played === 1
        }
      })
    }

    // Add placeholder rows for cup rounds where the team has no game (eliminated
    // or future round where the bracket hasn't reached us yet).
    for (const [gameDay, info] of cupRoundsByGameDay.entries()) {
      if (cupGameDaysWithMyGame.has(gameDay)) continue
      entries.push({
        type: 'cup_round',
        gameDay,
        cupRound: info.cupRound,
        played: info.allPlayed,
        gameDate: info.allPlayed ? null : computeGameDate(gameDay)
      })
    }

    entries.sort((a, b) => a.gameDay - b.gameDay)

    return {
      season: actualSeason,
      currentGameDay: current.gameDay,
      nextGameDate: nextTick.toISOString(),
      tickMs,
      totalCupRounds,
      schedule: entries
    }
  },

  async getSuspendedPlayers (level, league, req) {
    const team = await getTeam(req)
    const actualLevel = level ?? team.level
    const actualLeague = league ?? team.league

    const suspendedPlayers = await query(`
        SELECT p.*, t.name as team_name, t.color as team_color, t.emblem as team_emblem
        FROM player p
                 JOIN team t ON t.id = p.team_id
        WHERE t.level = ?
          AND t.league = ?
          AND p.is_suspended = 1
        ORDER BY t.name, p.name
    `, [actualLevel, actualLeague])

    return {
      suspendedPlayers: suspendedPlayers.map(p => ({
        ...p,
        team: {
          id: p.team_id,
          name: p.team_name,
          color: p.team_color,
          emblem: p.team_emblem
        }
      }))
    }
  }
}
