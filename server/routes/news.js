import { query } from '../lib/database.js'
import { getGameDayAndSeason } from '../helper/gameDayHelper.js'
import { getTeam } from '../helper/teamHelper.js'
import { getNewsByLeague } from '../helper/newsHelper.js'
import { getLocaleFromRequest } from '../i18n/index.js'
import { maskBadWords } from '../lib/badWordsFilter.js'
import { BadRequestError } from '../lib/errors.js'

/**
 * Enrich news items with like counts and whether the current user liked them
 * @param {Array} news
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function enrichNewsWithLikes (news, userId) {
  if (news.length === 0) return news

  const newsIds = news.map(n => n.id)
  const placeholders = newsIds.map(() => '?').join(', ')

  const likeCounts = await query(
    `SELECT news_id, COUNT(*) as count FROM news_like WHERE news_id IN (${placeholders}) GROUP BY news_id`,
    newsIds
  )

  const userLikes = await query(
    `SELECT news_id FROM news_like WHERE news_id IN (${placeholders}) AND user_id=?`,
    [...newsIds, userId]
  )

  const commentCounts = await query(
    `SELECT news_id, COUNT(*) as count FROM news_comment WHERE news_id IN (${placeholders}) GROUP BY news_id`,
    newsIds
  )

  const likeCountMap = new Map(likeCounts.map(r => [r.news_id, r.count]))
  const userLikeSet = new Set(userLikes.map(r => r.news_id))
  const commentCountMap = new Map(commentCounts.map(r => [r.news_id, r.count]))

  for (const item of news) {
    item.likeCount = likeCountMap.get(item.id) || 0
    item.liked = userLikeSet.has(item.id)
    item.commentCount = commentCountMap.get(item.id) || 0
  }

  return news
}

/**
 * Collect related teams and players for a set of news items
 * @param {Array} news
 * @returns {Promise<{teams: Array, players: Array}>}
 */
async function collectTeamsAndPlayers (news) {
  const teamIds = new Set()
  const playerIds = new Set()

  for (const item of news) {
    if (item.team_id) teamIds.add(item.team_id)
    if (item.player_id) playerIds.add(item.player_id)
  }

  let teams = []
  if (teamIds.size > 0) {
    teams = await query(`SELECT * FROM team WHERE id IN (${[...teamIds].join(', ')})`)
  }

  let players = []
  if (playerIds.size > 0) {
    players = await query(`SELECT * FROM player WHERE id IN (${[...playerIds].join(', ')})`)
    const playerTeamIds = players.map(p => p.team_id).filter(id => id && !teamIds.has(id))
    if (playerTeamIds.length > 0) {
      const playerTeams = await query(`SELECT * FROM team WHERE id IN (${playerTeamIds.join(', ')})`)
      teams = [...teams, ...playerTeams]
    }
  }

  return { teams, players }
}

