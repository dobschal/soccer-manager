import { query } from '../lib/database.js'
import { maskBadWords } from '../lib/badWordsFilter.js'
import { BadRequestError } from '../lib/errors.js'
import { isAllowedBadgeColor } from '../../client/util/forumBadgeColors.js'
import { recordForumMentions, markMentionsSeenForPost, getUnseenMentions } from '../helper/forumMentionHelper.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const UPLOAD_DIR = 'uploads/forum'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_IMAGES_PER_COMMENT = 5
const MAX_IMAGES_PER_POST = 5
const EDIT_WINDOW_MS = 4 * 60 * 60 * 1000 // 4 hours

function assertAdmin (req) {
  if (!req.user?.is_admin) {
    throw new BadRequestError('This action is only available for the admin')
  }
}

function isWithinEditWindow (createdAt) {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return Date.now() - created <= EDIT_WINDOW_MS
}

export default {

  async getForumMentions (req) {
    const mentions = await getUnseenMentions(req.user.id, 20)
    return { mentions }
  },

  async searchUsersForMention (queryString, _req) {
    if (typeof queryString !== 'string' || queryString.length < 1) {
      return { users: [] }
    }
    const trimmed = queryString.trim()
    if (!trimmed) return { users: [] }
    const starts = `${trimmed}%`
    const contains = `%${trimmed}%`
    const users = await query(
      `SELECT id, username FROM user
       WHERE username LIKE ? OR username LIKE ?
       ORDER BY (username LIKE ?) DESC, last_login DESC
       LIMIT 8`,
      [starts, contains, starts]
    )
    return { users }
  },

  async getForumCategories (req) {
    const categories = await query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM forum_post p WHERE p.category_id = c.id AND p.is_archived = 0) AS post_count,
        (SELECT MAX(activity) FROM (
          SELECT p.created_at AS activity FROM forum_post p WHERE p.category_id = c.id AND p.is_archived = 0
          UNION ALL
          SELECT co.created_at FROM forum_comment co
            JOIN forum_post p ON co.post_id = p.id
            WHERE p.category_id = c.id AND p.is_archived = 0
        ) AS combined) AS last_activity
      FROM forum_category c
      ORDER BY c.sort_order ASC, c.created_at ASC
    `)
    const latestComments = await query(`
      SELECT c.id, c.text, c.created_at,
        p.id AS post_id, p.title AS post_title, p.category_id,
        u.username
      FROM forum_comment c
      JOIN forum_post p ON p.id = c.post_id
      JOIN user u ON u.id = c.user_id
      WHERE p.is_archived = 0
      ORDER BY c.created_at DESC
      LIMIT 30
    `)
    const latestPosts = await query(`
      SELECT p.id, p.title, p.text, p.created_at, p.category_id,
        u.username
      FROM forum_post p
      JOIN user u ON u.id = p.user_id
      WHERE p.is_archived = 0
      ORDER BY p.created_at DESC
      LIMIT 30
    `)
    const mentions = req?.user?.id ? await getUnseenMentions(req.user.id, 10) : []
    return { categories, latestComments, latestPosts, mentions }
  },

  async createForumCategory (name, description, req) {
    assertAdmin(req)
    if (!name || !name.trim()) {
      throw new BadRequestError('Category name cannot be empty')
    }
    const maxOrder = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM forum_category')
    await query('INSERT INTO forum_category SET ?', {
      name: name.trim(),
      description: (description || '').trim(),
      sort_order: maxOrder[0].next_order
    })
    return { success: true }
  },

  async updateForumCategory (categoryId, name, description, req) {
    assertAdmin(req)
    if (!name || !name.trim()) {
      throw new BadRequestError('Category name cannot be empty')
    }
    await query('UPDATE forum_category SET name = ?, description = ? WHERE id = ?', [
      name.trim(),
      (description || '').trim(),
      categoryId
    ])
    return { success: true }
  },

  async deleteForumCategory (categoryId, req) {
    assertAdmin(req)
    // Delete all related data
    const posts = await query('SELECT id FROM forum_post WHERE category_id = ?', [categoryId])
    if (posts.length > 0) {
      const postIds = posts.map(p => p.id)
      const placeholders = postIds.map(() => '?').join(', ')
      const comments = await query(`SELECT id FROM forum_comment WHERE post_id IN (${placeholders})`, postIds)
      if (comments.length > 0) {
        const commentIds = comments.map(c => c.id)
        const cPlaceholders = commentIds.map(() => '?').join(', ')
        const images = await query(`SELECT filename FROM forum_comment_image WHERE comment_id IN (${cPlaceholders})`, commentIds)
        for (const img of images) {
          const filePath = path.join(UPLOAD_DIR, img.filename)
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
        }
        await query(`DELETE FROM forum_comment_image WHERE comment_id IN (${cPlaceholders})`, commentIds)
      }
      const postImages = await query(`SELECT filename FROM forum_post_image WHERE post_id IN (${placeholders})`, postIds)
      for (const img of postImages) {
        const filePath = path.join(UPLOAD_DIR, img.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
      await query(`DELETE FROM forum_post_image WHERE post_id IN (${placeholders})`, postIds)
      await query(`DELETE FROM forum_comment WHERE post_id IN (${placeholders})`, postIds)
      await query(`DELETE FROM forum_post_like WHERE post_id IN (${placeholders})`, postIds)
    }
    await query('DELETE FROM forum_post WHERE category_id = ?', [categoryId])
    await query('DELETE FROM forum_category WHERE id = ?', [categoryId])
    return { success: true }
  },

  async getForumPosts (categoryId, page, badgeFilter, includeArchived, req) {
    const perPage = 20
    const offset = ((page || 1) - 1) * perPage
    const userId = req.user.id

    const [category] = await query('SELECT * FROM forum_category WHERE id = ?', [categoryId])
    if (!category) throw new BadRequestError('Category not found')

    const trimmedBadge = typeof badgeFilter === 'string' ? badgeFilter.trim() : ''
    const badgeFilterClause = trimmedBadge ? ' AND p.badge_text = ?' : ''
    const archivedClause = includeArchived ? '' : ' AND p.is_archived = 0'
    const baseParams = trimmedBadge ? [categoryId, trimmedBadge] : [categoryId]

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM forum_post p WHERE p.category_id = ?${badgeFilterClause}${archivedClause}`,
      baseParams
    )

    const [{ archived_total: archivedTotal }] = await query(
      `SELECT COUNT(*) AS archived_total FROM forum_post WHERE category_id = ? AND is_archived = 1`,
      [categoryId]
    )

    const availableBadges = await query(
      `SELECT DISTINCT badge_text, badge_color FROM forum_post
       WHERE category_id = ? AND badge_text IS NOT NULL AND badge_text <> ''${includeArchived ? '' : ' AND is_archived = 0'}
       ORDER BY badge_text ASC`,
      [categoryId]
    )

    const posts = await query(`
      SELECT p.id, p.title, p.text, p.created_at, p.user_id, p.team_id,
        p.badge_text, p.badge_color, p.is_archived,
        u.username,
        t.name AS team_name,
        (SELECT COUNT(*) FROM forum_post_like l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM forum_comment c WHERE c.post_id = p.id) AS comment_count,
        (SELECT COUNT(*) FROM forum_post_like l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
        COALESCE(
          (SELECT MAX(c.created_at) FROM forum_comment c WHERE c.post_id = p.id),
          p.created_at
        ) AS last_activity
      FROM forum_post p
      JOIN user u ON u.id = p.user_id
      LEFT JOIN team t ON t.id = p.team_id
      WHERE p.category_id = ?${badgeFilterClause}${archivedClause}
      ORDER BY last_activity DESC
      LIMIT ? OFFSET ?
    `, [userId, ...baseParams, perPage, offset])

    for (const post of posts) {
      post.liked = post.liked > 0
    }

    return {
      category,
      posts,
      total,
      page: page || 1,
      totalPages: Math.ceil(total / perPage),
      availableBadges,
      badgeFilter: trimmedBadge || null,
      archivedCount: archivedTotal,
      includeArchived: !!includeArchived
    }
  },

  async createForumPost (categoryId, title, text, images, req) {
    if (!title || !title.trim()) throw new BadRequestError('Title cannot be empty')
    if (!text || !text.trim()) throw new BadRequestError('Text cannot be empty')
    if (title.length > 255) throw new BadRequestError('Title too long')
    if (text.length > 5000) throw new BadRequestError('Text too long')

    if (images && images.length > MAX_IMAGES_PER_POST) {
      throw new BadRequestError(`Maximum ${MAX_IMAGES_PER_POST} images per post`)
    }

    const [category] = await query('SELECT id, name FROM forum_category WHERE id = ?', [categoryId])
    if (!category) throw new BadRequestError('Category not found')

    if (category.name === 'News' && !req.user?.is_admin) {
      throw new BadRequestError('Only admins can post in the News category')
    }

    const [team] = await query('SELECT id, name FROM team WHERE user_id = ?', [req.user.id])

    const cleanedTitle = maskBadWords(title.trim())
    const cleanedText = maskBadWords(text.trim())
    const result = await query('INSERT INTO forum_post SET ?', {
      category_id: categoryId,
      user_id: req.user.id,
      team_id: team?.id || null,
      title: cleanedTitle,
      text: cleanedText
    })

    const postId = result.insertId

    await recordForumMentions({
      text: cleanedText,
      authorUserId: req.user.id,
      authorUsername: req.user.username,
      postId,
      postTitle: cleanedTitle,
      commentId: null
    })

    if (images && images.length > 0) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      for (const img of images) {
        if (!img.data || !img.type) continue
        if (!ALLOWED_TYPES.includes(img.type)) continue
        const base64Data = img.data.replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        if (buffer.length > MAX_IMAGE_SIZE) continue
        const ext = img.type.split('/')[1].replace('jpeg', 'jpg')
        const filename = `${crypto.randomUUID()}.${ext}`
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
        await query('INSERT INTO forum_post_image SET ?', { post_id: postId, filename })
      }
    }

    return { postId }
  },

  async getForumPost (postId, req) {
    const userId = req.user.id

    const [post] = await query(`
      SELECT p.*, u.username, t.name AS team_name, c.name AS category_name,
        (SELECT COUNT(*) FROM forum_post_like l WHERE l.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM forum_post_like l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
      FROM forum_post p
      JOIN user u ON u.id = p.user_id
      JOIN forum_category c ON c.id = p.category_id
      LEFT JOIN team t ON t.id = p.team_id
      WHERE p.id = ?
    `, [userId, postId])

    if (!post) throw new BadRequestError('Post not found')
    post.liked = post.liked > 0

    // Mark any unseen @-mentions of this user on this post as seen now.
    await markMentionsSeenForPost(userId, postId)

    post.images = await query(
      'SELECT id, filename FROM forum_post_image WHERE post_id = ?',
      [postId]
    )

    const comments = await query(`
      SELECT c.id, c.text, c.created_at, c.user_id, c.team_id,
        u.username, t.name AS team_name
      FROM forum_comment c
      JOIN user u ON u.id = c.user_id
      LEFT JOIN team t ON t.id = c.team_id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `, [postId])

    if (comments.length > 0) {
      const commentIds = comments.map(c => c.id)
      const placeholders = commentIds.map(() => '?').join(', ')
      const images = await query(
        `SELECT id, comment_id, filename FROM forum_comment_image WHERE comment_id IN (${placeholders})`,
        commentIds
      )
      const imagesByComment = {}
      for (const img of images) {
        if (!imagesByComment[img.comment_id]) imagesByComment[img.comment_id] = []
        imagesByComment[img.comment_id].push({ id: img.id, filename: img.filename })
      }
      for (const comment of comments) {
        comment.images = imagesByComment[comment.id] || []
      }
    }

    return { post, comments }
  },

  async toggleForumPostLike (postId, req) {
    const userId = req.user.id

    const existing = await query(
      'SELECT id FROM forum_post_like WHERE post_id=? AND user_id=?',
      [postId, userId]
    )

    if (existing.length > 0) {
      await query('DELETE FROM forum_post_like WHERE post_id=? AND user_id=?', [postId, userId])
    } else {
      await query('INSERT INTO forum_post_like SET ?', { post_id: postId, user_id: userId })
    }

    const [{ count }] = await query(
      'SELECT COUNT(*) as count FROM forum_post_like WHERE post_id=?',
      [postId]
    )

    return { liked: existing.length === 0, likeCount: count }
  },

  async addForumComment (postId, text, images, req) {
    if (!text || !text.trim()) throw new BadRequestError('Comment text cannot be empty')
    if (text.length > 1000) throw new BadRequestError('Comment text too long')

    const [post] = await query('SELECT id FROM forum_post WHERE id = ?', [postId])
    if (!post) throw new BadRequestError('Post not found')

    if (images && images.length > MAX_IMAGES_PER_COMMENT) {
      throw new BadRequestError(`Maximum ${MAX_IMAGES_PER_COMMENT} images per comment`)
    }

    const [team] = await query('SELECT id, name FROM team WHERE user_id = ?', [req.user.id])

    const cleanedText = maskBadWords(text.trim())
    const result = await query('INSERT INTO forum_comment SET ?', {
      post_id: postId,
      user_id: req.user.id,
      team_id: team?.id || null,
      text: cleanedText
    })

    const commentId = result.insertId
    const savedImages = []

    const [postForMention] = await query('SELECT title FROM forum_post WHERE id = ?', [postId])
    await recordForumMentions({
      text: cleanedText,
      authorUserId: req.user.id,
      authorUsername: req.user.username,
      postId,
      postTitle: postForMention?.title || '',
      commentId
    })

    if (images && images.length > 0) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      for (const img of images) {
        if (!img.data || !img.type) continue
        if (!ALLOWED_TYPES.includes(img.type)) continue
        const base64Data = img.data.replace(/^data:[^;]+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        if (buffer.length > MAX_IMAGE_SIZE) continue
        const ext = img.type.split('/')[1].replace('jpeg', 'jpg')
        const filename = `${crypto.randomUUID()}.${ext}`
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
        await query('INSERT INTO forum_comment_image SET ?', { comment_id: commentId, filename })
        savedImages.push({ filename })
      }
    }

    const [comment] = await query(`
      SELECT c.id, c.text, c.created_at, c.user_id, c.team_id,
        u.username, t.name AS team_name
      FROM forum_comment c
      JOIN user u ON u.id = c.user_id
      LEFT JOIN team t ON t.id = c.team_id
      WHERE c.id = ?
    `, [commentId])

    comment.images = savedImages
    return { comment }
  },

  async updateForumPost (postId, title, text, req) {
    if (!title || !title.trim()) throw new BadRequestError('Title cannot be empty')
    if (!text || !text.trim()) throw new BadRequestError('Text cannot be empty')
    if (title.length > 255) throw new BadRequestError('Title too long')
    if (text.length > 5000) throw new BadRequestError('Text too long')

    const [post] = await query('SELECT user_id, created_at FROM forum_post WHERE id = ?', [postId])
    if (!post) throw new BadRequestError('Post not found')
    if (post.user_id !== req.user.id) throw new BadRequestError('You can only edit your own posts')
    if (!isWithinEditWindow(post.created_at)) {
      throw new BadRequestError('Posts can only be edited within 4 hours of creation')
    }

    await query('UPDATE forum_post SET title = ?, text = ? WHERE id = ?', [
      maskBadWords(title.trim()),
      maskBadWords(text.trim()),
      postId
    ])
    return { success: true }
  },

  async updateForumComment (commentId, text, req) {
    if (!text || !text.trim()) throw new BadRequestError('Comment text cannot be empty')
    if (text.length > 1000) throw new BadRequestError('Comment text too long')

    const [comment] = await query('SELECT user_id, created_at FROM forum_comment WHERE id = ?', [commentId])
    if (!comment) throw new BadRequestError('Comment not found')
    if (comment.user_id !== req.user.id) throw new BadRequestError('You can only edit your own comments')
    if (!isWithinEditWindow(comment.created_at)) {
      throw new BadRequestError('Comments can only be edited within 4 hours of creation')
    }

    await query('UPDATE forum_comment SET text = ? WHERE id = ?', [
      maskBadWords(text.trim()),
      commentId
    ])
    return { success: true }
  },

  async deleteForumPost (postId, req) {
    const [post] = await query('SELECT user_id FROM forum_post WHERE id = ?', [postId])
    if (!post) throw new BadRequestError('Post not found')
    if (!req.user?.is_admin && post.user_id !== req.user.id) {
      throw new BadRequestError('You can only delete your own posts')
    }

    const comments = await query('SELECT id FROM forum_comment WHERE post_id = ?', [postId])
    if (comments.length > 0) {
      const commentIds = comments.map(c => c.id)
      const placeholders = commentIds.map(() => '?').join(', ')
      const images = await query(`SELECT filename FROM forum_comment_image WHERE comment_id IN (${placeholders})`, commentIds)
      for (const img of images) {
        const filePath = path.join(UPLOAD_DIR, img.filename)
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      }
      await query(`DELETE FROM forum_comment_image WHERE comment_id IN (${placeholders})`, commentIds)
    }
    const postImages = await query('SELECT filename FROM forum_post_image WHERE post_id = ?', [postId])
    for (const img of postImages) {
      const filePath = path.join(UPLOAD_DIR, img.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await query('DELETE FROM forum_post_image WHERE post_id = ?', [postId])
    await query('DELETE FROM forum_comment WHERE post_id = ?', [postId])
    await query('DELETE FROM forum_post_like WHERE post_id = ?', [postId])
    await query('DELETE FROM forum_post WHERE id = ?', [postId])
    return { success: true }
  },

  async setForumPostBadge (postId, badgeText, badgeColor, req) {
    assertAdmin(req)
    if (!badgeText || !badgeText.trim()) throw new BadRequestError('Badge text cannot be empty')
    if (badgeText.length > 50) throw new BadRequestError('Badge text too long')
    if (!badgeColor || !isAllowedBadgeColor(badgeColor)) throw new BadRequestError('Invalid badge color')
    await query('UPDATE forum_post SET badge_text = ?, badge_color = ? WHERE id = ?', [
      badgeText.trim(),
      badgeColor,
      postId
    ])
    return { success: true }
  },

  async removeForumPostBadge (postId, req) {
    assertAdmin(req)
    await query('UPDATE forum_post SET badge_text = NULL, badge_color = NULL WHERE id = ?', [postId])
    return { success: true }
  },

  async setForumPostArchived (postId, isArchived, req) {
    assertAdmin(req)
    const [post] = await query('SELECT id FROM forum_post WHERE id = ?', [postId])
    if (!post) throw new BadRequestError('Post not found')
    await query('UPDATE forum_post SET is_archived = ? WHERE id = ?', [isArchived ? 1 : 0, postId])
    return { success: true }
  },

  async deleteForumComment (commentId, req) {
    const [comment] = await query('SELECT user_id FROM forum_comment WHERE id = ?', [commentId])
    if (!comment) throw new BadRequestError('Comment not found')
    if (!req.user?.is_admin && comment.user_id !== req.user.id) {
      throw new BadRequestError('You can only delete your own comments')
    }

    const images = await query('SELECT filename FROM forum_comment_image WHERE comment_id = ?', [commentId])
    for (const img of images) {
      const filePath = path.join(UPLOAD_DIR, img.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await query('DELETE FROM forum_comment_image WHERE comment_id = ?', [commentId])
    await query('DELETE FROM forum_comment WHERE id = ?', [commentId])
    return { success: true }
  }
}
