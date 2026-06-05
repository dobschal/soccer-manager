import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { maskBadWords } from '../lib/badWordsFilter.js'

const UPLOAD_DIR = 'uploads/friend-posts'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB
const POSTS_PER_PAGE = 10
const MAX_POST_TEXT = 5000
const MAX_COMMENT_TEXT = 1000

/**
 * Visible-author ids for the current user: themselves plus everyone they've
 * added as an outgoing friend.
 * @param {number} userId
 * @returns {Promise<number[]>}
 */
async function getVisibleAuthorIds (userId) {
  const rows = await query(
    'SELECT friend_user_id FROM user_friend WHERE user_id = ?',
    [userId]
  )
  return [userId, ...rows.map(r => Number(r.friend_user_id))]
}

/**
 * Save a base64 data URL to the uploads directory. Returns the stored
 * filename or null when input is invalid.
 * @param {{data?: string, type?: string}} image
 * @returns {string|null}
 */
function saveImage (image) {
  if (!image || !image.data || !image.type) return null
  if (!ALLOWED_TYPES.includes(image.type)) {
    throw new BadRequestError('Unsupported image type')
  }
  const base64Data = image.data.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new BadRequestError('Image too large')
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const ext = image.type.split('/')[1].replace('jpeg', 'jpg')
  const filename = `${crypto.randomUUID()}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return filename
}

export default {
  /**
   * Create a new friend post with required text and optional image.
   * @param {string} text
   * @param {{data: string, type: string}|null} image
   * @param {Request} req
   * @returns {Promise<{postId: number}>}
   */
  async createFriendPost (text, image, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    if (!text || !String(text).trim()) {
      throw new BadRequestError('Text cannot be empty')
    }
    if (String(text).length > MAX_POST_TEXT) {
      throw new BadRequestError('Text too long')
    }
    const cleanedText = maskBadWords(String(text).trim())
    const filename = image ? saveImage(image) : null
    const result = await query('INSERT INTO friend_post SET ?', {
      user_id: req.user.id,
      text: cleanedText,
      image_filename: filename
    })
    return { postId: result.insertId }
  },

  /**
   * Paginated list of posts authored by the current user or any of their
   * outgoing friends. Returns the newest posts first.
   * @param {number} page 1-based
   * @param {Request} req
   * @returns {Promise<{posts: Array, page: number, totalPages: number, total: number}>}
   */
  async getFriendPosts (page, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const pageNumber = Math.max(1, Number(page) || 1)
    const offset = (pageNumber - 1) * POSTS_PER_PAGE
    const authorIds = await getVisibleAuthorIds(req.user.id)
    const placeholders = authorIds.map(() => '?').join(',')

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM friend_post WHERE user_id IN (${placeholders})`,
      authorIds
    )

    const posts = await query(`
      SELECT p.id, p.user_id AS userId, p.text, p.image_filename AS imageFilename, p.created_at AS createdAt,
        u.username, u.avatar,
        t.id AS teamId, t.name AS teamName, t.short_name AS teamShortName,
        t.emblem AS teamEmblem, t.color AS teamColor,
        (SELECT COUNT(*) FROM friend_post_like l WHERE l.post_id = p.id) AS likeCount,
        (SELECT COUNT(*) FROM friend_post_like l WHERE l.post_id = p.id AND l.user_id = ?) AS likedByMe,
        (SELECT COUNT(*) FROM friend_post_comment c WHERE c.post_id = p.id) AS commentCount
      FROM friend_post p
      JOIN user u ON u.id = p.user_id
      LEFT JOIN team t ON t.user_id = p.user_id
      WHERE p.user_id IN (${placeholders})
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, ...authorIds, POSTS_PER_PAGE, offset])

    for (const post of posts) {
      post.likedByMe = Number(post.likeCount) > 0 && Number(post.likedByMe) > 0
      post.likeCount = Number(post.likeCount)
      post.commentCount = Number(post.commentCount)
    }

    return {
      posts,
      page: pageNumber,
      total,
      totalPages: Math.max(1, Math.ceil(total / POSTS_PER_PAGE))
    }
  },

  /**
   * Toggle a like on a friend post the user can see. Returns the new state.
   * @param {number} postId
   * @param {Request} req
   * @returns {Promise<{liked: boolean, likeCount: number}>}
   */
  async toggleFriendPostLike (postId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(postId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid post id')
    }
    const [post] = await query('SELECT user_id FROM friend_post WHERE id=? LIMIT 1', [id])
    if (!post) throw new BadRequestError('Post not found')
    const authorIds = await getVisibleAuthorIds(req.user.id)
    if (!authorIds.includes(Number(post.user_id))) {
      throw new BadRequestError('Post not visible')
    }

    const existing = await query(
      'SELECT id FROM friend_post_like WHERE post_id=? AND user_id=? LIMIT 1',
      [id, req.user.id]
    )
    if (existing.length > 0) {
      await query('DELETE FROM friend_post_like WHERE post_id=? AND user_id=?', [id, req.user.id])
    } else {
      await query('INSERT INTO friend_post_like SET ?', { post_id: id, user_id: req.user.id })
    }
    const [{ count }] = await query(
      'SELECT COUNT(*) AS count FROM friend_post_like WHERE post_id=?',
      [id]
    )
    return { liked: existing.length === 0, likeCount: Number(count) }
  },

  /**
   * Return all comments for a friend post. Newest comments last so the
   * overlay can append the freshly written one without scrolling logic.
   * @param {number} postId
   * @param {Request} req
   * @returns {Promise<{comments: Array}>}
   */
  async getFriendPostComments (postId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(postId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid post id')
    }
    const [post] = await query('SELECT user_id FROM friend_post WHERE id=? LIMIT 1', [id])
    if (!post) throw new BadRequestError('Post not found')
    const authorIds = await getVisibleAuthorIds(req.user.id)
    if (!authorIds.includes(Number(post.user_id))) {
      throw new BadRequestError('Post not visible')
    }

    const comments = await query(`
      SELECT c.id, c.user_id AS userId, c.text, c.created_at AS createdAt,
        u.username, u.avatar,
        t.id AS teamId, t.name AS teamName
      FROM friend_post_comment c
      JOIN user u ON u.id = c.user_id
      LEFT JOIN team t ON t.user_id = c.user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC, c.id ASC
    `, [id])

    return { comments }
  },

  /**
   * Add a comment to a friend post the user can see.
   * @param {number} postId
   * @param {string} text
   * @param {Request} req
   * @returns {Promise<{comment: object}>}
   */
  async addFriendPostComment (postId, text, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(postId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid post id')
    }
    if (!text || !String(text).trim()) {
      throw new BadRequestError('Comment text cannot be empty')
    }
    if (String(text).length > MAX_COMMENT_TEXT) {
      throw new BadRequestError('Comment text too long')
    }
    const [post] = await query('SELECT user_id FROM friend_post WHERE id=? LIMIT 1', [id])
    if (!post) throw new BadRequestError('Post not found')
    const authorIds = await getVisibleAuthorIds(req.user.id)
    if (!authorIds.includes(Number(post.user_id))) {
      throw new BadRequestError('Post not visible')
    }

    const cleanedText = maskBadWords(String(text).trim())
    const result = await query('INSERT INTO friend_post_comment SET ?', {
      post_id: id,
      user_id: req.user.id,
      text: cleanedText
    })

    const [comment] = await query(`
      SELECT c.id, c.user_id AS userId, c.text, c.created_at AS createdAt,
        u.username, u.avatar,
        t.id AS teamId, t.name AS teamName
      FROM friend_post_comment c
      JOIN user u ON u.id = c.user_id
      LEFT JOIN team t ON t.user_id = c.user_id
      WHERE c.id = ?
    `, [result.insertId])

    return { comment }
  },

  /**
   * Delete the user's own post (or admin's). Removes the image file and any
   * associated likes/comments.
   * @param {number} postId
   * @param {Request} req
   * @returns {Promise<{success: boolean}>}
   */
  async deleteFriendPost (postId, req) {
    if (!req.user) throw new UnauthorizedError('Not authorized')
    const id = Number(postId)
    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestError('Invalid post id')
    }
    const [post] = await query(
      'SELECT user_id, image_filename FROM friend_post WHERE id=? LIMIT 1',
      [id]
    )
    if (!post) throw new BadRequestError('Post not found')
    if (!req.user.is_admin && Number(post.user_id) !== Number(req.user.id)) {
      throw new BadRequestError('You can only delete your own posts')
    }
    if (post.image_filename) {
      const filePath = path.join(UPLOAD_DIR, post.image_filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await query('DELETE FROM friend_post_like WHERE post_id=?', [id])
    await query('DELETE FROM friend_post_comment WHERE post_id=?', [id])
    await query('DELETE FROM friend_post WHERE id=?', [id])
    return { success: true }
  }
}
