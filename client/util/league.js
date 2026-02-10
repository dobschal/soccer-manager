import { t } from '../i18n/index.js'

/**
 * League subdivision keys for translation
 * Supports up to level 4 (16 leagues per level)
 * Level 0: 1 league (2^0)
 * Level 1: 2 leagues (2^1) - uses indices 0-1
 * Level 2: 4 leagues (2^2) - uses indices 0-3
 * Level 3: 8 leagues (2^3) - uses indices 0-7
 * Level 4: 16 leagues (2^4) - uses indices 0-15
 */
const subKeys = [
  'league.sub.north',
  'league.sub.south',
  'league.sub.east',
  'league.sub.west',
  'league.sub.northEast',
  'league.sub.southEast',
  'league.sub.northWest',
  'league.sub.southWest',
  'league.sub.northNorthEast',
  'league.sub.southSouthEast',
  'league.sub.northNorthWest',
  'league.sub.southSouthWest',
  'league.sub.eastNorthEast',
  'league.sub.eastSouthEast',
  'league.sub.westNorthWest',
  'league.sub.westSouthWest'
]

/**
 * Format a league for display
 * @param {number} level - The league level (0 = top division)
 * @param {number} league - The league index within the level
 * @returns {string} Formatted league name like "2. South"
 */
export function formatLeague (level, league) {
  const division = level + 1
  const subKey = subKeys[league]
  if (division === 1) {
    // Top division doesn't have subdivisions
    return `${division}. ${t('results.league')}`
  }
  if (!subKey) {
    // Fallback for leagues beyond supported subdivisions
    return `${division}. ${t('results.league')} #${league + 1}`
  }
  return `${division}. ${t('results.league')} ${t(subKey)}`
}
