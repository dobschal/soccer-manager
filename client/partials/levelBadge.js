/**
 * Get the level tier class name based on player level.
 * Bronze: 1-40, Silver: 41-70, Gold: 71-100
 * @param {number} level
 * @returns {string}
 */
export function getLevelTier (level) {
  if (level > 70) return 'gold'
  if (level > 40) return 'silver'
  return 'bronze'
}

/**
 * Render a circular level badge with bronze/silver/gold coloring.
 * @param {number} level - Player level (1-100)
 * @param {object} [options]
 * @param {string} [options.size] - 'sm' (24px, for tables) or 'lg' (30px, for lineup). Default: 'sm'
 * @returns {string} HTML string
 */
export function renderLevelBadge (level, { size = 'sm' } = {}) {
  const tier = getLevelTier(level)
  const displayLevel = Number.isInteger(level) ? level : level.toFixed(1)
  return `<span class="level-badge level-badge--${size} level-badge--${tier}">${displayLevel}</span>`
}

/**
 * Get the text color for a level tier (for use in stat cards / custom displays).
 * @param {number} level
 * @returns {string} CSS color value
 */
export function getLevelColor (level) {
  if (level > 70) return '#f0c75e' // Gold
  if (level > 40) return '#d8d8d8' // Silver
  return '#daa06d' // Bronze
}
