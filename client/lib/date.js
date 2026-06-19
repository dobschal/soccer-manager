import { t } from '../i18n/index.js'

/**
 * Format a last-active timestamp as a day-granular string with i18n.
 * Same day → "Heute aktiv", previous day → "Gestern", else "DD.MM.YYYY".
 * @param {string|Date|null|undefined} lastLogin
 * @returns {string}
 */
export function formatLastActive (lastLogin) {
  if (!lastLogin) return t('search.never')
  const date = lastLogin instanceof Date ? lastLogin : new Date(lastLogin)
  if (Number.isNaN(date.getTime())) return t('search.never')
  const now = new Date()
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (isSameDay(date, now)) return t('search.lastLoginToday')
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return t('search.lastLoginYesterday')
  return `${twoDigitString(date.getDate())}.${twoDigitString(date.getMonth() + 1)}.${date.getFullYear()}`
}

/**
 * Returns true when the given date/timestamp falls on the current calendar day.
 * @param {string|Date|null|undefined} value
 * @returns {boolean}
 */
export function isToday (value) {
  if (!value) return false
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
}

/**
 * Format a Date or Datestring into a wanted string format
 *
 * @param {string} format - e.g. "DD.MM.YYYY"
 * @param {Date|string} date
 */
export function formatDate (format, date) {
  if (typeof date === 'string') {
    date = new Date(Date.parse(date))
  }
  const now = new Date()
  const isToday = (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear())
  const yesterday = new Date(new Date().setDate(new Date().getDate() - 1))
  const isYesterday = (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear())
  if (!isToday && !isYesterday) {
    format = format.replace('WORDY', 'DD.MM.YYYY')
  }
  return format
    .replace('hh', twoDigitString(date.getHours()))
    .replace('mm', twoDigitString(date.getMinutes()))
    .replace('MMM', months[date.getMonth()])
    .replace('MM', twoDigitString(date.getMonth() + 1))
    .replace('DD', twoDigitString(date.getDate()))
    .replace('YYYY', twoDigitString(date.getFullYear()))
    .replace('WORDY', isToday ? 'Today' : isYesterday ? 'Yesterday' : 'Long ago...')
}

/**
 * @param {number} value
 * @returns {string}
 */
function twoDigitString (value) {
  if (value < 10) return `0${value}`
  return `${value}`
}

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]
