import { query } from '../lib/database.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

// Username chars allowed in mentions: letters, digits, underscore, dash, dot.
// Stops at whitespace and most punctuation. Length 2..30 matches user model.
const MENTION_REGEX = /(^|[^\w@])@([A-Za-z0-9_.-]{2,30})/g

/**
 * Extract unique mentioned usernames from a piece of text.
 * @param {string} text
 * @returns {string[]}
 */
export function extractMentionUsernames (text) {
  if (typeof text !== 'string' || !text) return []
  const out = new Set()
  let m
  MENTION_REGEX.lastIndex = 0
  while ((m = MENTION_REGEX.exec(text)) !== null) {
    out.add(m[2])
  }
  return Array.from(out)
}

/**
 * Look up user IDs for the given usernames (case-insensitive).
 * @param {string[]} usernames
 * @returns {Promise<Array<{id: number, username: string, language: string|null}>>}
 */
export async function resolveMentionedUsers (usernames) {
  if (!usernames || usernames.length === 0) return []
  const placeholders = usernames.map(() => '?').join(',')
  return query(
    `SELECT id, username, language FROM user WHERE LOWER(username) IN (${placeholders})`,
    usernames.map(u => u.toLowerCase())
  )
}

const NOTIFICATION_TRANSLATIONS = {
  en: {
    title: 'You were mentioned in the forum',
    body: (author, postTitle) => `${author} mentioned you in "${postTitle}"`
  },
  de: {
    title: 'Du wurdest im Forum erwähnt',
    body: (author, postTitle) => `${author} hat dich in "${postTitle}" erwähnt`
  }
}

/**
 * Record mentions for a post or comment and notify the mentioned users.
 *
 * @param {object} args
 * @param {string} args.text - raw text containing potential @mentions
 * @param {number} args.authorUserId - id of the user creating the post/comment
 * @param {string} args.authorUsername
 * @param {number} args.postId
 * @param {string} args.postTitle
 * @param {number|null} args.commentId - null for posts
 * @returns {Promise<void>}
 */
export async function recordForumMentions ({ text, authorUserId, authorUsername, postId, postTitle, commentId = null }) {
  const usernames = extractMentionUsernames(text)
  if (usernames.length === 0) return

  const users = await resolveMentionedUsers(usernames)
  const mentioned = users.filter(u => u.id !== authorUserId)
  if (mentioned.length === 0) return

  for (const u of mentioned) {
    await query(
      'INSERT INTO forum_mention SET ?',
      { mentioned_user_id: u.id, author_user_id: authorUserId, post_id: postId, comment_id: commentId }
    )
  }

  try {
    const byLanguage = {}
    for (const u of mentioned) {
      const lang = u.language || 'en'
      if (!byLanguage[lang]) byLanguage[lang] = []
      byLanguage[lang].push(u.id)
    }
    for (const [lang, userIds] of Object.entries(byLanguage)) {
      const tr = NOTIFICATION_TRANSLATIONS[lang] || NOTIFICATION_TRANSLATIONS.en
      await sendPushNotifications(
        userIds,
        tr.title,
        tr.body(authorUsername, postTitle),
        { type: 'FORUM_MENTION', postId, commentId: commentId || undefined }
      )
    }
  } catch (e) {
    console.error('[ForumMention] failed to send push notifications:', e)
  }
}

/**
 * Count unseen mentions for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
export async function countUnseenMentions (userId) {
  const rows = await query(
    'SELECT COUNT(*) AS count FROM forum_mention WHERE mentioned_user_id = ? AND seen_at IS NULL',
    [userId]
  )
  return rows?.[0]?.count ?? 0
}

/**
 * Fetch unseen mentions enriched with the surrounding post/comment info.
 * @param {number} userId
 * @param {number} [limit]
 */
export async function getUnseenMentions (userId, limit = 20) {
  return query(
    `SELECT m.id, m.post_id, m.comment_id, m.created_at,
        p.title AS post_title, p.category_id,
        u.username AS author_username,
        CASE WHEN m.comment_id IS NULL THEN p.text ELSE c.text END AS snippet
     FROM forum_mention m
     JOIN forum_post p ON p.id = m.post_id
     LEFT JOIN forum_comment c ON c.id = m.comment_id
     JOIN user u ON u.id = m.author_user_id
     WHERE m.mentioned_user_id = ? AND m.seen_at IS NULL AND p.is_archived = 0
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [userId, limit]
  )
}

/**
 * Mark all unseen mentions for a user that point at the given post as seen.
 * @param {number} userId
 * @param {number} postId
 */
export async function markMentionsSeenForPost (userId, postId) {
  await query(
    'UPDATE forum_mention SET seen_at = NOW() WHERE mentioned_user_id = ? AND post_id = ? AND seen_at IS NULL',
    [userId, postId]
  )
}
