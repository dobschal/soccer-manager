import en from './en.js'
import de from './de.js'

const translations = { en, de }
let currentLocale = 'en'

/**
 * Initialize locale from localStorage or browser settings
 * @returns {void}
 */
export function initLocale () {
  const stored = localStorage.getItem('locale')
  if (stored && translations[stored]) {
    currentLocale = stored
  } else {
    const browserLang = navigator.language?.split('-')[0]
    currentLocale = translations[browserLang] ? browserLang : 'en'
  }
}

/**
 * Get the current locale
 * @returns {string}
 */
export function getLocale () {
  return currentLocale
}

/**
 * Set the current locale
 * @param {string} locale
 * @returns {void}
 */
export function setLocale (locale) {
  if (translations[locale]) {
    currentLocale = locale
    localStorage.setItem('locale', locale)
  }
}

/**
 * Translate a key with optional parameter substitution
 * @param {string} key
 * @param {Object.<string, string|number>} params
 * @returns {string}
 */
export function t (key, params = {}) {
  let text = translations[currentLocale]?.[key] || translations.en[key] || key
  for (const [k, v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}
