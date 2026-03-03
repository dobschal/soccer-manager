import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

const VALID_LEVELS = ['debug', 'info', 'warn', 'error']
const MAX_MESSAGE_LENGTH = 4000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateLimitMap = new Map()

/**
 * Simple in-memory rate limiter per IP.
 * @param {string} ip
 * @returns {boolean} true if allowed
 */
function checkRateLimit (ip) {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX
}

export default {
  /**
   * Store a client-side log entry. No auth required.
   * @param {string} message
   * @param {string} level
   * @param {string} url
   * @param {string} platform
   * @param {Request} req
   * @returns {Promise<{ success: boolean }>}
   */
  async log (message, level, url, platform, req) {
    if (!message || typeof message !== 'string') {
      throw new BadRequestError('Message is required')
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown'
    if (!checkRateLimit(ip)) {
      throw new BadRequestError('Rate limit exceeded')
    }

    const sanitizedLevel = VALID_LEVELS.includes(level) ? level : 'info'
    const truncatedMessage = message.length > MAX_MESSAGE_LENGTH
      ? message.substring(0, MAX_MESSAGE_LENGTH)
      : message

    await query('INSERT INTO client_log SET ?', {
      level: sanitizedLevel,
      message: truncatedMessage,
      user_id: req.user?.id ?? null,
      user_agent: req.headers?.['user-agent'] ?? null,
      platform: typeof platform === 'string' ? platform.substring(0, 50) : null,
      url: typeof url === 'string' ? url.substring(0, 2000) : null
    })

    return { success: true }
  }
}
