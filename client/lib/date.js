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
  return format
    .replace('hh', twoDigitString(date.getHours()))
    .replace('mm', twoDigitString(date.getMinutes()))
    .replace('MMM', months[date.getMonth()])
    .replace('MM', twoDigitString(date.getMonth() + 1))
    .replace('DD', twoDigitString(date.getDate()))
    .replace('YYYY', twoDigitString(date.getFullYear()))
}

function twoDigitString (value) {
  if (value < 10) return `0${value}`
  return `${value}`
}

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]
