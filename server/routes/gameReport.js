import { BadRequestError } from '../lib/errors.js'
import { getLocaleFromRequest } from '../i18n/index.js'
import { isLlmConfigured } from '../lib/openRouter.js'
import { generateGameReport, getStoredGameReport } from '../helper/gameReportHelper.js'

/**
 * How many *fresh* generations a single user may trigger per hour. Cached
 * reports don't count — re-reading an existing report is free. This exists
 * because a report is only cheap in aggregate: without a cap one account could
 * walk the whole game table and bill us for every match ever played.
 */
const MAX_GENERATIONS_PER_HOUR = 20
const RATE_WINDOW_MS = 60 * 60 * 1000

/** @type {Map<number, number[]>} user id → timestamps of recent generations */
const generationTimestamps = new Map()

/**
 * @param {number} userId
 * @returns {boolean} true when the user is still within their hourly budget
 */
function consumeRateLimit (userId) {
  const now = Date.now()
  const recent = (generationTimestamps.get(userId) || []).filter(ts => now - ts < RATE_WINDOW_MS)
  if (recent.length >= MAX_GENERATIONS_PER_HOUR) {
    generationTimestamps.set(userId, recent)
    return false
  }
  recent.push(now)
  generationTimestamps.set(userId, recent)
  return true
}

/**
 * Drop the recorded generations for a user. Exported for tests.
 * @returns {void}
 */
export function _resetRateLimit () {
  generationTimestamps.clear()
}

export default {

  /**
   * Return an already-generated report, or null when none exists yet. Cheap
   * enough to call on every overlay open — it never triggers the model.
   *
   * @param {number} gameId
   * @param {Request} [req]
   * @returns {Promise<{report: {text: string, model: string}|null, available: boolean}>}
   */
  async getGameReport (gameId, req) {
    if (!req?.user) throw new BadRequestError('Not authorised.')
    if (!gameId) throw new BadRequestError('Game id is required.')
    const locale = getLocaleFromRequest(req)
    const stored = await getStoredGameReport(gameId, locale)
    return {
      report: stored ? { text: stored.text, model: stored.model } : null,
      available: isLlmConfigured()
    }
  },

  /**
   * Generate the AI match report for a game, or return the cached one.
   *
   * @param {number} gameId
   * @param {Request} [req]
   * @returns {Promise<{report: {text: string, model: string}, cached: boolean}>}
   */
  async createGameReport (gameId, req) {
    if (!req?.user) throw new BadRequestError('Not authorised.')
    if (!gameId) throw new BadRequestError('Game id is required.')
    const locale = getLocaleFromRequest(req)

    // Serve an existing report before spending a rate-limit slot on it.
    const stored = await getStoredGameReport(gameId, locale)
    if (stored) {
      return { report: { text: stored.text, model: stored.model }, cached: true }
    }

    if (!isLlmConfigured()) {
      throw new BadRequestError('Match reports are not available on this server.')
    }
    if (!consumeRateLimit(req.user.id)) {
      throw new BadRequestError('Too many match reports requested. Please try again later.')
    }

    try {
      const { text, model, cached } = await generateGameReport(gameId, locale)
      return { report: { text, model }, cached }
    } catch (e) {
      console.error('Failed to generate game report:', e)
      throw new BadRequestError(e?.message || 'Match report could not be generated.')
    }
  }
}
