import fs from 'fs'
import path from 'path'
import { query } from '../lib/database.js'

// Upload directories for user-generated images. Mirrored from the individual
// feature routes (auth.js avatars, chat.js, forum.js) so account deletion can
// remove the files those features left on disk. The friend-posts directory and
// its tables outlive the removed posts feature: no new rows are written, but
// existing data still has to be cleaned up on request.
const AVATAR_UPLOAD_DIR = 'uploads/avatars'
const CHAT_UPLOAD_DIR = 'uploads/chat'
const FORUM_UPLOAD_DIR = 'uploads/forum'
const FRIEND_POSTS_UPLOAD_DIR = 'uploads/friend-posts'

/**
 * Best-effort deletion of an uploaded file. Missing files or unlink errors are
 * ignored so a stray file never blocks account deletion.
 * @param {string} dir - Upload directory (e.g. 'uploads/forum')
 * @param {string|null|undefined} filename - Stored filename
 */
function safeUnlink (dir, filename) {
  if (!filename) return
  try {
    const filePath = path.join(dir, filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (e) {
    console.error(`Failed to delete upload ${dir}/${filename}:`, e.message)
  }
}

/**
 * Collect the on-disk image filenames tied to a user, grouped by upload dir.
 * Read up front so the files can be removed after their DB rows are deleted
 * (file deletion is not part of the transaction).
 * @param {number} userId
 * @returns {Promise<Array<{dir: string, filename: string|null|undefined}>>}
 */
export async function collectUserUploadFiles (userId) {
  const [userRow] = await query('SELECT avatar FROM user WHERE id=?', [userId])
  const chatImages = await query(
    'SELECT image FROM chat_message WHERE (from_user_id=? OR to_user_id=?) AND image IS NOT NULL',
    [userId, userId]
  )
  const friendPostImages = await query(
    'SELECT image_filename FROM friend_post WHERE user_id=? AND image_filename IS NOT NULL',
    [userId]
  )
  const forumPostImages = await query(
    'SELECT filename FROM forum_post_image WHERE post_id IN (SELECT id FROM forum_post WHERE user_id=?)',
    [userId]
  )
  const forumCommentImages = await query(
    'SELECT filename FROM forum_comment_image WHERE comment_id IN (SELECT id FROM forum_comment WHERE user_id=?)',
    [userId]
  )
  return [
    { dir: AVATAR_UPLOAD_DIR, filename: userRow?.avatar },
    ...chatImages.map(row => ({ dir: CHAT_UPLOAD_DIR, filename: row.image })),
    ...friendPostImages.map(row => ({ dir: FRIEND_POSTS_UPLOAD_DIR, filename: row.image_filename })),
    ...forumPostImages.map(row => ({ dir: FORUM_UPLOAD_DIR, filename: row.filename })),
    ...forumCommentImages.map(row => ({ dir: FORUM_UPLOAD_DIR, filename: row.filename }))
  ]
}

/**
 * Delete all user-scoped personal data (user-generated content, social graph,
 * push tokens, analytics/diagnostics) for a user. Does NOT delete the `user`
 * row itself or any team-scoped data — callers control that, since manual
 * deletion and inactivity cleanup treat the team differently.
 *
 * Safe to run against either the transactional query fn (`txQuery`) or the
 * plain `query`; pass whichever matches the caller's transaction boundary.
 * @param {(sql: string, params?: any[]) => Promise<any>} exec
 * @param {number} userId
 */
export async function deleteUserContentRows (exec, userId) {
  // Private chat: both directions of every conversation the user was part of.
  await exec('DELETE FROM chat_message WHERE from_user_id=? OR to_user_id=?', [userId, userId])

  // Forum: images → comments → post images → likes → posts.
  await exec('DELETE FROM forum_comment_image WHERE comment_id IN (SELECT id FROM forum_comment WHERE user_id=?)', [userId])
  await exec('DELETE FROM forum_comment WHERE user_id=?', [userId])
  await exec('DELETE FROM forum_post_image WHERE post_id IN (SELECT id FROM forum_post WHERE user_id=?)', [userId])
  await exec('DELETE FROM forum_post_like WHERE user_id=? OR post_id IN (SELECT id FROM forum_post WHERE user_id=?)', [userId, userId])
  await exec('DELETE FROM forum_post WHERE user_id=?', [userId])

  // Friends feed: likes and comments (own + on own posts) → posts.
  await exec('DELETE FROM friend_post_like WHERE user_id=? OR post_id IN (SELECT id FROM friend_post WHERE user_id=?)', [userId, userId])
  await exec('DELETE FROM friend_post_comment WHERE user_id=? OR post_id IN (SELECT id FROM friend_post WHERE user_id=?)', [userId, userId])
  await exec('DELETE FROM friend_post WHERE user_id=?', [userId])

  // News comments/likes.
  await exec('DELETE FROM news_like WHERE user_id=?', [userId])
  await exec('DELETE FROM news_comment WHERE user_id=?', [userId])

  // Hall of fame comments/likes (own + likes on own comments).
  await exec('DELETE FROM hall_of_fame_comment_like WHERE user_id=? OR comment_id IN (SELECT id FROM hall_of_fame_comment WHERE user_id=?)', [userId, userId])
  await exec('DELETE FROM hall_of_fame_comment WHERE user_id=?', [userId])

  // Friend relations in both directions.
  await exec('DELETE FROM user_friend WHERE user_id=? OR friend_user_id=?', [userId, userId])

  // Referral invitations sent by the user hold invitee email addresses;
  // detach the user from invitations they redeemed.
  await exec('DELETE FROM referral_invitation WHERE inviter_user_id=?', [userId])
  await exec('UPDATE referral_invitation SET used_by_user_id=NULL WHERE used_by_user_id=?', [userId])

  // Analytics / diagnostics tied to the user.
  await exec('DELETE FROM page_view WHERE user_id=?', [userId])
  await exec('DELETE FROM client_log WHERE user_id=?', [userId])

  // Push notification device tokens.
  await exec('DELETE FROM device_token WHERE user_id=?', [userId])
}

/**
 * Remove uploaded image files (call after the DB rows are committed).
 * @param {Array<{dir: string, filename: string|null|undefined}>} files
 */
export function deleteUserUploadFiles (files) {
  files.forEach(({ dir, filename }) => safeUnlink(dir, filename))
}
