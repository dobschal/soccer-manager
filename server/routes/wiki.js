import { query } from '../lib/database.js'
import { BadRequestError } from '../lib/errors.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { truncateChars } from '../lib/util.js'

const SUPPORTED_LOCALES = ['en', 'de']
const UPLOAD_DIR = 'uploads/wiki'
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB

function normaliseLocale (locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : 'en'
}

/**
 * Normalise the incoming images list into stored filenames. Each item is
 * either an existing filename string (kept as-is) or a `{data, type}` base64
 * upload, which is written to the persisted uploads/wiki directory (#441).
 * @param {Array} images
 * @returns {string[]}
 */
function persistWikiImages (images) {
  if (!Array.isArray(images)) return []
  const filenames = []
  let dirReady = false
  for (const img of images) {
    if (typeof img === 'string') {
      // Keep an already-stored filename (strip any path/URL prefix).
      const name = img.split('/').pop()
      if (name) filenames.push(name)
      continue
    }
    if (!img || !img.data || !img.type) continue
    if (!ALLOWED_TYPES.includes(img.type)) continue
    const base64Data = img.data.replace(/^data:[^;]+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > MAX_IMAGE_SIZE) continue
    if (!dirReady) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true })
      dirReady = true
    }
    const ext = img.type.split('/')[1].replace('jpeg', 'jpg')
    const filename = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer)
    filenames.push(filename)
  }
  return filenames
}

/**
 * Delete image files that are no longer referenced by an entry (#441).
 * @param {string[]} oldFilenames
 * @param {string[]} newFilenames
 */
function deleteRemovedImages (oldFilenames, newFilenames) {
  const keep = new Set(newFilenames)
  for (const name of oldFilenames) {
    if (keep.has(name)) continue
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, name))
    } catch {
      // file may already be gone — ignore
    }
  }
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
   * Public: full content of the wiki entry linked to an in-game page via its
   * stable page key (#456). Falls back to English when the requested locale has
   * no matching entry. Returns { entry: null } when nothing is linked.
   * @param {string} pageKey
   * @param {string} [locale]
   * @returns {Promise<{entry: object|null}>}
   */
  async getWikiArticleByPageKey (pageKey, locale) {
    const key = typeof pageKey === 'string' ? pageKey.trim() : ''
    if (!key) return { entry: null }
    const loc = normaliseLocale(locale)
    let [entry] = await query(
      'SELECT id, locale, title, subtitle, text, images, sort_order FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
      [key, loc]
    )
    if (!entry && loc !== 'en') {
      [entry] = await query(
        'SELECT id, locale, title, subtitle, text, images, sort_order FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
        [key, 'en']
      )
    }
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
      title: truncateChars(cleanTitle, 255),
      subtitle: typeof subtitle === 'string' ? truncateChars(subtitle.trim(), 255) || null : null,
      text: cleanText,
      images: JSON.stringify(persistWikiImages(images)),
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
    const [existing] = await query('SELECT images FROM wiki_entry WHERE id=? LIMIT 1', [entryId])
    const newFilenames = persistWikiImages(images)
    if (existing) deleteRemovedImages(decodeImages(existing.images), newFilenames)
    await query(
      'UPDATE wiki_entry SET locale=?, title=?, subtitle=?, text=?, images=?, sort_order=? WHERE id=?',
      [
        normaliseLocale(locale),
        truncateChars(cleanTitle, 255),
        typeof subtitle === 'string' ? truncateChars(subtitle.trim(), 255) || null : null,
        cleanText,
        JSON.stringify(newFilenames),
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
    const [existing] = await query('SELECT images FROM wiki_entry WHERE id=? LIMIT 1', [entryId])
    if (existing) deleteRemovedImages(decodeImages(existing.images), [])
    await query('DELETE FROM wiki_entry WHERE id=?', [entryId])
    return { success: true }
  }
}
