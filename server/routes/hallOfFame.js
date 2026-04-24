import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { maskBadWords } from '../lib/badWordsFilter.js'

export default {

  /**
   * Get hall of fame data for a season: league champions (all levels) and cup winner
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{season: number, seasons: number[], champions: object[], cupWinner: object|null}>}
   */
  async getHallOfFame (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    // Get all completed seasons (seasons where all league games are played)
    const completedSeasons = await query(`
      SELECT DISTINCT s.season FROM (
        SELECT season FROM game
        WHERE (game_type = 'league' OR game_type IS NULL)
          AND level = 1
        GROUP BY season
        HAVING COUNT(*) = SUM(played)
      ) s
      ORDER BY s.season DESC
    `)
    const seasons = completedSeasons.map(s => s.season)

    if (seasons.length === 0) {
      return { season: null, seasons: [], champions: [], cupWinner: null }
    }

    const actualSeason = season ?? seasons[0]

    // Get all level+league combinations that have standings for this season
    const levelLeagues = await query(
      'SELECT DISTINCT level, league FROM standing_cache WHERE season = ? ORDER BY level ASC, league ASC',
      [actualSeason]
    )

    // Get champion for each level+league
    const champions = []
    for (const { level, league } of levelLeagues) {
      const [lastGameDay] = await query(
        'SELECT MAX(game_day) as maxDay FROM standing_cache WHERE season = ? AND level = ? AND league = ?',
        [actualSeason, level, league]
      )
      if (lastGameDay?.maxDay == null) continue

      const [cached] = await query(
        'SELECT data FROM standing_cache WHERE season = ? AND game_day = ? AND level = ? AND league = ?',
        [actualSeason, lastGameDay.maxDay, level, league]
      )
      if (!cached?.data) continue

      const standing = JSON.parse(cached.data)
      if (standing.length === 0) continue

      const topTeam = standing[0]
      const [user] = topTeam.team?.user_id
        ? await query('SELECT username FROM user WHERE id = ?', [topTeam.team.user_id])
        : []

      champions.push({
        level,
        league,
        teamId: topTeam.team?.id,
        teamName: topTeam.team?.name,
        emblem: topTeam.team?.emblem,
        color: topTeam.team?.color,
        username: user?.username || null,
        points: topTeam.points
      })
    }

    // Get cup winner: winner of cup_round=1 (final) game
    let cupWinner = null
    const [finalGame] = await query(`
      SELECT g.goals_team_1, g.goals_team_2,
             t1.id as t1Id, t1.name as t1Name, t1.emblem as t1Emblem, t1.color as t1Color, t1.user_id as t1UserId,
             t2.id as t2Id, t2.name as t2Name, t2.emblem as t2Emblem, t2.color as t2Color, t2.user_id as t2UserId
      FROM game g
      JOIN team t1 ON t1.id = g.team_1_id
      JOIN team t2 ON t2.id = g.team_2_id
      WHERE g.season = ? AND g.game_type = 'cup' AND g.cup_round = 1 AND g.played = 1
    `, [actualSeason])

    if (finalGame) {
      const team1Won = finalGame.goals_team_1 > finalGame.goals_team_2
      const winner = team1Won
        ? { id: finalGame.t1Id, name: finalGame.t1Name, emblem: finalGame.t1Emblem, color: finalGame.t1Color, userId: finalGame.t1UserId }
        : { id: finalGame.t2Id, name: finalGame.t2Name, emblem: finalGame.t2Emblem, color: finalGame.t2Color, userId: finalGame.t2UserId }

      const [user] = winner.userId
        ? await query('SELECT username FROM user WHERE id = ?', [winner.userId])
        : []

      cupWinner = {
        teamId: winner.id,
        teamName: winner.name,
        emblem: winner.emblem,
        color: winner.color,
        username: user?.username || null
      }
    }

    return { season: actualSeason, seasons, champions, cupWinner }
  },

  /**
   * Get comments for a hall of fame season
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{comments: Array}>}
   */
  async getHallOfFameComments (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const comments = await query(`
      SELECT c.id, c.season, c.user_id, c.text, c.created_at,
        u.username,
        (SELECT COUNT(*) FROM hall_of_fame_comment_like l WHERE l.comment_id = c.id) AS like_count,
        (SELECT COUNT(*) FROM hall_of_fame_comment_like l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked
      FROM hall_of_fame_comment c
      JOIN user u ON u.id = c.user_id
      WHERE c.season = ?
      ORDER BY c.created_at ASC
      LIMIT 100
    `, [req.user.id, season])

    return {
      comments: comments.map(c => ({
        ...c,
        liked: c.liked > 0
      }))
    }
  },

  /**
   * Add a comment to a hall of fame season
   * @param {number} season
   * @param {string} text
   * @param {Request} req
   * @returns {Promise<{comment: object}>}
   */
  async addHallOfFameComment (season, text, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    if (!text || !text.trim()) throw new BadRequestError('Comment text cannot be empty')
    if (text.length > 500) throw new BadRequestError('Comment text too long')

    const filteredText = maskBadWords(text.trim())

    const result = await query('INSERT INTO hall_of_fame_comment SET ?', {
      season,
      user_id: req.user.id,
      text: filteredText
    })

    const [comment] = await query(`
      SELECT c.id, c.season, c.user_id, c.text, c.created_at, u.username
      FROM hall_of_fame_comment c
      JOIN user u ON u.id = c.user_id
      WHERE c.id = ?
    `, [result.insertId])

    comment.like_count = 0
    comment.liked = false

    return { comment }
  },

  /**
   * Toggle like on a hall of fame comment
   * @param {number} commentId
   * @param {Request} req
   * @returns {Promise<{liked: boolean, likeCount: number}>}
   */
  async toggleHallOfFameCommentLike (commentId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const userId = req.user.id

    const existing = await query(
      'SELECT id FROM hall_of_fame_comment_like WHERE comment_id=? AND user_id=?',
      [commentId, userId]
    )

    if (existing.length > 0) {
      await query('DELETE FROM hall_of_fame_comment_like WHERE comment_id=? AND user_id=?', [commentId, userId])
    } else {
      await query('INSERT INTO hall_of_fame_comment_like SET ?', { comment_id: commentId, user_id: userId })
    }

    const [{ count }] = await query(
      'SELECT COUNT(*) as count FROM hall_of_fame_comment_like WHERE comment_id=?',
      [commentId]
    )

    return { liked: existing.length === 0, likeCount: count }
  }
}
