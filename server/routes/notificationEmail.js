import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import { sendNotificationEmail } from '../lib/email.js'
import { config } from '../config.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const UPLOAD_DIR = 'uploads/notification'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 4 * 1024 * 1024 // 4MB
const MAX_TITLE_LENGTH = 200
const MAX_BODY_LENGTH = 4000

function assertAdmin (req) {
  if (!req.user?.is_admin) {
    throw new BadRequestError('This action is only available for admins')
  }
}

function saveImage (data, type) {
  if (!data || typeof data !== 'string') {
    throw new BadRequestError('Image is required')
  }
  if (!ALLOWED_TYPES.includes(type)) {
    throw new BadRequestError('Invalid image type')
  }
  const base64Data = data.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.length === 0) {
    throw new BadRequestError('Image is required')
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new BadRequestError('Image too large')
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  const ext = type.split('/')[1].replace('jpeg', 'jpg')
  const filename = `${crypto.randomUUID()}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
  return filename
}

export default {

  /**
   * Send a marketing-style notification email to every user with a
   * verified email address (admin only). The email contains a title, a
   * free-form body text and a large image. The image is served from a
   * public tracking URL so loads can be counted as a proxy for "opens".
   * @param {string} title
   * @param {string} bodyText
   * @param {string} imageData - base64 data URL of the image
   * @param {string} imageType - MIME type, e.g. "image/png"
   * @param {Request} req
   * @returns {Promise<{ sent: number, recipients: number }>}
   */
  async sendAdminNotificationEmail (title, bodyText, imageData, imageType, req) {
    assertAdmin(req)
    if (typeof title !== 'string' || !title.trim()) {
      throw new BadRequestError('Title is required')
    }
    if (typeof bodyText !== 'string' || !bodyText.trim()) {
      throw new BadRequestError('Body text is required')
    }
    if (title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestError('Title too long')
    }
    if (bodyText.length > MAX_BODY_LENGTH) {
      throw new BadRequestError('Body text too long')
    }

    const filename = saveImage(imageData, imageType)
    const imageToken = crypto.randomBytes(24).toString('hex')

    const insert = await query('INSERT INTO notification_email SET ?', {
      title: title.trim(),
      body_text: bodyText.trim(),
      image_filename: filename,
      image_token: imageToken,
      recipient_count: 0,
      open_count: 0
    })
    const notificationId = insert.insertId

    const users = await query(
      'SELECT id, username, email, language FROM user WHERE email IS NOT NULL AND email <> "" AND email_opt_out = 0'
    )

    const imageUrl = `${config.PUBLIC_URL}/notification-image/${imageToken}`
    let sent = 0
    for (const user of users) {
      const locale = user.language === 'de' ? 'de' : 'en'
      try {
        const result = await sendNotificationEmail({
          toEmail: user.email,
          locale,
          username: user.username,
          title: title.trim(),
          bodyText: bodyText.trim(),
          imageUrl
        })
        if (result.sent) sent++
      } catch (e) {
        console.error(`[NotificationEmail] Failed for ${user.email}:`, e?.message ?? e)
      }
    }

    await query(
      'UPDATE notification_email SET recipient_count=? WHERE id=?',
      [users.length, notificationId]
    )

    console.log(`Admin "${req.user.username}" sent notification email "${title.trim()}" to ${users.length} users (delivered=${sent})`)
    return { sent, recipients: users.length }
  },

  /**
   * Return the list of previously sent admin notification emails — newest
   * first. Used by the admin Marketing page to render the history table.
   * @param {Request} req
   * @returns {Promise<{ rows: Array<{ id: number, title: string, recipient_count: number, open_count: number, created_at: string, image_url: string }> }>}
   */
  async getNotificationEmails (req) {
    assertAdmin(req)
    const rows = await query(
      `SELECT id, title, image_token, recipient_count, open_count, created_at
       FROM notification_email
       ORDER BY created_at DESC
       LIMIT 100`
    )
    return {
      rows: rows.map(r => ({
        id: r.id,
        title: r.title,
        recipient_count: Number(r.recipient_count) || 0,
        open_count: Number(r.open_count) || 0,
        created_at: r.created_at,
        image_url: `${config.PUBLIC_URL}/notification-image/${r.image_token}`
      }))
    }
  }
}
