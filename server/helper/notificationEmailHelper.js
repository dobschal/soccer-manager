import { query } from '../lib/database.js'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = 'uploads/notification'
const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

/**
 * Express handler that serves a notification email image by its public
 * token and increments the parent notification's open counter once per
 * request. The endpoint sets no-cache headers so email clients re-fetch
 * the image on each open, but caching is at the client's discretion.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function serveNotificationEmailImage (req, res) {
  const token = req.params.token
  if (typeof token !== 'string' || !/^[a-f0-9]{1,128}$/.test(token)) {
    return res.status(404).type('text/plain').send('Not found')
  }
  const [row] = await query(
    'SELECT id, image_filename FROM notification_email WHERE image_token=? LIMIT 1',
    [token]
  )
  if (!row) {
    return res.status(404).type('text/plain').send('Not found')
  }
  const filePath = path.join(UPLOAD_DIR, row.image_filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).type('text/plain').send('Not found')
  }

  // Best-effort open tracking — never block image delivery on a DB error.
  try {
    await query('UPDATE notification_email SET open_count = open_count + 1 WHERE id=?', [row.id])
  } catch (e) {
    console.error('[NotificationEmail] Failed to increment open_count:', e?.message ?? e)
  }

  const ext = (row.image_filename.split('.').pop() || '').toLowerCase()
  const mime = MIME_TYPES[ext] || 'application/octet-stream'
  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  fs.createReadStream(filePath).pipe(res)
}
