import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getUserTeamHistory } from '../helper/userHistoryHelper.js'
import { calculateStandingForTeam } from '../helper/standingHelper.js'
import { getTotalRounds } from '../helper/cupHelper.js'
import { sendUserReportEmail } from '../lib/email.js'
import { truncateChars } from '../lib/util.js'

export default {

  /**
   * Public profile for a user: identity (avatar + username), friend list,
   * current team (if any), and per-season placement history across every
   * team they have managed.
   * @param {number} userId
   * @param {Request} req
   * @returns {Promise<{user: object, currentTeam: object|null, friends: Array, history: Array, isOwnProfile: boolean, isFriend: boolean}>}
   */
  async getUserProfile (userId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(userId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid user id')
    }
    const [user] = await query(
      'SELECT id, username, avatar, last_login, created_at FROM user WHERE id=? LIMIT 1',
      [id]
    )
    if (!user) {
      throw new BadRequestError('User not found')
    }

    const [currentTeam] = await query(
      'SELECT id, name, short_name, emblem, color, level, league FROM team WHERE user_id=? LIMIT 1',
      [id]
    )

    const friends = await query(
      `SELECT u.id, u.username, u.avatar, t.id AS teamId, t.name AS teamName
       FROM user_friend uf
       JOIN user u ON u.id = uf.friend_user_id
       LEFT JOIN team t ON t.user_id = u.id
       WHERE uf.user_id = ?
       ORDER BY u.username ASC`,
      [id]
    )

    const tenures = await getUserTeamHistory(id)
    const { season: currentSeason } = await getGameDayAndSeason()
    const history = await buildHistory(tenures, currentSeason)

    let isFriend = false
    if (id !== req.user.id) {
      const rows = await query(
        'SELECT 1 FROM user_friend WHERE user_id=? AND friend_user_id=? LIMIT 1',
        [req.user.id, id]
      )
      isFriend = rows.length > 0
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        lastLogin: user.last_login,
        joinedAt: user.created_at
      },
      currentTeam: currentTeam || null,
      friends,
      history,
      isOwnProfile: id === req.user.id,
      isFriend
    }
  },

  /**
   * Report another user. Stores a free-text reason for admin review (#421).
   * @param {number} reportedUserId
   * @param {string} reason
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async reportUser (reportedUserId, reason, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(reportedUserId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid user id')
    }
    if (id === req.user.id) {
      throw new BadRequestError('You cannot report yourself')
    }
    const cleanReason = typeof reason === 'string' ? reason.trim() : ''
    if (cleanReason.length < 3) {
      throw new BadRequestError('Please describe why you are reporting this user')
    }
    const [reported] = await query('SELECT id, username FROM user WHERE id=? LIMIT 1', [id])
    if (!reported) {
      throw new BadRequestError('User not found')
    }
    const storedReason = truncateChars(cleanReason, 2000)
    await query(
      'INSERT INTO user_report SET ?',
      { reporter_user_id: req.user.id, reported_user_id: id, reason: storedReason }
    )
    // Notify the admins (#489). Never let a mail failure fail the report.
    try {
      await sendUserReportEmail({
        reportedUsername: reported.username,
        reportedUserId: reported.id,
        reporterUsername: req.user.username,
        reporterUserId: req.user.id,
        reason: storedReason
      })
    } catch (e) {
      console.error('[Report] Failed to notify admins about user report:', e?.message ?? e)
    }
    return { success: true }
  }
}

/**
 * Build a season-by-season placement history for each tenure the user had.
 * Returns rows sorted newest-first across all tenures.
 * @param {Array<{team_id: number, start_season: number, end_season: number|null}>} tenures
 * @param {number} currentSeason
 * @returns {Promise<Array>}
 */
