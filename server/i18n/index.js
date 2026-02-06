import en from './en.js'
import de from './de.js'
import { query } from '../lib/database.js'

const translations = { en, de }
const DEFAULT_LOCALE = 'en'

/**
 * Get locale from request (user preference or Accept-Language header)
 * @param {Request} req
 * @returns {string}
 */
export function getLocaleFromRequest (req) {
  if (req.user?.language) return req.user.language
  const acceptLang = req.headers?.['accept-language']
  if (acceptLang) {
    const lang = acceptLang.split(',')[0]?.split('-')[0]
    if (translations[lang]) return lang
  }
  return DEFAULT_LOCALE
}

/**
 * Get locale for a specific user by ID
 * @param {number} userId
 * @returns {Promise<string>}
 */
export async function getUserLocale (userId) {
  if (!userId) return DEFAULT_LOCALE
  const [user] = await query('SELECT language FROM user WHERE id=?', [userId])
  return user?.language || DEFAULT_LOCALE
}

/**
 * Translate a key with optional parameter substitution
 * @param {string} key
 * @param {Object.<string, string|number>} params
 * @param {string} locale
 * @returns {string}
 */
export function t (key, params = {}, locale = DEFAULT_LOCALE) {
  let text = translations[locale]?.[key] || translations[DEFAULT_LOCALE][key] || key
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}

/**
 * Get all supported locales
 * @returns {string[]}
 */
export function getSupportedLocales () {
  return Object.keys(translations)
}
