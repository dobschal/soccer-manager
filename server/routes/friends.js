import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { getTotalRoundsForSeason } from '../helper/cupHelper.js'

export default {
  /**
   * Add another user as a friend.
   * @param {number} friendUserId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async addFriend (friendUserId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(friendUserId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid friend user id')
    }
    if (id === req.user.id) {
      throw new BadRequestError('Cannot add yourself as a friend')
    }
    const [target] = await query('SELECT id FROM user WHERE id=? LIMIT 1', [id])
    if (!target) {
      throw new BadRequestError('User not found')
    }
    await query(
      'INSERT IGNORE INTO user_friend (user_id, friend_user_id) VALUES (?, ?)',
      [req.user.id, id]
    )
    return { success: true }
  },

  /**
   * Remove a friend.
   * @param {number} friendUserId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async removeFriend (friendUserId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(friendUserId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid friend user id')
    }
    await query(
      'DELETE FROM user_friend WHERE user_id=? AND friend_user_id=?',
      [req.user.id, id]
    )
    return { success: true }
  },

  /**
   * Check whether a specific user is in my friends list.
   * @param {number} friendUserId
   * @param {Request} req
   * @returns {Promise<{isFriend: boolean}>}
   */
  async isFriend (friendUserId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(friendUserId)
    if (!Number.isFinite(id) || id <= 0) {
      return { isFriend: false }
    }
    const rows = await query(
      'SELECT 1 FROM user_friend WHERE user_id=? AND friend_user_id=? LIMIT 1',
      [req.user.id, id]
    )
    return { isFriend: rows.length > 0 }
  },

  /**
   * Return the list of friends for the current user. Each entry includes
   * basic user data and the friend's team (if they have one).
   *
   * @param {Request} req
   * @returns {Promise<{friends: Array<{id: number, username: string, avatar: string|null, teamId: number|null, teamName: string|null, teamLevel: number|null}>}>}
   */
  async getFriends (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const friends = await query(
      `SELECT u.id        AS id,
              u.username  AS username,
              u.avatar    AS avatar,
              t.id        AS teamId,
              t.name      AS teamName,
              t.level     AS teamLevel
       FROM user_friend uf
       JOIN user u ON u.id = uf.friend_user_id
       LEFT JOIN team t ON t.user_id = u.id
       WHERE uf.user_id = ?
       ORDER BY u.username ASC`,
      [req.user.id]
    )
    return { friends }
  },

  /**
   * Friends' league and cup games from the most recently played game day
   * (league or cup) across the user's friends. Used by the dashboard
   * "Friends" slider.
   *
   * @param {Request} req
   * @returns {Promise<{games: Array, totalRounds: number}>}
   */
  async getFriendsLastGameDayGames (req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const friendTeams = await query(
      `SELECT t.id, t.user_id, t.level, t.league
       FROM user_friend uf
       JOIN team t ON t.user_id = uf.friend_user_id
       WHERE uf.user_id = ?`,
      [req.user.id]
    )

    if (friendTeams.length === 0) {
      return { games: [], totalRounds: 0 }
    }

    const friendTeamIds = friendTeams.map(t => t.id)
    const placeholders = friendTeamIds.map(() => '?').join(',')

    // Find the most recent (season, game_day) where any friend played a league or cup game.
    const [lastDay] = await query(
      `SELECT season, game_day
       FROM game
       WHERE played = 1
         AND (game_type = 'league' OR game_type = 'cup' OR game_type IS NULL)
         AND (team_1_id IN (${placeholders}) OR team_2_id IN (${placeholders}))
       ORDER BY season DESC, game_day DESC
       LIMIT 1`,
      [...friendTeamIds, ...friendTeamIds]
    )

    if (!lastDay) {
      return { games: [], totalRounds: 0 }
    }

    const games = await query(
      `SELECT g.id           as id,
              g.game_day     as gameDay,
              g.match_day    as matchDay,
              g.season       as season,
              g.goals_team_1 as goalsTeam1,
              g.goals_team_2 as goalsTeam2,
              g.game_type    as gameType,
              g.cup_round    as cupRound,
              t1.name        as team1,
              t2.name        as team2,
              g.team_1_id    as team1Id,
              g.team_2_id    as team2Id,
              t1.color       as team1Color,
              t1.emblem      as team1Emblem,
              t2.color       as team2Color,
              t2.emblem      as team2Emblem,
              t1.user_id     as team1UserId,
              t2.user_id     as team2UserId,
              g.created_at   as playedAt
       FROM game g
       JOIN team t1 ON t1.id = g.team_1_id
       LEFT JOIN team t2 ON t2.id = g.team_2_id
       WHERE g.played = 1
         AND (g.game_type = 'league' OR g.game_type = 'cup' OR g.game_type IS NULL)
         AND g.season = ?
         AND g.game_day = ?
         AND (g.team_1_id IN (${placeholders}) OR g.team_2_id IN (${placeholders}))
       ORDER BY g.created_at ASC`,
      [lastDay.season, lastDay.game_day, ...friendTeamIds, ...friendTeamIds]
    )

    const hasCupGames = games.some(g => g.gameType === 'cup')
    const totalRounds = hasCupGames ? await getTotalRoundsForSeason(lastDay.season) : 0

    return { games, totalRounds }
  }
}