async function buildHistory (tenures, currentSeason) {
  if (tenures.length === 0) return []
  const teamIds = [...new Set(tenures.map(t => t.team_id))]
  const teams = await query(
    'SELECT id, name, short_name, emblem, color FROM team WHERE id IN (?)',
    [teamIds]
  )
  const teamById = new Map(teams.map(t => [t.id, t]))

  const result = []
  for (const tenure of tenures) {
    const team = teamById.get(tenure.team_id)
    if (!team) continue
    const upperSeason = tenure.end_season == null ? currentSeason : tenure.end_season
    // Discover season/level/league combinations the team played during the
    // tenure. Exclude the current season (still in progress).
    const seasonData = await query(`
      SELECT DISTINCT season, level, league
      FROM game
      WHERE (team_1_id = ? OR team_2_id = ?)
        AND played = 1
        AND season >= ? AND season <= ?
        AND season < ?
        AND (game_type = 'league' OR game_type IS NULL)
      ORDER BY season DESC
    `, [tenure.team_id, tenure.team_id, tenure.start_season, upperSeason, currentSeason])

    const uniqueSeasons = []
    const processed = new Set()
    for (const row of seasonData) {
      if (processed.has(row.season)) continue
      processed.add(row.season)
      uniqueSeasons.push(row)
    }
    if (uniqueSeasons.length === 0) continue

    const sllConditions = uniqueSeasons.map(() => '(g.season = ? AND g.level = ? AND g.league = ?)').join(' OR ')
    const sllParams = uniqueSeasons.flatMap(r => [r.season, r.level, r.league])
    const seasonList = uniqueSeasons.map(r => r.season)
    const seasonPlaceholders = seasonList.map(() => '?').join(',')

    const [leagueGames, cupGames, maxCupRounds] = await Promise.all([
      query(`
        SELECT g.season, g.level, g.league, g.team_1_id, g.team_2_id,
               g.goals_team_1, g.goals_team_2
        FROM game g
        WHERE (${sllConditions})
          AND g.played = 1
          AND (g.game_type = 'league' OR g.game_type IS NULL)
      `, sllParams),
      query(`
        SELECT season, team_1_id, team_2_id, goals_team_1, goals_team_2, played, cup_round
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders})
          AND (team_1_id = ? OR team_2_id = ?)
        ORDER BY cup_round ASC
      `, [...seasonList, tenure.team_id, tenure.team_id]),
      query(`
        SELECT season, MAX(cup_round) AS maxRound
        FROM game
        WHERE game_type = 'cup' AND season IN (${seasonPlaceholders})
        GROUP BY season
      `, seasonList)
    ])

    const leagueByKey = new Map()
    const teamIdsByKey = new Map()
    for (const game of leagueGames) {
      const key = `${game.season}/${game.level}/${game.league}`
      if (!leagueByKey.has(key)) {
        leagueByKey.set(key, [])
        teamIdsByKey.set(key, new Set())
      }
      leagueByKey.get(key).push(game)
      teamIdsByKey.get(key).add(game.team_1_id)
      teamIdsByKey.get(key).add(game.team_2_id)
    }

    const cupBySeason = new Map()
    for (const g of cupGames) {
      if (!cupBySeason.has(g.season)) cupBySeason.set(g.season, [])
      cupBySeason.get(g.season).push(g)
    }
    const maxCupBySeason = new Map()
    for (const row of maxCupRounds) {
      maxCupBySeason.set(row.season, row.maxRound)
    }

    for (const row of uniqueSeasons) {
      const key = `${row.season}/${row.level}/${row.league}`
      const games = leagueByKey.get(key) || []
      const tIds = teamIdsByKey.get(key) || new Set()
      const teamObjs = [...tIds].map(id => ({ id }))
      const standing = calculateStandingForTeam(games, teamObjs, tenure.team_id)

      let cupResult = null
      const cgs = cupBySeason.get(row.season) || []
      if (cgs.length > 0) {
        const deepest = cgs[0]
        const isWinner = deepest.played === 1 && (
          (deepest.team_1_id === tenure.team_id && deepest.goals_team_1 > deepest.goals_team_2) ||
          (deepest.team_2_id === tenure.team_id && deepest.goals_team_2 > deepest.goals_team_1)
        )
        const roundReached = deepest.cup_round
        const totalRounds = getTotalRounds(maxCupBySeason.get(row.season))
        cupResult = {
          roundReached,
          totalRounds,
          isWinner: isWinner && roundReached === 1
        }
      }

      result.push({
        season: row.season,
        level: row.level,
        league: row.league,
        teamId: team.id,
        teamName: team.name,
        teamShortName: team.short_name,
        teamEmblem: team.emblem,
        teamColor: team.color,
        position: standing.position,
        played: standing.played,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        points: standing.points,
        cupResult
      })
    }
  }

  result.sort((a, b) => b.season - a.season)
  return result
}
