import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'

const SUPPORTED_LOCALES = ['en', 'de']

function normaliseLocale (locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : 'en'
}

function parseImages (value) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split('\n').map(v => v.trim()).filter(Boolean)
  }
  return []
}

function decodeImages (raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default {

  /**
   * Public: list wiki entries for a locale (falls back to English) for the
   * sidebar/navigation. Returns lightweight rows without the full text (#441).
   * @param {string} [locale]
   * @returns {Promise<{entries: Array<{id: number, title: string, subtitle: string|null}>}>}
   */
  async getWikiEntries (locale) {
    const loc = normaliseLocale(locale)
    let rows = await query(
      'SELECT id, title, subtitle FROM wiki_entry WHERE locale=? ORDER BY sort_order ASC, title ASC',
      [loc]
    )
    if (rows.length === 0 && loc !== 'en') {
      rows = await query(
        'SELECT id, title, subtitle FROM wiki_entry WHERE locale=? ORDER BY sort_order ASC, title ASC',
        ['en']
      )
    }
    return { entries: rows }
  },

  /**
   * Public: full content of a single wiki entry (#441).
   * @param {number} id
   * @returns {Promise<{entry: object|null}>}
   */
  async getWikiEntry (id) {
    const entryId = Number(id)
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new BadRequestError('Invalid wiki entry id')
    }
    const [entry] = await query(
      'SELECT id, locale, title, subtitle, text, images, sort_order FROM wiki_entry WHERE id=? LIMIT 1',
      [entryId]
    )
    if (!entry) return { entry: null }
    entry.images = decodeImages(entry.images)
    return { entry }
  },

  /**
   * Admin: list every wiki entry across all locales for management (#441).
   * @param {Request} req
   * @returns {Promise<{entries: Array}>}
   */
  async getAllWikiEntries (req) {
    if (!req.user?.is_admin) throw new BadRequestError('This action is only available for admins')
    const rows = await query(
      'SELECT id, locale, title, subtitle, text, images, sort_order FROM wiki_entry ORDER BY locale ASC, sort_order ASC, title ASC'
    )
    return { entries: rows.map(r => ({ ...r, images: decodeImages(r.images) })) }
  },

  /**
   * Admin: create a wiki entry (#441).
   * @returns {Promise<{id: number}>}
   */
  async createWikiEntry (locale, title, subtitle, text, images, sortOrder, req) {
    if (!req.user?.is_admin) throw new BadRequestError('This action is only available for admins')
    const loc = normaliseLocale(locale)
    const cleanTitle = typeof title === 'string' ? title.trim() : ''
    const cleanText = typeof text === 'string' ? text.trim() : ''
    if (!cleanTitle) throw new BadRequestError('Title is required')
    if (!cleanText) throw new BadRequestError('Text is required')
    const result = await query('INSERT INTO wiki_entry SET ?', {
      locale: loc,
      title: cleanTitle.slice(0, 255),
      subtitle: typeof subtitle === 'string' ? subtitle.trim().slice(0, 255) || null : null,
      text: cleanText,
      images: JSON.stringify(parseImages(images)),
      sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0
    })
    return { id: result.insertId }
  },

  /**
   * Admin: update a wiki entry (#441).
   * @returns {Promise<{success: boolean}>}
   */
  async updateWikiEntry (id, locale, title, subtitle, text, images, sortOrder, req) {
    if (!req.user?.is_admin) throw new BadRequestError('This action is only available for admins')
    const entryId = Number(id)
    if (!Number.isFinite(entryId) || entryId <= 0) throw new BadRequestError('Invalid wiki entry id')
    const cleanTitle = typeof title === 'string' ? title.trim() : ''
    const cleanText = typeof text === 'string' ? text.trim() : ''
    if (!cleanTitle) throw new BadRequestError('Title is required')
    if (!cleanText) throw new BadRequestError('Text is required')
    await query(
      'UPDATE wiki_entry SET locale=?, title=?, subtitle=?, text=?, images=?, sort_order=? WHERE id=?',
      [
        normaliseLocale(locale),
        cleanTitle.slice(0, 255),
        typeof subtitle === 'string' ? subtitle.trim().slice(0, 255) || null : null,
        cleanText,
        JSON.stringify(parseImages(images)),
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        entryId
      ]
    )
    return { success: true }
  },

  /**
   * Admin: delete a wiki entry (#441).
   * @returns {Promise<{success: boolean}>}
   */
  async deleteWikiEntry (id, req) {
    if (!req.user?.is_admin) throw new BadRequestError('This action is only available for admins')
    const entryId = Number(id)
    if (!Number.isFinite(entryId) || entryId <= 0) throw new BadRequestError('Invalid wiki entry id')
    await query('DELETE FROM wiki_entry WHERE id=?', [entryId])
    return { success: true }
  }
}
