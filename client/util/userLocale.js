import { t, getLocale } from '../i18n/index.js'
import { flagUrl } from './worldCup.js'

/**
 * Human readable country name for an ISO 3166-1 alpha-2 code, translated into
 * the viewer's locale (falls back to the raw code when `Intl` has no name).
 * @param {string|null|undefined} code
 * @returns {string|null}
 */
export function countryName (code) {
  if (!code) return null
  const upper = String(code).toUpperCase()
  try {
    return new Intl.DisplayNames([getLocale()], { type: 'region' }).of(upper) || upper
  } catch {
    return upper
  }
}

/**
 * Flag image URL for an ISO 3166-1 alpha-2 code (case insensitive).
 * @param {string|null|undefined} code
 * @param {number} [width] - one of 20, 40, 80, 160, 320
 * @returns {string|null}
 */
export function countryFlagUrl (code, width = 40) {
  if (!code) return null
  return flagUrl(String(code).toLowerCase(), width)
}

/**
 * Label for a user's selected in-game language.
 * @param {string|null|undefined} language - 'en' or 'de'
 * @returns {string|null}
 */
export function languageName (language) {
  if (!language) return null
  const key = { en: 'common.english', de: 'common.german' }[String(language).toLowerCase()]
  return key ? t(key) : String(language).toUpperCase()
}
