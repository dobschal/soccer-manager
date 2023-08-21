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

function twoDigitString (value) {
  if (value < 10) return `0${value}`
  return `${value}`
}

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]
