/**
 * Shorten a team name for compact displays (tables, schedules, cup brackets, …).
 * If a user-defined short name is provided and non-empty, it wins. Otherwise
 * the function falls back to the last word of the full name.
 * E.g. "1. FC Dynamic Gütersloh" → "Gütersloh".
 * @param {string} name
 * @param {string|null|undefined} [shortName] - optional user-defined override
 * @returns {string}
 */
export function shortenTeamName (name, shortName) {
  if (typeof shortName === 'string' && shortName.trim()) {
    return shortName.trim()
  }
  if (!name) return ''
  const words = String(name).trim().split(/\s+/)
  return words[words.length - 1] || ''
}
