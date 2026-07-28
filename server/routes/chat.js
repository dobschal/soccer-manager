import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { t, getUserLocale } from '../i18n/index.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
import { sendPushNotifications } from '../lib/pushNotification.js'

const UPLOAD_DIR = 'uploads/chat'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_TEXT = 2000

/**
 * Save a base64 data URL under uploads/chat. Returns the stored filename or
 * null when there is no image. Mirrors friendPosts/forum image handling.
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
   * List the current user's conversations: one entry per chat partner with
   * their username/avatar and the count of unread messages.
   * @param {Request} req
   * @returns {Promise<{success: boolean, conversations: Array}>}
   */
  async getConversations (req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const me = req.user.id

    const rows = await query(
      `SELECT CASE WHEN from_user_id=? THEN to_user_id ELSE from_user_id END AS partnerId,
              MAX(created_at) AS lastAt,
              SUM(CASE WHEN to_user_id=? AND read_at IS NULL THEN 1 ELSE 0 END) AS unread
       FROM chat_message
       WHERE from_user_id=? OR to_user_id=?
       GROUP BY partnerId
       ORDER BY lastAt DESC`,
      [me, me, me, me]
    )
    if (rows.length === 0) return { success: true, conversations: [] }

    const ids = rows.map(r => r.partnerId)
    const users = await query(
      `SELECT id, username, avatar FROM user WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    const userMap = new Map(users.map(u => [u.id, u]))
    const conversations = rows.map(r => ({
      userId: r.partnerId,
      username: userMap.get(r.partnerId)?.username ?? '?',
      avatar: userMap.get(r.partnerId)?.avatar ?? null,
      unread: Number(r.unread)
    }))
    return { success: true, conversations }
  },

  /**
   * Fetch the conversation with one user (chronological) and mark the messages
   * they sent me as read.
   * @param {number} withUserId
   * @param {Request} req
   * @returns {Promise<{success: boolean, partner: Object, messages: Array}>}
   */
  async getChatMessages (withUserId, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const me = req.user.id
    const other = Number(withUserId)
    if (!other || other === me) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const [partner] = await query('SELECT id, username, avatar FROM user WHERE id=?', [other])
    if (!partner) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const messages = await query(
      `SELECT id, from_user_id, to_user_id, text, image, read_at, created_at
       FROM chat_message
       WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)
       ORDER BY created_at ASC`,
      [me, other, other, me]
    )

    // Mark everything they sent me as read.
    await query(
      'UPDATE chat_message SET read_at=NOW() WHERE to_user_id=? AND from_user_id=? AND read_at IS NULL',
      [me, other]
    )

    return { success: true, partner, messages }
  },

  /**
   * Send a chat message (text and/or image) to another user. Notifies the
   * recipient live via websocket and via push (with a deep link to the chat).
   * @param {number} toUserId
   * @param {string} text
   * @param {{data?: string, type?: string}} [image]
   * @param {Request} req
   * @returns {Promise<{success: boolean, message: Object}>}
   */
  async sendChatMessage (toUserId, text, image, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const me = req.user.id
    const other = Number(toUserId)
    if (!other || other === me) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const [recipient] = await query('SELECT id, username FROM user WHERE id=?', [other])
    if (!recipient) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const safeText = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : ''
    const filename = saveImage(image)
    if (!safeText && !filename) throw new BadRequestError(t('error.chatEmptyMessage', {}, locale))

    const result = await query('INSERT INTO chat_message SET ?', {
      from_user_id: me,
      to_user_id: other,
      text: safeText || null,
      image: filename
    })
    const [message] = await query('SELECT * FROM chat_message WHERE id=?', [result.insertId])

    // Live notify the recipient.
    sendToUser(other, SERVER_EVENTS.NEW_CHAT_MESSAGE.name, { fromUserId: me, message })

    // Best-effort push notification with a deep link straight into the chat.
    try {
      const recipientLocale = await getUserLocale(other)
      const preview = safeText || t('chat.imageMessage', {}, recipientLocale)
      await sendPushNotifications(
        [other],
        req.user.username,
        preview,
        { type: 'CHAT', deep_link: `#dashboard?chat_user=${me}` }
      )
    } catch (e) {
      console.error('Failed to send chat push notification:', e)
    }

    return { success: true, message }
  },

  /**
   * Total number of unread chat messages for the current user (for the
   * dashboard "Action Required" badge).
   * @param {Request} req
   * @returns {Promise<{success: boolean, count: number}>}
   */
  async getUnreadChatCount (req) {
    if (!req.user) return { success: true, count: 0, latestUserId: null }
    const [{ count }] = await query(
      'SELECT COUNT(*) AS count FROM chat_message WHERE to_user_id=? AND read_at IS NULL',
      [req.user.id]
    )
    const [latest] = await query(
      'SELECT from_user_id FROM chat_message WHERE to_user_id=? AND read_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    )
    return { success: true, count: Number(count), latestUserId: latest?.from_user_id ?? null }
  }

}
