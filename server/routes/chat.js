import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { query } from '../lib/database.js'
import { BadRequestError, UnauthorizedError } from '../lib/errors.js'
import { t, getUserLocale } from '../i18n/index.js'
import { sendToUser } from '../lib/websocket.js'
import { SERVER_EVENTS } from '../../client/lib/serverEvents.js'
import { sendPushNotifications } from '../lib/pushNotification.js'
import { truncateChars } from '../lib/util.js'

const UPLOAD_DIR = 'uploads/chat'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 8 * 1024 * 1024 // 8MB
const MAX_TEXT = 2000

/**
 * Voice-message container types (#541). Browsers do not agree on one: Chrome
 * and Firefox record WebM/Opus, Safari and iOS record MP4/AAC, so both have to
 * be accepted and stored as-is.
 * @type {Record<string, string>}
 */
const ALLOWED_AUDIO_TYPES = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac'
}

/** A minute of Opus is well under this; the cap is only there to stop abuse. */
const MAX_AUDIO_SIZE = 4 * 1024 * 1024

/** Longest voice message we keep, in seconds. */
export const MAX_AUDIO_DURATION_SECONDS = 120

/**
 * Save a base64 data URL under uploads/chat. Returns the stored filename or
 * null when there is no image. Mirrors the forum's image handling.
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

/**
 * Save a base64-encoded voice recording under uploads/chat. Returns the stored
 * filename and its duration, or nulls when there is no recording (#541).
 * @param {{data?: string, type?: string, duration?: number}} audio
 * @returns {{filename: string|null, duration: number|null}}
 */
function saveAudio (audio) {
  if (!audio || !audio.data || !audio.type) return { filename: null, duration: null }
  // Chrome appends codec parameters ("audio/webm;codecs=opus") — the container
  // is what matters for storage and playback.
  const container = String(audio.type).split(';')[0].trim()
  const ext = ALLOWED_AUDIO_TYPES[container]
  if (!ext) {
    throw new BadRequestError('Unsupported audio type')
  }
  const base64Data = audio.data.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.length > MAX_AUDIO_SIZE) {
    throw new BadRequestError('Voice message too large')
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const filename = `${crypto.randomUUID()}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  const rawDuration = Math.round(Number(audio.duration) || 0)
  const duration = Math.min(MAX_AUDIO_DURATION_SECONDS, Math.max(0, rawDuration))
  return { filename, duration }
}

export default {

  /**
   * List the current user's conversations: one entry per chat partner with
   * their username/avatar, the count of unread messages and a preview of the
   * most recent message (text plus its kind and timestamp) so the friends page
   * can render a WhatsApp-style chat list.
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
              MAX(id) AS lastMessageId,
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

    // The newest message per conversation. `id` is auto-increment, so the
    // highest id in a conversation is also its most recent message.
    const lastIds = rows.map(r => r.lastMessageId)
    const lastMessages = await query(
      `SELECT id, from_user_id, text, image, audio, created_at
       FROM chat_message WHERE id IN (${lastIds.map(() => '?').join(',')})`,
      lastIds
    )
    const messageMap = new Map(lastMessages.map(m => [m.id, m]))

    const conversations = rows.map(r => {
      const last = messageMap.get(r.lastMessageId)
      return {
        userId: r.partnerId,
        username: userMap.get(r.partnerId)?.username ?? '?',
        avatar: userMap.get(r.partnerId)?.avatar ?? null,
        unread: Number(r.unread),
        lastMessageAt: last?.created_at ?? r.lastAt,
        // The preview is assembled client-side so "Photo"/"Voice message"
        // placeholders follow the reader's locale, not the sender's.
        lastMessage: last
          ? {
            text: last.text ?? null,
            hasImage: Boolean(last.image),
            hasAudio: Boolean(last.audio),
            fromMe: Number(last.from_user_id) === Number(me)
          }
          : null
      }
    })
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
      `SELECT id, from_user_id, to_user_id, text, image, audio, audio_duration, read_at, created_at
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
   * @param {{data?: string, type?: string, duration?: number}} [audio] - voice message (#541)
   * @param {Request} req
   * @returns {Promise<{success: boolean, message: Object}>}
   */
  async sendChatMessage (toUserId, text, image, audio, req) {
    const locale = req.locale || 'en'
    if (!req.user) throw new UnauthorizedError(t('error.notAuthorized', {}, locale))
    const me = req.user.id
    const other = Number(toUserId)
    if (!other || other === me) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const [recipient] = await query('SELECT id, username FROM user WHERE id=?', [other])
    if (!recipient) throw new BadRequestError(t('error.chatInvalidUser', {}, locale))

    const safeText = typeof text === 'string' ? truncateChars(text.trim(), MAX_TEXT) : ''
    const filename = saveImage(image)
    const { filename: audioFile, duration: audioDuration } = saveAudio(audio)
    if (!safeText && !filename && !audioFile) throw new BadRequestError(t('error.chatEmptyMessage', {}, locale))

    const result = await query('INSERT INTO chat_message SET ?', {
      from_user_id: me,
      to_user_id: other,
      text: safeText || null,
      image: filename,
      audio: audioFile,
      audio_duration: audioDuration
    })
    const [message] = await query('SELECT * FROM chat_message WHERE id=?', [result.insertId])

    // Live notify the recipient.
    sendToUser(other, SERVER_EVENTS.NEW_CHAT_MESSAGE.name, { fromUserId: me, message })

    // Best-effort push notification with a deep link straight into the chat.
    try {
      const recipientLocale = await getUserLocale(other)
      const preview = safeText ||
        (audioFile ? t('chat.voiceMessage', {}, recipientLocale) : t('chat.imageMessage', {}, recipientLocale))
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
