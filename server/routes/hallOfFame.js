import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { maskBadWords } from '../lib/badWordsFilter.js'

export default {

  /**
   * Get hall of fame data for a season: league champions (all levels) and cup winner.
   * Titles are read from the season_title table, which freezes user_id at the
   * moment of victory so that a later bot takeover does not retroactively
   * credit a new owner with historic trophies.
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{season: number, seasons: number[], champions: object[], cupWinner: object|null}>}
   */
  async getHallOfFame (season, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')

    const seasonRows = await query(
      'SELECT DISTINCT season FROM season_title ORDER BY season DESC'
    )
    const seasons = seasonRows.map(s => s.season)

    if (seasons.length === 0) {
      return { season: null, seasons: [], champions: [], cupWinner: null }
    }

    const actualSeason = season ?? seasons[0]

    const titles = await query(`
      SELECT st.title_type, st.level, st.league, st.team_id, st.user_id,
             t.name AS team_name, t.emblem, t.color,
             u.username, u.avatar
      FROM season_title st
      LEFT JOIN team t ON t.id = st.team_id
      LEFT JOIN user u ON u.id = st.user_id
      WHERE st.season = ?
      ORDER BY st.title_type ASC, st.level ASC, st.league ASC
    `, [actualSeason])

    const champions = []
    let cupWinner = null
    for (const row of titles) {
      if (row.title_type === 'champion') {
        champions.push({
          level: row.level,
          league: row.league,
          teamId: row.team_id,
          teamName: row.team_name,
          emblem: row.emblem,
          color: row.color,
          username: row.username || null,
          avatar: row.avatar || null
        })
      } else if (row.title_type === 'cup_winner') {
        cupWinner = {
          teamId: row.team_id,
          teamName: row.team_name,
          emblem: row.emblem,
          color: row.color,
          username: row.username || null,
          avatar: row.avatar || null
        }
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