export default {

  /**
   * @typedef {object} NewsResponse
   * @property {number} gameDay
   * @property {number} season
   * @property {number} level
   * @property {number} league
   * @property {Array<NewsType>} news
   * @property {Array<TeamType>} teams
   * @property {Array<PlayerType>} players
   */

  /**
   * Get league news filtered by current game day, season, and user's league
   * @param {Request} req
   * @returns {Promise<NewsResponse>}
   */
  async getLeagueNews (req) {
    const { gameDay, season } = await getGameDayAndSeason()
    const team = await getTeam(req)

    // Get news for the previous game day (current day's games may not have been processed yet)
    let newsGameDay = gameDay - 1
    let newsSeason = season

    // On first game day of a new season, show last game day from previous season
    if (newsGameDay < 0 && season > 0) {
      newsSeason = season - 1
      const [lastGame] = await query(
        'SELECT MAX(game_day) as lastGameDay FROM game WHERE season = ?',
        [newsSeason]
      )
      newsGameDay = lastGame?.lastGameDay ?? 0
    }

    // For very first game ever, no news yet
    if (newsGameDay < 0) {
      return { gameDay: 0, season, level: team.level, league: team.league, news: [], teams: [], players: [] }
    }

    const locale = getLocaleFromRequest(req)
    let news = await getNewsByLeague(newsGameDay, newsSeason, team.level, team.league, locale)
    news = await enrichNewsWithLikes(news, req.user.id)

    const { teams, players } = await collectTeamsAndPlayers(news)

    return {
      gameDay: newsGameDay,
      season: newsSeason,
      level: team.level,
      league: team.league,
      news,
      teams,
      players
    }
  },

  /**
   * Get news for a specific game day
   * @param {number} gameDay
   * @param {number} season
   * @param {number} level
   * @param {number} league
   * @param {Request} req
   * @returns {Promise<NewsResponse>}
   */
  async getNewsForGameDay (gameDay, season, level, league, req) {
    const locale = getLocaleFromRequest(req)
    let news = await getNewsByLeague(gameDay, season, level, league, locale)
    news = await enrichNewsWithLikes(news, req.user.id)

    const { teams, players } = await collectTeamsAndPlayers(news)

    return {
      gameDay,
      season,
      news,
      teams,
      players
    }
  },

  /**
   * Toggle like on a news item for the authenticated user
   * @param {number} newsId
   * @param {Request} req
   * @returns {Promise<{liked: boolean, likeCount: number}>}
   */
  async toggleNewsLike (newsId, req) {
    const userId = req.user.id

    const existing = await query(
      'SELECT id FROM news_like WHERE news_id=? AND user_id=?',
      [newsId, userId]
    )

    if (existing.length > 0) {
      await query('DELETE FROM news_like WHERE news_id=? AND user_id=?', [newsId, userId])
    } else {
      await query('INSERT INTO news_like SET ?', { news_id: newsId, user_id: userId })
    }

    const [{ count }] = await query(
      'SELECT COUNT(*) as count FROM news_like WHERE news_id=?',
      [newsId]
    )

    return {
      liked: existing.length === 0,
      likeCount: count
    }
  },

  /**
   * Get all news liked by the authenticated user
   * @param {Request} req
   * @returns {Promise<{news: Array, teams: Array, players: Array}>}
   */
  async getLikedNews (req) {
    const userId = req.user.id
    const locale = getLocaleFromRequest(req)

    const news = await query(
      `SELECT n.*, nl.created_at as liked_at
       FROM news_like nl
       JOIN news n ON n.id = nl.news_id
       WHERE nl.user_id=? AND n.locale=?
       ORDER BY nl.created_at DESC
       LIMIT 50`,
      [userId, locale]
    )

    // Mark all as liked since they come from the liked table
    for (const item of news) {
      item.liked = true
      const [{ count }] = await query(
        'SELECT COUNT(*) as count FROM news_like WHERE news_id=?',
        [item.id]
      )
      item.likeCount = count
    }

    const { teams, players } = await collectTeamsAndPlayers(news)

    return {
      news,
      teams,
      players
    }
  },

  /**
   * Get the maximum game day for a given season
   * @param {number} season
   * @param {Request} req
   * @returns {Promise<{maxGameDay: number}>}
   */
  async getMaxGameDay (season, _req) {
    const [result] = await query(
      'SELECT MAX(game_day) as maxGameDay FROM game WHERE season=?',
      [season]
    )
    return { maxGameDay: result?.maxGameDay ?? 0 }
  },

  /**
   * Get comments for a news item
   * @param {number} newsId
   * @param {Request} req
   * @returns {Promise<{comments: Array}>}
   */
  async getNewsComments (newsId, _req) {
    const comments = await query(
      `SELECT nc.id, nc.news_id, nc.user_id, nc.text, nc.created_at, u.username as author_name
       FROM news_comment nc
       JOIN user u ON u.id = nc.user_id
       WHERE nc.news_id=?
       ORDER BY nc.created_at ASC
       LIMIT 100`,
      [newsId]
    )
    return { comments }
  },

  /**
   * Add a comment to a news item
   * @param {number} newsId
   * @param {string} text
   * @param {Request} req
   * @returns {Promise<{comment: object}>}
   */
  async addNewsComment (newsId, text, req) {
    if (!text || !text.trim()) {
      throw new BadRequestError('Comment text cannot be empty')
    }
    if (text.length > 500) {
      throw new BadRequestError('Comment text cannot exceed 500 characters')
    }

    const filteredText = maskBadWords(text.trim())
    const userId = req.user.id

    const result = await query('INSERT INTO news_comment SET ?', {
      news_id: newsId,
      user_id: userId,
      text: filteredText
    })

    const [comment] = await query(
      `SELECT nc.id, nc.news_id, nc.user_id, nc.text, nc.created_at, u.username as author_name
       FROM news_comment nc
       JOIN user u ON u.id = nc.user_id
       WHERE nc.id=?`,
      [result.insertId]
    )

    return { comment }
  }
}
